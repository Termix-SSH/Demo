import { del, get, HttpError, post, put } from "../../router";
import { collection } from "../../store";

// SCIM: Entra ID and Okta pushing accounts and groups.

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60e3).toISOString();
const BASE = "https://termix.example.com/scim";

type Connection = {
  id: number;
  name: string;
  enabled: boolean;
  onDelete: "disable" | "delete";
  adoptExisting: boolean;
  allowAdmin: boolean;
  defaultRoles: string;
  lastRequestAt: string | null;
  baseUrl: string;
  userCount: number;
  groupCount: number;
};
type Group = {
  id: number;
  connectionId: number;
  displayName: string;
  roleName: string | null;
  memberCount: number;
};
type Event = {
  id: number;
  connectionId: number;
  action: string;
  target: string | null;
  ok: boolean;
  detail: string | null;
  createdAt: string;
};

const connections = collection<Connection>("scim-connections", () => [
  {
    id: 1,
    name: "Entra ID",
    enabled: true,
    onDelete: "disable",
    adoptExisting: true,
    allowAdmin: true,
    defaultRoles: "user",
    lastRequestAt: ago(4),
    baseUrl: `${BASE}/1/v2`,
    userCount: 42,
    groupCount: 4,
  },
  {
    id: 2,
    name: "Okta",
    enabled: true,
    onDelete: "delete",
    adoptExisting: false,
    allowAdmin: false,
    defaultRoles: "user",
    lastRequestAt: ago(95),
    baseUrl: `${BASE}/2/v2`,
    userCount: 9,
    groupCount: 2,
  },
]);

const groups = collection<Group>("scim-groups", () => [
  {
    id: 1,
    connectionId: 1,
    displayName: "Termix Admins",
    roleName: "admin",
    memberCount: 3,
  },
  {
    id: 2,
    connectionId: 1,
    displayName: "Platform Engineering",
    roleName: "operator",
    memberCount: 14,
  },
  {
    id: 3,
    connectionId: 1,
    displayName: "Support",
    roleName: "user",
    memberCount: 21,
  },
  {
    id: 4,
    connectionId: 1,
    displayName: "Contractors",
    roleName: null,
    memberCount: 4,
  },
  {
    id: 5,
    connectionId: 2,
    displayName: "Developers",
    roleName: "user",
    memberCount: 7,
  },
  {
    id: 6,
    connectionId: 2,
    displayName: "On Call",
    roleName: "operator",
    memberCount: 2,
  },
]);

const events = collection<Event>("scim-events", () => {
  const rows: Omit<Event, "id">[] = [
    {
      connectionId: 1,
      action: "user.create",
      target: "maya.chen",
      ok: true,
      detail: null,
      createdAt: ago(4),
    },
    {
      connectionId: 1,
      action: "roles",
      target: "maya.chen",
      ok: true,
      detail: "operator",
      createdAt: ago(4),
    },
    {
      connectionId: 1,
      action: "group.update",
      target: "Platform Engineering",
      ok: true,
      detail: null,
      createdAt: ago(5),
    },
    {
      connectionId: 1,
      action: "user.update",
      target: "daniel.ortiz",
      ok: true,
      detail: null,
      createdAt: ago(38),
    },
    {
      connectionId: 1,
      action: "user.disable",
      target: "sam.walker",
      ok: true,
      detail: null,
      createdAt: ago(140),
    },
    {
      connectionId: 1,
      action: "user.create",
      target: "priya.nair",
      ok: true,
      detail: null,
      createdAt: ago(300),
    },
    {
      connectionId: 2,
      action: "user.create",
      target: "leo.martin",
      ok: true,
      detail: null,
      createdAt: ago(95),
    },
    {
      connectionId: 2,
      action: "user.delete",
      target: "old.intern",
      ok: true,
      detail: null,
      createdAt: ago(600),
    },
  ];
  return rows.map((row, index) => ({ ...row, id: index + 1 }));
});

const roles = [
  { name: "admin", displayName: "Admin" },
  { name: "operator", displayName: "Operator" },
  { name: "user", displayName: "User" },
];

const token = () =>
  "scim_" +
  Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");

get("/plugin-api/scim/connections", () => ({
  supported: true,
  connections: connections.all(),
}));
post("/plugin-api/scim/connections", (req) => {
  const body = req.body as Partial<Connection>;
  const id = Math.max(0, ...connections.all().map((c) => c.id)) + 1;
  const connection = connections.insert({
    id,
    name: body.name ?? "New connection",
    enabled: body.enabled ?? true,
    onDelete: body.onDelete ?? "disable",
    adoptExisting: body.adoptExisting ?? false,
    allowAdmin: body.allowAdmin ?? false,
    defaultRoles: body.defaultRoles ?? "user",
    lastRequestAt: null,
    baseUrl: `${BASE}/${id}/v2`,
    userCount: 0,
    groupCount: 0,
  });
  return { connection, token: token() };
});
put("/plugin-api/scim/connections/:id", (req) => {
  const connection = connections.patch(
    req.params.id,
    req.body as Partial<Connection>,
  );
  if (!connection) throw new HttpError(404, { error: "Connection not found" });
  return { connection };
});
del("/plugin-api/scim/connections/:id", (req) => {
  connections.remove(req.params.id);
});
post("/plugin-api/scim/connections/:id/token", () => ({ token: token() }));
get("/plugin-api/scim/connections/:id/groups", (req) => ({
  groups: groups
    .all()
    .filter((group) => String(group.connectionId) === req.params.id),
}));
put("/plugin-api/scim/connections/:id/groups/:groupId", (req) => {
  const { roleName } = req.body as { roleName: string | null };
  groups.patch(req.params.groupId, { roleName });
});
get("/plugin-api/scim/connections/:id/events", (req) => ({
  events: events
    .all()
    .filter((event) => String(event.connectionId) === req.params.id),
}));
get("/plugin-api/scim/roles", () => ({ roles }));
