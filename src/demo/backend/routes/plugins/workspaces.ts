import { del, get, HttpError, patch, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/workspaces";

type Tab = [
  slotId: string,
  type: string,
  hostId: number,
  name: string,
  label: string,
];

function payload(tabs: Tab[], split?: { mode: "columns" | "rows" }) {
  const snapshots = tabs.map(([slotId, type, hostId, name, label]) => ({
    slotId,
    type,
    hostSyncId: `demo-host-${hostId}`,
    hostNameSnapshot: name,
    label,
  }));
  return {
    version: 1,
    tabs: snapshots,
    activeSlotId: split ? null : (snapshots[0]?.slotId ?? null),
    ...(split
      ? {
          splitMode: split.mode === "columns" ? "2-vertical" : "2-horizontal",
          paneTabIds: snapshots.slice(0, 2).map((t) => t.slotId),
        }
      : {}),
  };
}

const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

interface Workspace {
  id: number;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  kind: "manual" | "last_session";
  isDefault: boolean;
  payload: ReturnType<typeof payload>;
  syncId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  tabCount: number;
}

function ws(
  id: number,
  name: string,
  color: string,
  icon: string,
  tabs: Tab[],
  days: number,
  isDefault = false,
): Workspace {
  return {
    id,
    userId: "demo-user",
    name,
    color,
    icon,
    kind: "manual",
    isDefault,
    payload: payload(tabs),
    syncId: null,
    createdAt: ago(days + 10),
    updatedAt: ago(days),
    lastUsedAt: ago(days),
    tabCount: tabs.length,
  };
}

const workspaces = collection<Workspace>("workspaces", () => [
  ws(
    1,
    "Web stack",
    "#f39044",
    "Globe",
    [
      ["a", "terminal", 1, "web-01", "web-01"],
      ["b", "terminal", 2, "web-02", "web-02"],
      ["c", "docker", 1, "web-01", "web-01"],
      ["d", "files", 1, "web-01", "web-01"],
    ],
    1,
  ),
  ws(
    2,
    "Database on-call",
    "#3b82f6",
    "Database",
    [
      ["a", "terminal", 3, "db-primary", "db-primary"],
      ["b", "terminal", 4, "db-replica", "db-replica"],
      ["c", "host-metrics", 3, "db-primary", "db-primary"],
    ],
    3,
  ),
  ws(
    3,
    "Homelab",
    "#22c55e",
    "House",
    [
      ["a", "host-metrics", 7, "proxmox", "proxmox"],
      ["b", "terminal", 8, "nas", "nas"],
      ["c", "terminal", 9, "pihole", "pihole"],
    ],
    6,
  ),
]);

let lastSession: Workspace | null = null;

function find(id: string): Workspace {
  const found = workspaces.find(id);
  if (!found) throw new HttpError(404, { error: "Workspace not found" });
  return found;
}

function tabCount(p: { tabs?: unknown[] }): number {
  return Array.isArray(p?.tabs) ? p.tabs.length : 0;
}

get(`${P}/`, () => workspaces.all());
post(`${P}/`, (req) => {
  const body = req.body as {
    name: string;
    color?: string | null;
    icon?: string | null;
    payload: Workspace["payload"];
  };
  const now = new Date().toISOString();
  const record: Workspace = {
    id: workspaces.nextId(),
    userId: "demo-user",
    name: body.name,
    color: body.color ?? null,
    icon: body.icon ?? null,
    kind: "manual",
    isDefault: false,
    payload: body.payload,
    syncId: null,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    tabCount: tabCount(body.payload),
  };
  workspaces.insert(record);
  return record;
});
get(`${P}/last-session`, () => lastSession);
put(`${P}/last-session`, (req) => {
  const { payload: p } = req.body as { payload: Workspace["payload"] };
  const now = new Date().toISOString();
  lastSession = {
    id: 0,
    userId: "demo-user",
    name: "Last session",
    color: null,
    icon: null,
    kind: "last_session",
    isDefault: false,
    payload: p,
    syncId: null,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
    tabCount: tabCount(p),
  };
  return lastSession;
});
patch(`${P}/:id`, (req) =>
  workspaces.patch(req.params.id, {
    ...(req.body as object),
    updatedAt: new Date().toISOString(),
  }),
);
put(`${P}/:id/content`, (req) => {
  const { payload: p } = req.body as { payload: Workspace["payload"] };
  return workspaces.patch(req.params.id, {
    payload: p,
    tabCount: tabCount(p),
    updatedAt: new Date().toISOString(),
  });
});
del(`${P}/:id`, (req) => {
  workspaces.remove(req.params.id);
  return { success: true };
});
post(`${P}/:id/duplicate`, (req) => {
  const source = find(req.params.id);
  const record = {
    ...source,
    id: workspaces.nextId(),
    name: (req.body as { name: string }).name,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
  workspaces.insert(record);
  return record;
});
post(`${P}/:id/set-default`, (req) => {
  for (const w of workspaces.all())
    workspaces.patch(w.id, { isDefault: String(w.id) === req.params.id });
  return find(req.params.id);
});
post(`${P}/:id/unset-default`, (req) =>
  workspaces.patch(req.params.id, { isDefault: false }),
);
post(`${P}/:id/apply`, (req) =>
  workspaces.patch(req.params.id, { lastUsedAt: new Date().toISOString() }),
);
