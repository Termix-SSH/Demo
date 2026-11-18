import { randomUUID } from "node:crypto";
import type { PluginLogger } from "@termix-ssh/plugin-sdk/backend";
import { ScimError } from "./scim/errors.js";
import {
  matches,
  parseFilter,
  simpleEquals,
  type Filter,
} from "./scim/filter.js";
import { applyPatch, readPatchBody } from "./scim/patch.js";
import {
  clientAttributes,
  groupProfile,
  groupResource,
  listResponse,
  project,
  readPaging,
  userProfile,
  userResource,
  type UserProfile,
} from "./scim/resources.js";
import type { ConnectionRow, GroupRow, Store, UserRow } from "./store.js";
import {
  usersErrorCode,
  type TermixUser,
  type UsersApi,
} from "./termix-users.js";

/** Why SCIM turned an account off, so it only turns its own back on. */
export const DISABLED_REASON = "scim";
const ADMIN_ROLE = "admin";
const SYSTEM_ROLES = new Set([ADMIN_ROLE, "user"]);

type Json = Record<string, unknown>;
type Query = Record<string, unknown>;

export interface Request {
  connection: ConnectionRow;
  /** Absolute base URL of this connection, ending in /v2/<publicId>. */
  baseUrl: string;
}

/** Comma or newline separated role names. */
export function parseRoleList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\n,]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * The roles a member should have: default roles plus those of mapped groups
 * they are in. Managed roles are the only ones ever added or taken away.
 */
export function resolveRoles(input: {
  defaultRoles: string[];
  mappedRoles: string[];
  memberRoles: string[];
  extraManaged?: string[];
  allowAdmin: boolean;
}): { desired: string[]; managed: string[]; admin: boolean | undefined } {
  const managed = new Set([
    ...input.defaultRoles,
    ...input.mappedRoles,
    ...(input.extraManaged ?? []),
  ]);
  const desired = new Set([...input.defaultRoles, ...input.memberRoles]);
  const admin =
    input.allowAdmin && managed.has(ADMIN_ROLE)
      ? desired.has(ADMIN_ROLE)
      : undefined;
  const plain = (names: Set<string>) =>
    [...names].filter((name) => !SYSTEM_ROLES.has(name));
  return { desired: plain(desired), managed: plain(managed), admin };
}

function uniqueness(detail: string): ScimError {
  return new ScimError(409, detail, "uniqueness");
}

function notFound(kind: "User" | "Group", id: string): ScimError {
  return new ScimError(404, `${kind} ${id} not found`);
}

function readFilter(query: Query): Filter | null {
  const raw = typeof query.filter === "string" ? query.filter.trim() : "";
  return raw ? parseFilter(raw) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export type Service = ReturnType<typeof createService>;

export function createService(deps: {
  store: Store;
  users: UsersApi;
  log: PluginLogger;
}) {
  const { store, users, log } = deps;

  /** Turns a failed ctx.users call into the SCIM answer it means. */
  function usersError(error: unknown): never {
    switch (usersErrorCode(error)) {
      case "username_taken":
        throw uniqueness("Another Termix account already has this userName");
      case "email_taken":
        throw uniqueness("Another Termix account already has this email");
      case "last_admin":
        throw new ScimError(
          400,
          "This is the last Termix admin and cannot be removed",
          "mutability",
        );
      case "invalid":
        throw new ScimError(
          400,
          error instanceof Error ? error.message : "Invalid value",
          "invalidValue",
        );
      default:
        throw error;
    }
  }

  async function record(
    connection: ConnectionRow,
    action: string,
    target: string | null,
    ok: boolean,
    detail?: string,
  ) {
    try {
      await store.events.add(connection.id, action, target, ok, detail);
    } catch (error) {
      log.warn(`Could not record a SCIM event: ${String(error)}`);
    }
  }

  // Roles

  async function syncMemberRoles(
    connection: ConnectionRow,
    rows: UserRow[],
    extraManaged: string[] = [],
  ): Promise<void> {
    if (rows.length === 0) return;
    const groups = await store.groups.list(connection.id);
    const mapped = groups.filter((group) => group.roleName);
    const defaultRoles = parseRoleList(connection.defaultRoles);
    const mappedRoles = mapped.map((group) => group.roleName!);
    if (defaultRoles.length + mappedRoles.length + extraManaged.length === 0)
      return;

    for (const row of rows) {
      const memberOf = new Set(await store.members.groupsOf(row.id));
      const plan = resolveRoles({
        defaultRoles,
        mappedRoles,
        memberRoles: mapped
          .filter((group) => memberOf.has(group.id))
          .map((group) => group.roleName!),
        extraManaged,
        allowAdmin: connection.allowAdmin,
      });
      try {
        if (plan.managed.length > 0) {
          await users.syncRoles(row.userId, {
            desired: plan.desired,
            managed: plan.managed,
          });
        }
        if (plan.admin !== undefined)
          await users.setAdmin(row.userId, plan.admin);
      } catch (error) {
        // One member failing, like the last admin, never stops the rest.
        log.warn(
          `Could not sync roles for SCIM user ${row.userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await record(
          connection,
          "roles",
          row.userName,
          false,
          error instanceof Error ? error.message : undefined,
        );
      }
    }
  }

  // Users

  async function renderUser(req: Request, row: UserRow): Promise<Json> {
    const groupIds = await store.members.groupsOf(row.id);
    const groups = await store.groups.byIds(groupIds);
    return userResource({
      id: row.scimId,
      attributes: row.attributes,
      active: row.active,
      groups: groups.map((group) => ({
        id: group.scimId,
        display: group.displayName,
        location: `${req.baseUrl}/Groups/${group.scimId}`,
      })),
      meta: {
        resourceType: "User",
        created: row.createdAt,
        lastModified: row.updatedAt,
        location: `${req.baseUrl}/Users/${row.scimId}`,
        version: row.version,
      },
    });
  }

  async function requireUser(req: Request, scimId: string): Promise<UserRow> {
    const row = await store.users.byScimId(req.connection.id, scimId);
    if (!row) throw notFound("User", scimId);
    return row;
  }

  async function assertFreeUserName(
    req: Request,
    profile: UserProfile,
    self: UserRow | null,
  ) {
    const holder = await store.users.byUserName(
      req.connection.id,
      profile.userName,
    );
    if (holder && holder.id !== self?.id && !holder.deletedAt) {
      throw uniqueness("A user with this userName already exists");
    }
    if (profile.externalId) {
      const live = await store.users.list(req.connection.id);
      if (
        live.some(
          (row) => row.id !== self?.id && row.externalId === profile.externalId,
        )
      ) {
        throw uniqueness("A user with this externalId already exists");
      }
    }
  }

  /** Brings the Termix account in line with the SCIM profile. */
  async function applyProfile(
    account: TermixUser,
    profile: UserProfile,
  ): Promise<void> {
    const changes: {
      username?: string;
      displayName?: string | null;
      email?: string | null;
    } = {};
    if (account.username !== profile.userName)
      changes.username = profile.userName;
    if ((account.displayName ?? null) !== profile.displayName)
      changes.displayName = profile.displayName;
    if (
      profile.email &&
      (account.email ?? "").toLowerCase() !== profile.email
    ) {
      changes.email = profile.email;
    }
    if (Object.keys(changes).length > 0) {
      try {
        await users.update(account.id, changes);
      } catch (error) {
        usersError(error);
      }
    }
    if (!profile.active && !account.disabled) {
      await users
        .setDisabled(account.id, true, DISABLED_REASON)
        .catch(usersError);
    } else if (
      profile.active &&
      account.disabled &&
      account.disabledReason === DISABLED_REASON
    ) {
      // Only undo our own disable, never one an admin made.
      await users.setDisabled(account.id, false).catch(usersError);
    }
  }

  /** An existing Termix account the connection may take over, if any. */
  async function adoptable(
    req: Request,
    profile: UserProfile,
  ): Promise<TermixUser | null> {
    const byName = await users.findByUsername(profile.userName);
    const byEmail = profile.email
      ? await users.findByEmail(profile.email)
      : null;
    if (byName && byEmail && byName.id !== byEmail.id) {
      throw uniqueness(
        "The userName and email belong to two different Termix accounts",
      );
    }
    const found = byName ?? byEmail;
    if (!found) return null;
    if (await store.users.byTermixUser(found.id)) {
      throw uniqueness("This Termix account is already linked to a SCIM user");
    }
    if (!req.connection.adoptExisting) {
      throw uniqueness(
        "A Termix account with this userName or email already exists. Turn on taking over existing accounts to link it.",
      );
    }
    if (found.isAdmin)
      throw uniqueness("Termix admins are never taken over by SCIM");
    return found;
  }

  async function createUser(req: Request, body: unknown): Promise<Json> {
    const attributes = clientAttributes(body);
    const profile = userProfile(attributes);
    const previous = await store.users.byUserName(
      req.connection.id,
      profile.userName,
    );
    if (previous && !previous.deletedAt)
      throw uniqueness("A user with this userName already exists");
    await assertFreeUserName(req, profile, previous);

    let row: UserRow;
    const revived = previous ? await users.get(previous.userId) : null;
    if (previous && revived) {
      // The provider deleted this user earlier and the account was kept.
      row = await store.users.update(previous, {
        externalId: profile.externalId,
        userName: profile.userName,
        active: profile.active,
        attributes,
        deletedAt: null,
      });
      await applyProfile(revived, profile);
    } else {
      if (previous) await store.users.remove(previous.id);
      const existing = await adoptable(req, profile);
      let account: TermixUser;
      if (existing) {
        account = existing;
      } else {
        try {
          account = await users.create({
            username: profile.userName,
            displayName: profile.displayName,
            email: profile.email,
          });
        } catch (error) {
          usersError(error);
        }
      }
      row = await store.users.insert({
        connectionId: req.connection.id,
        scimId: randomUUID(),
        userId: account.id,
        externalId: profile.externalId,
        userName: profile.userName,
        active: profile.active,
        attributes,
      });
      await applyProfile(account, profile);
    }

    await syncMemberRoles(req.connection, [row]);
    await record(
      req.connection,
      revived ? "user.restore" : "user.create",
      profile.userName,
      true,
    );
    return renderUser(req, row);
  }

  async function saveUser(
    req: Request,
    row: UserRow,
    attributes: Json,
  ): Promise<Json> {
    const profile = userProfile(attributes);
    await assertFreeUserName(req, profile, row);
    const account = await users.get(row.userId);
    if (!account) {
      // The account was removed in Termix; the provider has to create it again.
      await store.users.remove(row.id);
      throw notFound("User", row.scimId);
    }
    await applyProfile(account, profile);
    const updated = await store.users.update(row, {
      externalId: profile.externalId,
      userName: profile.userName,
      active: profile.active,
      attributes,
    });
    const action =
      row.active === profile.active
        ? "user.update"
        : profile.active
          ? "user.enable"
          : "user.disable";
    await record(req.connection, action, profile.userName, true);
    return renderUser(req, updated);
  }

  async function replaceUser(
    req: Request,
    scimId: string,
    body: unknown,
  ): Promise<Json> {
    const row = await requireUser(req, scimId);
    return saveUser(req, row, clientAttributes(body));
  }

  async function patchUser(
    req: Request,
    scimId: string,
    body: unknown,
  ): Promise<Json> {
    const row = await requireUser(req, scimId);
    const operations = readPatchBody(body);
    const current: Json = {
      ...row.attributes,
      userName: row.userName,
      active: row.active,
      ...(row.externalId ? { externalId: row.externalId } : {}),
    };
    return saveUser(
      req,
      row,
      clientAttributes(applyPatch(current, operations)),
    );
  }

  async function deleteUser(req: Request, scimId: string): Promise<void> {
    const row = await requireUser(req, scimId);
    const groupIds = await store.members.groupsOf(row.id);
    for (const groupId of groupIds)
      await store.members.remove(groupId, [row.id]);

    if (req.connection.onDelete === "delete") {
      try {
        await users.delete(row.userId);
      } catch (error) {
        if (usersErrorCode(error) !== "not_found") usersError(error);
      }
      await store.users.remove(row.id);
    } else {
      const account = await users.get(row.userId);
      if (account && !account.disabled) {
        await users
          .setDisabled(row.userId, true, DISABLED_REASON)
          .catch(usersError);
      }
      // Group roles go with the memberships; default roles stay.
      await syncMemberRoles(req.connection, [row]);
      await store.users.update(row, {
        active: false,
        deletedAt: new Date().toISOString(),
      });
    }
    await record(
      req.connection,
      "user.delete",
      row.userName,
      true,
      req.connection.onDelete,
    );
  }

  async function getUser(
    req: Request,
    scimId: string,
    query: Query,
  ): Promise<Json> {
    const row = await requireUser(req, scimId);
    return project(
      await renderUser(req, row),
      asString(query.attributes),
      asString(query.excludedAttributes),
    );
  }

  async function listUsers(req: Request, query: Query): Promise<Json> {
    const filter = readFilter(query);
    const { startIndex, count } = readPaging(query);
    const wantedName = filter ? simpleEquals(filter, "username") : null;
    let rows: UserRow[];
    if (wantedName !== null) {
      const hit = await store.users.byUserName(req.connection.id, wantedName);
      rows = hit && !hit.deletedAt ? [hit] : [];
    } else {
      rows = await store.users.list(req.connection.id);
    }

    const resources: Json[] = [];
    for (const row of rows) {
      const resource = await renderUser(req, row);
      if (!filter || matches(filter, resource)) resources.push(resource);
    }
    const page = resources.slice(startIndex - 1, startIndex - 1 + count);
    return listResponse(
      page.map((resource) =>
        project(
          resource,
          asString(query.attributes),
          asString(query.excludedAttributes),
        ),
      ),
      resources.length,
      startIndex,
    );
  }

  // Groups

  async function renderGroup(
    req: Request,
    group: GroupRow,
    withMembers: boolean,
  ): Promise<Json> {
    const memberRows = withMembers
      ? await store.users.byIds(await store.members.ofGroup(group.id))
      : [];
    return groupResource({
      id: group.scimId,
      displayName: group.displayName,
      externalId: group.externalId,
      members: memberRows
        .filter((row) => !row.deletedAt)
        .map((row) => ({
          id: row.scimId,
          display: row.userName,
          location: `${req.baseUrl}/Users/${row.scimId}`,
        })),
      meta: {
        resourceType: "Group",
        created: group.createdAt,
        lastModified: group.updatedAt,
        location: `${req.baseUrl}/Groups/${group.scimId}`,
        version: group.version,
      },
    });
  }

  function wantsMembers(query: Query): boolean {
    const excluded = (asString(query.excludedAttributes) ?? "").toLowerCase();
    return !excluded.split(",").some((name) => name.trim() === "members");
  }

  async function requireGroup(req: Request, scimId: string): Promise<GroupRow> {
    const group = await store.groups.byScimId(req.connection.id, scimId);
    if (!group) throw notFound("Group", scimId);
    return group;
  }

  async function memberRows(
    req: Request,
    scimIds: string[],
  ): Promise<UserRow[]> {
    const rows: UserRow[] = [];
    for (const scimId of new Set(scimIds)) {
      const row = await store.users.byScimId(req.connection.id, scimId);
      if (!row)
        throw new ScimError(
          400,
          `Member ${scimId} is not a user here`,
          "invalidValue",
        );
      rows.push(row);
    }
    return rows;
  }

  async function assertFreeGroupName(
    req: Request,
    displayName: string,
    self: GroupRow | null,
  ) {
    const lower = displayName.toLowerCase();
    const groups = await store.groups.list(req.connection.id);
    if (
      groups.some(
        (group) =>
          group.id !== self?.id && group.displayName.toLowerCase() === lower,
      )
    ) {
      throw uniqueness("A group with this displayName already exists");
    }
  }

  /** Sets a group's members to exactly these and fixes the changed users' roles. */
  async function setMembers(
    req: Request,
    group: GroupRow,
    wanted: UserRow[],
  ): Promise<void> {
    const have = new Set(await store.members.ofGroup(group.id));
    const want = new Set(wanted.map((row) => row.id));
    const added = [...want].filter((id) => !have.has(id));
    const removed = [...have].filter((id) => !want.has(id));
    await store.members.add(group.id, added);
    await store.members.remove(group.id, removed);
    if (group.roleName && added.length + removed.length > 0) {
      await syncMemberRoles(
        req.connection,
        await store.users.byIds([...added, ...removed]),
      );
    }
  }

  async function createGroup(req: Request, body: unknown): Promise<Json> {
    const profile = groupProfile(clientAttributes(body));
    await assertFreeGroupName(req, profile.displayName, null);
    const members = await memberRows(req, profile.members ?? []);
    const group = await store.groups.insert({
      connectionId: req.connection.id,
      scimId: randomUUID(),
      displayName: profile.displayName,
      externalId: profile.externalId,
    });
    await setMembers(req, group, members);
    await record(req.connection, "group.create", profile.displayName, true);
    return renderGroup(req, group, true);
  }

  async function saveGroup(
    req: Request,
    group: GroupRow,
    attributes: Json,
  ): Promise<Json> {
    const profile = groupProfile(attributes);
    await assertFreeGroupName(req, profile.displayName, group);
    if (profile.members !== null)
      await setMembers(req, group, await memberRows(req, profile.members));
    const updated = await store.groups.update(group, {
      displayName: profile.displayName,
      externalId: profile.externalId,
    });
    await record(req.connection, "group.update", profile.displayName, true);
    return renderGroup(req, updated, true);
  }

  async function replaceGroup(
    req: Request,
    scimId: string,
    body: unknown,
  ): Promise<Json> {
    const group = await requireGroup(req, scimId);
    const attributes = clientAttributes(body);
    // PUT replaces the whole group, so no members means none.
    if (!Array.isArray((body as Json).members)) attributes.members = [];
    else attributes.members = (body as Json).members;
    return saveGroup(req, group, attributes);
  }

  async function patchGroup(
    req: Request,
    scimId: string,
    body: unknown,
    query: Query,
  ): Promise<Json | null> {
    const group = await requireGroup(req, scimId);
    const operations = readPatchBody(body);
    const memberIds = await store.members.ofGroup(group.id);
    const current: Json = {
      displayName: group.displayName,
      ...(group.externalId ? { externalId: group.externalId } : {}),
      members: (await store.users.byIds(memberIds)).map((row) => ({
        value: row.scimId,
      })),
    };
    const next = applyPatch(current, operations);
    const attributes: Json = {
      ...clientAttributes(next),
      members: next.members ?? [],
    };
    const saved = await saveGroup(req, group, attributes);
    // Entra and Okta take 204 for a group patch; send the group only if asked.
    return asString(query.attributes) || asString(query.excludedAttributes)
      ? saved
      : null;
  }

  async function deleteGroup(req: Request, scimId: string): Promise<void> {
    const group = await requireGroup(req, scimId);
    const members = await store.users.byIds(
      await store.members.ofGroup(group.id),
    );
    await store.groups.remove(group.id);
    if (group.roleName)
      await syncMemberRoles(req.connection, members, [group.roleName]);
    await record(req.connection, "group.delete", group.displayName, true);
  }

  async function getGroup(
    req: Request,
    scimId: string,
    query: Query,
  ): Promise<Json> {
    const group = await requireGroup(req, scimId);
    return project(
      await renderGroup(req, group, wantsMembers(query)),
      asString(query.attributes),
      asString(query.excludedAttributes),
    );
  }

  async function listGroups(req: Request, query: Query): Promise<Json> {
    const filter = readFilter(query);
    const { startIndex, count } = readPaging(query);
    const withMembers = wantsMembers(query);
    const resources: Json[] = [];
    for (const group of await store.groups.list(req.connection.id)) {
      const resource = await renderGroup(req, group, withMembers);
      if (!filter || matches(filter, resource)) resources.push(resource);
    }
    const page = resources.slice(startIndex - 1, startIndex - 1 + count);
    return listResponse(
      page.map((resource) =>
        project(
          resource,
          asString(query.attributes),
          asString(query.excludedAttributes),
        ),
      ),
      resources.length,
      startIndex,
    );
  }

  // Admin side

  /** Maps a group to a role, or clears it, and fixes its members' roles. */
  async function setGroupRole(
    connection: ConnectionRow,
    group: GroupRow,
    roleName: string | null,
  ) {
    const previous = group.roleName;
    if (previous === roleName) return group;
    const updated = await store.groups.update(group, { roleName });
    const members = await store.users.byIds(
      await store.members.ofGroup(group.id),
    );
    await syncMemberRoles(connection, members, previous ? [previous] : []);
    return updated;
  }

  /** After default roles or the admin switch change, every user is synced again. */
  async function resyncConnection(
    connection: ConnectionRow,
    extraManaged: string[],
  ) {
    await syncMemberRoles(
      connection,
      await store.users.list(connection.id),
      extraManaged,
    );
  }

  return {
    createUser,
    replaceUser,
    patchUser,
    deleteUser,
    getUser,
    listUsers,
    createGroup,
    replaceGroup,
    patchGroup,
    deleteGroup,
    getGroup,
    listGroups,
    setGroupRole,
    resyncConnection,
  };
}
