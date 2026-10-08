import { del, get, HttpError, post, put } from "../../router";
import { collection, value } from "../../store";
import * as fs from "../../fs";
import { hosts } from "../hosts";
import { DEMO_OFFLINE_HOSTS } from "../../../fixtures/hosts";
import {
  baseName,
  homeFor,
  normalize,
  parentOf,
} from "../../../fixtures/filesystem";

const P = "/plugin-api/file-manager";

const sessions = new Map<string, { hostId: number; username: string }>();

function session(sessionId: string) {
  const found = sessions.get(sessionId);
  if (!found) throw new HttpError(400, { error: "SSH session not connected" });
  return found;
}

function resolve(sessionId: string, path: string | undefined): string {
  const { username } = session(sessionId);
  const home = homeFor(username);
  if (!path || path === "." || path === "~") return home;
  return normalize(home, path.replace(/^~(?=\/|$)/, home));
}

function months(iso: string): { text: string; ts: number } {
  const date = new Date(iso);
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return {
    text: `${names[date.getMonth()]} ${String(date.getDate()).padStart(2, " ")} ${hh}:${mm}`,
    ts: Math.floor(date.getTime() / 1000),
  };
}

function fileItem(dir: string, entry: NonNullable<ReturnType<typeof fs.stat>>) {
  const { text, ts } = months(entry.modified);
  const path = dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
  return {
    name: entry.name,
    type: entry.type,
    size: entry.type === "directory" ? undefined : entry.size,
    modified: text,
    modifiedTimestamp: ts,
    permissions: entry.mode,
    owner: entry.owner,
    group: entry.group,
    linkTarget: entry.target,
    path,
    executable: entry.type === "file" && entry.mode.includes("x"),
  };
}

const ok = (message: string, extra: Record<string, unknown> = {}) => ({
  status: "success",
  success: true,
  message,
  ...extra,
});

post(`${P}/connect`, (req) => {
  const body = req.body as {
    sessionId: string;
    hostId?: number;
    username?: string;
  };
  if (body.hostId && DEMO_OFFLINE_HOSTS.has(body.hostId)) {
    throw new HttpError(500, {
      error: "connect ETIMEDOUT",
      connectionLogs: [
        { type: "info", stage: "connect", message: "Connecting to host" },
        {
          type: "error",
          stage: "connect",
          message: "Timed out after 30s. The host did not answer.",
        },
      ],
    });
  }
  const host = body.hostId ? hosts.find(body.hostId) : undefined;
  sessions.set(body.sessionId, {
    hostId: body.hostId ?? 0,
    username: body.username || host?.username || "deploy",
  });
  return ok("SSH connection established", {
    connectionLogs: [
      {
        type: "info",
        stage: "connect",
        message: `Connecting to ${host?.ip ?? "host"}:22`,
      },
      { type: "success", stage: "auth", message: "Authenticated" },
      { type: "success", stage: "sftp", message: "SFTP channel open" },
    ],
  });
});
post(`${P}/disconnect`, (req) => {
  sessions.delete((req.body as { sessionId: string }).sessionId);
  return ok("SSH connection disconnected");
});
post(`${P}/connect-totp`, () => ok("Connected"));
post(`${P}/connect-browser-sign-in`, () => ok("Connected"));
get(`${P}/status`, (req) => ({
  status: "success",
  connected: sessions.has(req.query.sessionId),
}));
post(`${P}/keepalive`, () => ok("Alive"));
post(`${P}/sudo-password`, () => ok("Sudo password set"));

get(`${P}/listFiles`, (req) => {
  const path = resolve(req.query.sessionId, req.query.path);
  const entries = fs.list(path);
  if (!entries) throw new HttpError(404, { error: "Directory not found" });
  return { files: entries.map((e) => fileItem(path, e)), path };
});
get(`${P}/resolvePath`, (req) => ({
  resolvedPath: resolve(req.query.sessionId, req.query.path),
}));
get(`${P}/identifySymlink`, (req) => {
  const path = resolve(req.query.sessionId, req.query.path);
  const entry = fs.stat(path);
  const target = entry?.target ?? path;
  return { path, target, type: fs.isDir(target) ? "directory" : "file" };
});
get(`${P}/readFile`, (req) => {
  const path = resolve(req.query.sessionId, req.query.path);
  const body = fs.read(path);
  if (body === undefined)
    throw new HttpError(404, { error: "File not found", fileNotFound: true });
  return { content: body, path, encoding: "utf8" };
});
post(`${P}/writeFile`, (req) => {
  const { sessionId, path, content } = req.body as {
    sessionId: string;
    path: string;
    content: string;
  };
  fs.write(resolve(sessionId, path), content, session(sessionId).username);
  return ok("File written successfully");
});
post(`${P}/createFile`, (req) => {
  const {
    sessionId,
    path,
    fileName,
    content = "",
  } = req.body as Record<string, string>;
  const target = normalize(resolve(sessionId, path), fileName);
  if (fs.stat(target))
    throw new HttpError(409, { error: "A file with that name already exists" });
  fs.write(target, content, session(sessionId).username);
  return ok("File created successfully", { path: target });
});
post(`${P}/createFolder`, (req) => {
  const { sessionId, path, folderName } = req.body as Record<string, string>;
  const target = normalize(resolve(sessionId, path), folderName);
  if (fs.stat(target))
    throw new HttpError(409, {
      error: "A folder with that name already exists",
    });
  fs.mkdir(target, session(sessionId).username);
  return ok("Folder created successfully", { path: target });
});

// Trash keeps what was deleted so it can be restored.
interface TrashEntry {
  id: string;
  name: string;
  originalPath: string;
  isDirectory: boolean;
  deletedAt: string;
  size: number;
  snapshot: Record<string, string>;
}
const trash = collection<TrashEntry>("fm-trash", () => []);
const retention = value("fm-trash-retention", () => 30);

function snapshot(
  path: string,
  into: Record<string, string> = {},
): Record<string, string> {
  if (fs.isDir(path)) {
    into[`${path}/`] = "";
    for (const child of fs.list(path) ?? [])
      snapshot(`${path}/${child.name}`, into);
  } else into[path] = fs.read(path) ?? "";
  return into;
}

del(`${P}/deleteItem`, (req) => {
  const { sessionId, path, permanent } = req.body as {
    sessionId: string;
    path: string;
    permanent?: boolean;
  };
  const target = resolve(sessionId, path);
  const entry = fs.stat(target);
  if (!entry) throw new HttpError(404, { error: "Not found" });
  if (!permanent) {
    trash.insert({
      id: `t${Date.now()}`,
      name: entry.name,
      originalPath: target,
      isDirectory: entry.type === "directory",
      deletedAt: new Date().toISOString(),
      size: entry.size,
      snapshot: snapshot(target),
    });
  }
  fs.remove(target);
  return ok(permanent ? "Item deleted" : "Moved to trash");
});
get(`${P}/trash`, () => ({
  items: trash.all().map(({ snapshot: _s, ...item }) => item),
  retentionDays: retention.get(),
  canManageRetention: true,
}));
post(`${P}/trash/:id/restore`, (req) => {
  const item = trash.find(req.params.id);
  if (!item) throw new HttpError(404, { error: "Not in trash" });
  for (const [path, body] of Object.entries(item.snapshot)) {
    if (path.endsWith("/")) fs.mkdir(path.slice(0, -1));
    else fs.write(path, body);
  }
  trash.remove(item.id);
  return ok("Restored", { path: item.originalPath });
});
del(`${P}/trash/:id`, (req) => {
  trash.remove(req.params.id);
  return ok("Deleted");
});
del(`${P}/trash`, () => {
  trash.replace([]);
  return ok("Trash emptied");
});
put(`${P}/trash-retention`, (req) => {
  retention.set(Number((req.body as { days?: number }).days) || 30);
  return ok("Saved", { retentionDays: retention.get() });
});

post(`${P}/copyItem`, (req) => {
  const { sessionId, sourcePath, targetDir } = req.body as Record<
    string,
    string
  >;
  const from = resolve(sessionId, sourcePath);
  const dir = resolve(sessionId, targetDir);
  let name = baseName(from);
  if (fs.stat(`${dir}/${name}`)) {
    const dot = name.lastIndexOf(".");
    name =
      dot > 0
        ? `${name.slice(0, dot)} (copy)${name.slice(dot)}`
        : `${name} (copy)`;
  }
  fs.copy(from, `${dir === "/" ? "" : dir}/${name}`);
  return { message: "Copied", uniqueName: name, targetPath: `${dir}/${name}` };
});
put(`${P}/renameItem`, (req) => {
  const { sessionId, oldPath, newName } = req.body as Record<string, string>;
  const from = resolve(sessionId, oldPath);
  const to = `${parentOf(from) === "/" ? "" : parentOf(from)}/${newName}`;
  fs.move(from, to);
  return ok("Item renamed successfully", { newPath: to });
});
put(`${P}/moveItem`, (req) => {
  const { sessionId, oldPath, newPath } = req.body as Record<string, string>;
  fs.move(resolve(sessionId, oldPath), resolve(sessionId, newPath));
  return ok("Item moved successfully");
});
post(`${P}/changePermissions`, (req) => {
  const { sessionId, path, permissions } = req.body as Record<string, string>;
  const target = resolve(sessionId, path);
  const entry = fs.stat(target);
  if (entry) {
    const digits = String(permissions).padStart(3, "0").slice(-3);
    const map = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
    const mode =
      (entry.type === "directory" ? "d" : "-") +
      digits
        .split("")
        .map((n) => map[Number(n)] ?? "---")
        .join("");
    fs.chmod(target, mode);
  }
  return { success: true, message: "Permissions changed" };
});
post(`${P}/compressFiles`, (req) => {
  const {
    sessionId,
    paths = [],
    archiveName,
    format = "zip",
  } = req.body as {
    sessionId: string;
    paths?: string[];
    archiveName?: string;
    format?: string;
  };
  const first = resolve(sessionId, paths[0] ?? ".");
  const name =
    archiveName || `archive.${format === "tar.gz" ? "tar.gz" : format}`;
  const target = `${parentOf(first) === "/" ? "" : parentOf(first)}/${name}`;
  fs.write(target, "", session(sessionId).username);
  return { success: true, message: "Compressed", archivePath: target };
});
post(`${P}/extractArchive`, (req) => {
  const { sessionId, archivePath, extractPath } = req.body as Record<
    string,
    string
  >;
  const archive = resolve(sessionId, archivePath);
  const target = extractPath
    ? resolve(sessionId, extractPath)
    : archive.replace(/\.(zip|tar\.gz|tgz|tar)$/, "");
  fs.mkdir(target, session(sessionId).username);
  fs.write(`${target}/README.txt`, "Extracted in the demo.\n");
  return { success: true, message: "Extracted", extractPath: target };
});
post(`${P}/uploadFileChunk`, () => ok("Chunk received"));
post(`${P}/uploadFileStream`, () => ok("File uploaded successfully"));

// Recent, pinned and shortcut lists in the sidebar.
type Entry = {
  id: number;
  hostId: number;
  name: string;
  path: string;
  lastOpened?: string;
};
const lists = {
  recent: collection<Entry>("fm-recent", () => [
    {
      id: 1,
      hostId: 1,
      name: "notes.md",
      path: "/home/deploy/notes.md",
      lastOpened: new Date(Date.now() - 6e5).toISOString(),
    },
    {
      id: 2,
      hostId: 1,
      name: "nginx.conf",
      path: "/etc/nginx/nginx.conf",
      lastOpened: new Date(Date.now() - 4e6).toISOString(),
    },
    {
      id: 3,
      hostId: 1,
      name: "docker-compose.yml",
      path: "/home/deploy/docker-compose.yml",
      lastOpened: new Date(Date.now() - 9e6).toISOString(),
    },
  ]),
  pinned: collection<Entry>("fm-pinned", () => [
    { id: 1, hostId: 1, name: "deploy.sh", path: "/home/deploy/deploy.sh" },
  ]),
  shortcuts: collection<Entry>("fm-shortcuts", () => [
    { id: 1, hostId: 1, name: "nginx", path: "/etc/nginx" },
    { id: 2, hostId: 1, name: "logs", path: "/var/log" },
    { id: 3, hostId: 1, name: "app", path: "/srv/app" },
  ]),
};
for (const [kind, store] of Object.entries(lists)) {
  get(`${P}/${kind}`, (req) =>
    store
      .all()
      .filter(
        (e) => !req.query.hostId || String(e.hostId) === req.query.hostId,
      ),
  );
  post(`${P}/${kind}`, (req) => {
    const body = req.body as { hostId: number; path: string; name?: string };
    const existing = store
      .all()
      .find((e) => e.hostId === body.hostId && e.path === body.path);
    if (existing) {
      store.patch(existing.id, { lastOpened: new Date().toISOString() });
      return { success: true };
    }
    store.insert({
      id: store.nextId(),
      hostId: body.hostId,
      path: body.path,
      name: body.name ?? baseName(body.path),
      lastOpened: new Date().toISOString(),
    });
    return { success: true };
  });
  del(`${P}/${kind}`, (req) => {
    const body = (req.body ?? {}) as { hostId?: number; path?: string };
    const doomed = store
      .all()
      .find((e) => e.hostId === body.hostId && e.path === body.path);
    if (doomed) store.remove(doomed.id);
    return { success: true };
  });
}

get(`${P}/activeTransfers`, () => []);
get(`${P}/transfer-recent`, () => []);
post(`${P}/transfer-recent`, () => ({ success: true }));
post(`${P}/transferMethodPreview`, () => ({
  method: "direct",
  reason: "Both hosts can reach each other",
}));
post(`${P}/transferToHost`, () => ({
  success: true,
  transferId: `x${Date.now()}`,
}));
post(`${P}/transferCancel/:id`, () => ({ success: true }));
