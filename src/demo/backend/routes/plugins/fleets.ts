import { del, get, HttpError, patch, post } from "../../router";
import { collection } from "../../store";
import { hosts } from "../hosts";
import { users } from "../auth";
import { DEMO_OFFLINE_HOSTS } from "../../../fixtures/hosts";

const P = "/plugin-api/fleets";
const stamp = new Date(Date.now() - 21 * 864e5).toISOString();

interface Fleet {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  tagRules: string[];
  syncId: string | null;
  createdAt: string;
  updatedAt: string;
  members: number[];
}

const fleets = collection<Fleet>("fleets", () => [
  {
    id: 1,
    userId: "demo-user",
    name: "Web tier",
    description: "Every public web node",
    color: "#f39044",
    icon: "Globe",
    tagRules: ["nginx"],
    syncId: null,
    createdAt: stamp,
    updatedAt: stamp,
    members: [],
  },
  {
    id: 2,
    userId: "demo-user",
    name: "Databases",
    description: "Primary and replicas",
    color: "#3b82f6",
    icon: "Database",
    tagRules: ["postgres"],
    syncId: null,
    createdAt: stamp,
    updatedAt: stamp,
    members: [5],
  },
  {
    id: 3,
    userId: "demo-user",
    name: "Homelab",
    description: null,
    color: "#22c55e",
    icon: "House",
    tagRules: [],
    syncId: null,
    createdAt: stamp,
    updatedAt: stamp,
    members: [7, 8, 9, 10],
  },
  {
    id: 4,
    userId: "demo-user",
    name: "Edge VPS",
    description: "Rented boxes in two regions",
    color: "#a855f7",
    icon: "Cloud",
    tagRules: ["vps"],
    syncId: null,
    createdAt: stamp,
    updatedAt: stamp,
    members: [],
  },
]);

function memberRows(fleet: Fleet) {
  const out = new Map<
    number,
    {
      id: number;
      name: string;
      ip: string;
      tags: string[];
      static: boolean;
      permissionLevel: null;
    }
  >();
  for (const host of hosts.all()) {
    const byTag = fleet.tagRules.some((tag) => host.tags?.includes(tag));
    const isStatic = fleet.members.includes(host.id);
    if (byTag || isStatic) {
      out.set(host.id, {
        id: host.id,
        name: host.name,
        ip: host.ip,
        tags: host.tags ?? [],
        static: isStatic,
        permissionLevel: null,
      });
    }
  }
  return [...out.values()];
}

function row(fleet: Fleet) {
  const { members: _m, ...rest } = fleet;
  return { ...rest, memberCount: memberRows(fleet).length };
}

function find(id: string): Fleet {
  const found = fleets.find(id);
  if (!found) throw new HttpError(404, { error: "Fleet not found" });
  return found;
}

function runOn(fleet: Fleet, output: (name: string) => string) {
  return memberRows(fleet).map((m) =>
    DEMO_OFFLINE_HOSTS.has(m.id)
      ? {
          hostId: m.id,
          hostName: m.name,
          success: false,
          error: "connect ETIMEDOUT",
        }
      : {
          hostId: m.id,
          hostName: m.name,
          success: true,
          output: output(m.name),
        },
  );
}

get(`${P}/`, () => fleets.all().map(row));
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
post(`${P}/`, (req) => {
  const body = req.body as Partial<Fleet>;
  const record: Fleet = {
    id: fleets.nextId(),
    userId: "demo-user",
    name: body.name ?? "Fleet",
    description: body.description ?? null,
    color: body.color ?? null,
    icon: body.icon ?? null,
    tagRules: body.tagRules ?? [],
    syncId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [],
  };
  fleets.insert(record);
  return row(record);
});
patch(`${P}/:id`, (req) =>
  row(
    fleets.patch(req.params.id, req.body as Partial<Fleet>) ??
      find(req.params.id),
  ),
);
del(`${P}/:id`, (req) => {
  fleets.remove(req.params.id);
  return { success: true };
});
get(`${P}/:id/members`, (req) => memberRows(find(req.params.id)));
post(`${P}/:id/members`, (req) => {
  const fleet = find(req.params.id);
  const { hostId } = req.body as { hostId: number };
  fleets.patch(fleet.id, { members: [...new Set([...fleet.members, hostId])] });
  return { success: true };
});
del(`${P}/:id/members/:hostId`, (req) => {
  const fleet = find(req.params.id);
  fleets.patch(fleet.id, {
    members: fleet.members.filter((m) => String(m) !== req.params.hostId),
  });
  return { success: true };
});
post(`${P}/:id/execute`, (req) => {
  const { command } = req.body as { command: string };
  const cmd = command.trim().split(/\s+/)[0];
  return {
    results: runOn(find(req.params.id), (name) =>
      cmd === "uptime"
        ? ` 10:42:11 up ${12 + name.length} days,  3:14,  1 user,  load average: 0.21, 0.18, 0.12`
        : cmd === "hostname"
          ? name
          : cmd === "df"
            ? "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       118G   57G   61G  48% /"
            : `(demo) ran "${command}" on ${name}`,
    ),
  };
});
post(`${P}/:id/transfer/push`, (req) => ({
  results: runOn(find(req.params.id), () => "Uploaded"),
}));
get(`${P}/:id/inventory`, (req) =>
  memberRows(find(req.params.id)).map((m, i) => ({
    hostId: m.id,
    hostName: m.name,
    inventory: DEMO_OFFLINE_HOSTS.has(m.id)
      ? null
      : {
          id: i + 1,
          hostId: m.id,
          userId: "demo-user",
          osPrettyName:
            m.id === 7 ? "Debian GNU/Linux 13 (trixie)" : "Ubuntu 24.04.3 LTS",
          kernel: m.id === 7 ? "6.14.8-2-pve" : "6.8.0-79-generic",
          architecture: m.id === 9 ? "aarch64" : "x86_64",
          hostname: m.name,
          uptimeSeconds: 86400 * (10 + i * 3),
          ip: m.ip,
          packageManager: "apt",
          collectedAt: new Date(Date.now() - 36e5).toISOString(),
        },
  })),
);
post(`${P}/:id/inventory`, (req) => ({
  results: runOn(find(req.params.id), () => "Inventory collected"),
}));
post(`${P}/:id/packages`, (req) => {
  const { action, package: pkg } = req.body as {
    action: string;
    package?: string;
  };
  return {
    results: runOn(find(req.params.id), () =>
      action === "upgrade-all"
        ? "4 upgraded, 0 newly installed, 0 to remove and 0 not upgraded."
        : `${action === "install" ? "Installed" : "Removed"} ${pkg ?? ""}`,
    ),
  };
});
post(`${P}/:id/share`, (req) => {
  const members = memberRows(find(req.params.id));
  const body = req.body as { permissionLevel: string };
  return {
    success: true,
    permissionLevel: body.permissionLevel,
    expiresAt: null,
    hostsShared: members.length,
    hostsTotal: members.length,
    hostResults: members.map((m) => ({ hostId: m.id, shared: true })),
  };
});
