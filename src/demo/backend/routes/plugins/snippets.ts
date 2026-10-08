import { del, get, HttpError, post, put } from "../../router";
import { collection } from "../../store";
import { users } from "../auth";

const P = "/plugin-api/snippets";
const stamp = new Date(Date.now() - 30 * 864e5).toISOString();

interface Snippet {
  id: number;
  userId: string;
  name: string;
  content: string;
  description: string | null;
  folder: string | null;
  order: number;
  hostFilter: string | null;
  isNote: boolean;
  createdAt: string;
  updatedAt: string;
}

function s(
  id: number,
  folder: string | null,
  name: string,
  content: string,
  description: string | null = null,
  isNote = false,
): Snippet {
  return {
    id,
    userId: "demo-user",
    name,
    content,
    description,
    folder,
    order: id,
    hostFilter: null,
    isNote,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const snippets = collection<Snippet>("snippets", () => [
  s(
    1,
    "Docker",
    "Prune unused images",
    "docker image prune -af --filter 'until=168h'",
    "Frees space from images older than a week",
  ),
  s(
    2,
    "Docker",
    "Compose redeploy",
    "cd ~/app && docker compose pull && docker compose up -d",
    "Pull new images and restart",
  ),
  s(
    3,
    "Docker",
    "Tail a service",
    "docker compose logs -f --tail=100 $INPUT_1",
    "Asks for the service name",
  ),
  s(
    4,
    "System",
    "Disk usage by folder",
    "sudo du -h --max-depth=1 / 2>/dev/null | sort -hr | head -20",
  ),
  s(5, "System", "Who is logged in", "w && last -n 10"),
  s(
    6,
    "System",
    "Upgrade packages",
    "sudo apt update && sudo apt full-upgrade -y",
    "Debian and Ubuntu",
  ),
  s(
    7,
    "Nginx",
    "Test and reload",
    "sudo nginx -t && sudo systemctl reload nginx",
  ),
  s(
    8,
    "Nginx",
    "Top client IPs",
    "awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head",
  ),
  s(9, null, "Open ports", "sudo ss -tulpn"),
  s(
    10,
    null,
    "On-call checklist",
    "1. Check the Alerts inbox\n2. Look at Host Metrics for anything red\n3. Confirm backups ran (Automations > Runs)\n4. Note anything odd in #ops",
    "Read before your shift",
    true,
  ),
]);
const folders = collection("snippet-folders", () =>
  [
    ["Docker", "#3b82f6", "box"],
    ["System", "#22c55e", "server"],
    ["Nginx", "#f39044", "globe"],
  ].map(([name, color, icon], i) => ({
    id: i + 1,
    userId: "demo-user",
    name,
    color,
    icon,
    createdAt: stamp,
    updatedAt: stamp,
  })),
);
const access = collection<
  { id: number; snippetId: number } & Record<string, unknown>
>("snippet-access", () => []);

get(`${P}/`, () => snippets.all());
get(`${P}/folders`, () => folders.all());
get(`${P}/shared`, () => ({ sharedSnippets: [] }));
get(`${P}/export`, () => ({
  snippets: snippets.all(),
  folders: folders.all(),
}));
get(`${P}/share-targets/users`, () => ({
  users: users
    .all()
    .filter((u) => u.id !== "demo-user")
    .map((u) => ({ id: u.id, username: u.username })),
}));
get(`${P}/share-targets/roles`, () => ({
  roles: [
    { id: 2, name: "user", displayName: "User" },
    { id: 3, name: "operators", displayName: "Operators" },
  ],
}));
get(`${P}/:id`, (req) => {
  const found = snippets.find(req.params.id);
  if (!found) throw new HttpError(404, { error: "Snippet not found" });
  return found;
});
post(`${P}/`, (req) => {
  const now = new Date().toISOString();
  const record = {
    ...s(snippets.nextId(), null, "", ""),
    ...(req.body as Partial<Snippet>),
    createdAt: now,
    updatedAt: now,
  } as Snippet;
  record.id = snippets.nextId();
  snippets.insert(record);
  return record;
});
put(`${P}/reorder`, (req) => {
  const { snippets: order = [] } = req.body as {
    snippets?: Array<{ id: number; order: number; folder?: string | null }>;
  };
  for (const entry of order) snippets.patch(entry.id, entry);
  return { success: true };
});
put(`${P}/folders/rename`, (req) => {
  const { oldName, newName } = req.body as { oldName: string; newName: string };
  for (const snippet of snippets.all()) {
    if (snippet.folder === oldName)
      snippets.patch(snippet.id, { folder: newName });
  }
  const folder = folders.all().find((f) => f.name === oldName);
  if (folder) folders.patch(folder.id, { name: newName });
  return { success: true };
});
put(`${P}/folders/:name/metadata`, (req) => {
  const folder = folders.all().find((f) => f.name === req.params.name);
  if (!folder) throw new HttpError(404, { error: "Folder not found" });
  return folders.patch(folder.id, req.body as object);
});
put(`${P}/folder/share`, () => ({ success: true, snippetsShared: 0 }));
put(`${P}/:id`, (req) =>
  snippets.patch(req.params.id, {
    ...(req.body as Partial<Snippet>),
    updatedAt: new Date().toISOString(),
  }),
);
del(`${P}/folders/:name`, (req) => {
  const folder = folders.all().find((f) => f.name === req.params.name);
  if (folder) folders.remove(folder.id);
  for (const snippet of snippets.all()) {
    if (snippet.folder === req.params.name)
      snippets.patch(snippet.id, { folder: null });
  }
  return { success: true };
});
del(`${P}/:id`, (req) => {
  snippets.remove(req.params.id);
  return { success: true };
});
post(`${P}/folders`, (req) => {
  const body = req.body as {
    name: string;
    color?: string | null;
    icon?: string | null;
  };
  const record = {
    id: folders.nextId(),
    userId: "demo-user",
    color: null,
    icon: null,
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  folders.insert(record as never);
  return record;
});
post(`${P}/execute`, (req) => {
  const { snippetId } = req.body as { snippetId: number };
  const snippet = snippets.find(snippetId);
  return {
    success: true,
    output: `$ ${snippet?.content ?? ""}\n(demo) The command ran. Open a terminal and send the snippet there to see real output.`,
  };
});
post(`${P}/bulk-import`, () => ({ success: true }));
post(`${P}/:id/share`, (req) => {
  const body = req.body as Record<string, unknown>;
  const user = users.find(String(body.targetUserId ?? ""));
  access.insert({
    id: access.nextId(),
    snippetId: Number(req.params.id),
    targetType: body.targetType ?? "user",
    userId: body.targetUserId ?? null,
    roleId: body.targetRoleId ?? null,
    username: user?.username ?? null,
    roleName: null,
    roleDisplayName: null,
    grantedBy: "demo-user",
    grantedByUsername: "demo",
    permissionLevel: body.permissionLevel ?? "view",
    expiresAt: null,
    createdAt: new Date().toISOString(),
  });
  return { success: true };
});
get(`${P}/:id/access`, (req) =>
  access.all().filter((a) => String(a.snippetId) === req.params.id),
);
del(`${P}/:id/access/:accessId`, (req) => {
  access.remove(req.params.accessId);
  return { success: true };
});
