import { del, get, post, put } from "../router";
import { collection } from "../store";
import { users } from "./auth";
import { MANIFESTS, isPluginEnabled } from "./plugins";
import { DEMO_USER_ID } from "../../fixtures/hosts";

const CORE_GROUPS = [
  {
    group: "hosts",
    labelKey: "admin.rolePermissions.groups.hosts",
    permissions: [
      "hosts.view",
      "hosts.create",
      "hosts.edit",
      "hosts.delete",
      "hosts.share",
    ],
  },
  {
    group: "credentials",
    labelKey: "admin.rolePermissions.groups.credentials",
    permissions: [
      "credentials.view",
      "credentials.create",
      "credentials.edit",
      "credentials.delete",
      "credentials.share",
    ],
  },
  {
    group: "admin",
    labelKey: "admin.rolePermissions.groups.admin",
    permissions: [
      "admin.users.view",
      "admin.users.manage",
      "admin.roles.manage",
      "admin.settings.manage",
      "admin.sessions.manage",
      "admin.plugins.manage",
    ],
  },
];

function catalog() {
  const pluginGroups = Object.values(MANIFESTS)
    .filter((m) => m.contributes?.permissions?.length)
    .map((m) => ({
      group: m.id,
      pluginId: m.id,
      label: m.name,
      icon: m.icon,
      enabled: isPluginEnabled(m.id),
      permissions: m.contributes!.permissions!.map((p) => `${m.id}.${p.name}`),
      items: m.contributes!.permissions!.map((p) => ({
        permission: `${m.id}.${p.name}`,
        titleKey: p.titleKey,
        descriptionKey: p.descriptionKey,
      })),
    }));
  return [...CORE_GROUPS, ...pluginGroups];
}

function allPermissions(): string[] {
  return catalog().flatMap((g) => g.permissions);
}

const stamp = "2026-08-14T09:12:00.000Z";
const roles = collection("roles", () => [
  {
    id: 1,
    name: "admin",
    displayName: "Administrator",
    description: "Everything, including users and plugins",
    isSystem: true,
    permissions: ["*"],
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 2,
    name: "user",
    displayName: "User",
    description: "Their own hosts and credentials",
    isSystem: true,
    permissions: [
      "hosts.view",
      "hosts.create",
      "hosts.edit",
      "hosts.delete",
      "credentials.view",
      "credentials.create",
      "credentials.edit",
      "credentials.delete",
    ],
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 3,
    name: "operators",
    displayName: "Operators",
    description: "On-call engineers who connect but do not edit",
    isSystem: false,
    permissions: ["hosts.view", "credentials.view"],
    createdAt: stamp,
    updatedAt: stamp,
  },
]);
const userRoles = collection("user-roles", () => [
  { id: `${DEMO_USER_ID}:1`, userId: DEMO_USER_ID, roleId: 1 },
  { id: "user-ana:1", userId: "user-ana", roleId: 1 },
  { id: "user-marco:2", userId: "user-marco", roleId: 2 },
  { id: "user-oncall:3", userId: "user-oncall", roleId: 3 },
]);

get("/rbac/permissions/catalog", () => ({ catalog: catalog() }));
get("/rbac/permissions/me", () => ({
  permissions: ["*", ...allPermissions()],
  isAdmin: true,
}));
get("/rbac/roles", () => ({ roles: roles.all() }));
post("/rbac/roles", (req) => {
  const body = req.body as {
    name: string;
    displayName: string;
    description?: string;
  };
  const role = {
    id: roles.nextId(),
    ...body,
    description: body.description ?? null,
    isSystem: false,
    permissions: [] as string[],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  roles.insert(role as never);
  return { role };
});
put("/rbac/roles/:id", (req) => {
  const role = roles.patch(req.params.id, {
    ...(req.body as object),
    updatedAt: new Date().toISOString(),
  });
  return { role };
});
del("/rbac/roles/:id", (req) => roles.remove(req.params.id));
get("/rbac/roles/:id/members", (req) => ({
  members: userRoles
    .all()
    .filter((r) => String(r.roleId) === req.params.id)
    .map((r) => {
      const user = users.find(r.userId);
      return { userId: r.userId, username: user?.username ?? r.userId };
    }),
}));

function rolesFor(userId: string) {
  return userRoles
    .all()
    .filter((r) => r.userId === userId)
    .map((r) => {
      const role = roles.find(r.roleId);
      return {
        userId,
        roleId: r.roleId,
        roleName: role?.name ?? "",
        roleDisplayName: role?.displayName ?? "",
        grantedBy: DEMO_USER_ID,
        grantedByUsername: "demo",
        grantedAt: stamp,
      };
    });
}
get("/rbac/users/:userId/roles", (req) => ({
  roles: rolesFor(req.params.userId),
}));
post("/rbac/users/:userId/roles", (req) => {
  const { roleId } = req.body as { roleId: number };
  userRoles.insert({
    id: `${req.params.userId}:${roleId}`,
    userId: req.params.userId,
    roleId,
  });
  return { roles: rolesFor(req.params.userId) };
});
del("/rbac/users/:userId/roles/:roleId", (req) => {
  userRoles.remove(`${req.params.userId}:${req.params.roleId}`);
});

// Sharing: nothing is shared out of the box, but the editors open and save.
const access = collection<{ id: number } & Record<string, unknown>>(
  "access",
  () => [],
);
function accessFor(kind: string, targetId: string) {
  return access
    .all()
    .filter((a) => a.kind === kind && String(a.targetId) === targetId);
}
get("/rbac/host/:id/access", (req) => ({
  accessList: accessFor("host", req.params.id),
}));
get("/rbac/credential/:id/access", (req) => ({
  accessList: accessFor("credential", req.params.id),
}));
get("/rbac/folder/access", () => ({ accessList: [] }));
function share(kind: string) {
  return (req: { params: Record<string, string>; body: unknown }) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = access.nextId();
    const user = users.find(String(body.targetUserId ?? ""));
    access.insert({
      id,
      kind,
      targetId: req.params.id,
      targetType: body.targetType ?? "user",
      userId: body.targetUserId ?? null,
      roleId: body.targetRoleId ?? null,
      username: user?.username ?? null,
      roleName: null,
      roleDisplayName: null,
      grantedBy: DEMO_USER_ID,
      grantedByUsername: "demo",
      permissionLevel: body.permissionLevel ?? "connect",
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });
    return { success: true, accessId: id };
  };
}
post("/rbac/host/:id/share", share("host"));
post("/rbac/credential/:id/share", share("credential"));
post("/rbac/folder/share", () => ({ success: true }));
del("/rbac/host/:hostId/access/:accessId", (req) =>
  access.remove(req.params.accessId),
);
del("/rbac/credential/:id/access/:accessId", (req) =>
  access.remove(req.params.accessId),
);
del("/rbac/folder/access/:id", () => undefined);
get("/rbac/shared-hosts", () => ({ sharedHosts: [] }));
