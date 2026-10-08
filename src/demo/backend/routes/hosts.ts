import { del, get, HttpError, patch, post, put } from "../router";
import { collection, value } from "../store";
import {
  DEMO_FOLDERS,
  DEMO_HOSTS,
  DEMO_OFFLINE_HOSTS,
  DEMO_USER_ID,
} from "../../fixtures/hosts";
import { DEMO_CREDENTIALS } from "../../fixtures/credentials";
import {
  defaultHostSidebarPreferences,
  sanitizeHostSidebarPreferences,
} from "@/types/host-sidebar-preferences";
import {
  defaultCredentialSidebarPreferences,
  sanitizeCredentialSidebarPreferences,
} from "@/types/credential-sidebar-preferences";

type HostRecord = (typeof DEMO_HOSTS)[number] & Record<string, unknown>;

export const hosts = collection<HostRecord>("hosts", () =>
  DEMO_HOSTS.map((h) => ({ ...h })),
);
export const credentials = collection("credentials", () =>
  DEMO_CREDENTIALS.map((c) => ({ ...c })),
);
type FolderRecord = {
  id: number;
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  credentialId: number | null;
  localOnly: boolean;
  createdAt: string;
  updatedAt: string;
};
const folders = collection<FolderRecord>("folders", () =>
  DEMO_FOLDERS.map((f, i) => ({
    id: i + 1,
    userId: DEMO_USER_ID,
    name: f.name,
    color: f.color ?? undefined,
    icon: f.icon ?? undefined,
    sortOrder: i,
    credentialId: null as number | null,
    localOnly: false,
    createdAt: "2026-08-14T09:12:00.000Z",
    updatedAt: "2026-08-14T09:12:00.000Z",
  })),
);
const tags = value<string[]>("host-tags", () => [
  "nginx",
  "edge",
  "postgres",
  "redis",
  "docker",
  "vps",
]);
const statusInterval = value("status-interval", () => 30);

const SECRET_FIELDS = [
  "password",
  "key",
  "keyPassword",
  "sudoPassword",
  "socks5Password",
];

/** What the API returns: secrets stripped, flags for what is stored. */
export function publicHost(record: HostRecord): HostRecord {
  const out = { ...record };
  for (const field of SECRET_FIELDS) delete out[field];
  return out;
}

const DEFAULT_PLUGIN_SETTINGS: Record<string, Record<string, unknown>> = {
  "ssh-terminal": { enableTerminal: true },
  "file-manager": { enableFileManager: true },
};

function fromBody(body: Record<string, unknown>, existing?: HostRecord) {
  const now = new Date().toISOString();
  const next: Record<string, unknown> = { ...(existing ?? {}), ...body };
  for (const field of SECRET_FIELDS) {
    if (typeof body[field] === "string" && body[field]) {
      const flag = `has${field[0].toUpperCase()}${field.slice(1)}`;
      next[flag] = true;
    }
    delete next[field];
  }
  if (typeof next.tags === "string") {
    next.tags = (next.tags as string).split(",").filter(Boolean);
  }
  next.folder = next.parentHostId
    ? (existing?.folder ?? "")
    : (next.folder ?? "");
  next.port = Number(next.port ?? next.sshPort ?? 22);
  next.sshPort = Number(next.sshPort ?? next.port);
  next.updatedAt = now;
  next.pluginSettings = {
    ...DEFAULT_PLUGIN_SETTINGS,
    ...(existing?.pluginSettings ?? {}),
    ...((body.pluginSettings as Record<string, Record<string, unknown>>) ?? {}),
  };
  return next as HostRecord;
}

function parseHostBody(body: unknown): Record<string, unknown> {
  if (body instanceof FormData) {
    const data = body.get("data");
    return typeof data === "string" ? JSON.parse(data) : {};
  }
  return (body ?? {}) as Record<string, unknown>;
}

get("/host/db/host", () => hosts.all().map(publicHost));
get("/host/db/host/:id", (req) => {
  const host = hosts.find(req.params.id);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  return publicHost(host);
});
get("/host/db/host/:id/export", (req) => {
  const host = hosts.find(req.params.id);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  return publicHost(host);
});
post("/host/db/host", (req) => {
  const body = parseHostBody(req.body);
  const now = new Date().toISOString();
  const record = fromBody(
    {
      tags: [],
      pin: false,
      enableSsh: true,
      connectionType: "ssh",
      jumpHosts: [],
      ...body,
      id: hosts.nextId(),
      userId: DEMO_USER_ID,
      createdAt: now,
    },
    undefined,
  );
  hosts.insert(record);
  return publicHost(record);
});
put("/host/db/host/:id", (req) => {
  const existing = hosts.find(req.params.id);
  if (!existing) throw new HttpError(404, { error: "Host not found" });
  const record = fromBody(parseHostBody(req.body), existing);
  hosts.patch(existing.id, record);
  return publicHost(hosts.find(existing.id)!);
});
del("/host/db/host/:id", (req) => {
  hosts.remove(req.params.id);
  for (const child of hosts.all()) {
    if (String(child.parentHostId) === req.params.id) {
      hosts.patch(child.id, { parentHostId: null });
    }
  }
  return { message: "Host deleted" };
});
del("/host/db/host/:id/credential", (req) => {
  hosts.patch(req.params.id, { credentialId: undefined, authType: "password" });
});
post("/host/db/host/:id/reset-defaults", (req) => {
  hosts.patch(req.params.id, { defaultOverrides: null });
});
put("/host/reorder", (req) => {
  const { hosts: order } = (req.body ?? {}) as {
    hosts?: Array<{ id: number; sortOrder: number; folder?: string }>;
  };
  for (const entry of order ?? []) {
    hosts.patch(entry.id, {
      sortOrder: entry.sortOrder,
      ...(entry.folder !== undefined ? { folder: entry.folder } : {}),
    });
  }
  return { updated: order?.length ?? 0 };
});
patch("/host/bulk-update", (req) => {
  const { hostIds = [], updates = {} } = (req.body ?? {}) as {
    hostIds?: number[];
    updates?: Record<string, unknown>;
  };
  for (const id of hostIds) {
    const existing = hosts.find(id);
    if (existing) hosts.patch(id, fromBody(updates, existing));
  }
  return { updated: hostIds.length, failed: 0, errors: [] };
});
post("/host/bulk-import", (req) => {
  const { hosts: incoming = [] } = (req.body ?? {}) as {
    hosts?: Record<string, unknown>[];
  };
  for (const body of incoming) {
    hosts.insert(
      fromBody({
        tags: [],
        ...body,
        id: hosts.nextId(),
        userId: DEMO_USER_ID,
        createdAt: new Date().toISOString(),
      }),
    );
  }
  return {
    message: "Imported",
    success: incoming.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
});
post("/host/ssh-config-import", () => ({
  message: "Imported",
  success: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  errors: [],
}));
post("/host/db/proxy/test", () => ({ success: true, latencyMs: 42 }));

// Folders
function folderNames(): string[] {
  const names = new Set(folders.all().map((f) => f.name));
  for (const host of hosts.all()) if (host.folder) names.add(host.folder);
  return [...names];
}

get("/host/folders", () => folders.all());
get("/host/db/folders/with-stats", () =>
  folderNames().map((name) => ({
    name,
    hostCount: hosts.all().filter((h) => h.folder === name).length,
  })),
);
put("/host/folders/rename", (req) => {
  const { oldName, newName } = req.body as { oldName: string; newName: string };
  for (const host of hosts.all()) {
    if (host.folder === oldName || host.folder.startsWith(`${oldName} / `)) {
      hosts.patch(host.id, {
        folder: newName + host.folder.slice(oldName.length),
      });
    }
  }
  const folder = folders.all().find((f) => f.name === oldName);
  if (folder) folders.patch(folder.id, { name: newName });
  return { success: true };
});
put("/host/folders/metadata", (req) => {
  const body = req.body as {
    name: string;
    color?: string;
    icon?: string;
    credentialId?: number | null;
  };
  const folder = folders.all().find((f) => f.name === body.name);
  if (folder) folders.patch(folder.id, body);
  else
    folders.insert({
      id: folders.nextId(),
      userId: DEMO_USER_ID,
      sortOrder: folders.all().length,
      localOnly: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      credentialId: null,
      ...body,
    });
});
put("/host/folders/reorder", (req) => {
  const { positions = [] } = req.body as {
    positions?: { name: string; sortOrder: number }[];
  };
  for (const p of positions) {
    const folder = folders.all().find((f) => f.name === p.name);
    if (folder) folders.patch(folder.id, { sortOrder: p.sortOrder });
  }
  return { updated: positions.length };
});
del("/host/folders/:name/hosts", (req) => {
  const doomed = hosts.all().filter((h) => h.folder === req.params.name);
  doomed.forEach((h) => hosts.remove(h.id));
  return { deletedCount: doomed.length };
});

// Tags
get("/host/tags", () => ({ tags: tags.get() }));
put("/host/tags", (req) => {
  const { tags: next = [] } = req.body as { tags?: string[] };
  return { tags: tags.set(next) };
});

// Status
function statusFor(id: number) {
  return {
    status: DEMO_OFFLINE_HOSTS.has(id) ? "offline" : "online",
    lastChecked: new Date().toISOString(),
  };
}
get("/host/status", () =>
  Object.fromEntries(hosts.all().map((h) => [h.id, statusFor(h.id)])),
);
get("/host/status/settings", () => ({
  statusCheckInterval: statusInterval.get(),
}));
put("/host/status/settings", (req) => {
  const { statusCheckInterval } = req.body as { statusCheckInterval: number };
  return { statusCheckInterval: statusInterval.set(statusCheckInterval) };
});
post("/host/status/refresh", () => ({ message: "Status checks restarted" }));
get("/host/status/:id", (req) => statusFor(Number(req.params.id)));

// Sidebar preferences
const hostSidebar = value("host-sidebar", () =>
  defaultHostSidebarPreferences(),
);
const credentialSidebar = value("credential-sidebar", () =>
  defaultCredentialSidebarPreferences(),
);
get("/host-sidebar/preferences", () => ({ preferences: hostSidebar.get() }));
put("/host-sidebar/preferences", (req) => {
  const merged = sanitizeHostSidebarPreferences({
    ...hostSidebar.get(),
    ...(((req.body as { preferences?: object })?.preferences ??
      req.body ??
      {}) as object),
  });
  return { success: true, preferences: hostSidebar.set(merged) };
});
get("/credential-sidebar/preferences", () => ({
  preferences: credentialSidebar.get(),
}));
put("/credential-sidebar/preferences", (req) => {
  const merged = sanitizeCredentialSidebarPreferences({
    ...credentialSidebar.get(),
    ...(((req.body as { preferences?: object })?.preferences ??
      req.body ??
      {}) as object),
  });
  return { success: true, preferences: credentialSidebar.set(merged) };
});
