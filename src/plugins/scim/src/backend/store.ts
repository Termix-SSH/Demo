import { and, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ctx.db.define hands tables back untyped and the drizzle handle is the
// server's own, so both are typed at this module's edge.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const EVENTS_KEPT = 200;

export interface ConnectionRow {
  id: number;
  publicId: string;
  name: string;
  enabled: boolean;
  tokenHash: string;
  onDelete: "disable" | "delete";
  adoptExisting: boolean;
  allowAdmin: boolean;
  defaultRoles: string;
  lastRequestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRow {
  id: number;
  connectionId: number;
  scimId: string;
  userId: string;
  externalId: string | null;
  userName: string;
  active: boolean;
  attributes: Record<string, unknown>;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupRow {
  id: number;
  connectionId: number;
  scimId: string;
  displayName: string;
  externalId: string | null;
  roleName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventRow {
  id: number;
  connectionId: number;
  action: string;
  target: string | null;
  ok: boolean;
  detail: string | null;
  createdAt: string;
}

export interface Tables {
  connections: Table;
  users: Table;
  groups: Table;
  members: Table;
  events: Table;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object")
    return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toUser(row: Record<string, unknown>): UserRow {
  return {
    ...(row as unknown as UserRow),
    active: !!row.active,
    attributes: parseJson(row.attributes),
  };
}

function toConnection(row: Record<string, unknown>): ConnectionRow {
  return {
    ...(row as unknown as ConnectionRow),
    enabled: !!row.enabled,
    adoptExisting: !!row.adoptExisting,
    allowAdmin: !!row.allowAdmin,
    onDelete: row.onDelete === "delete" ? "delete" : "disable",
  };
}

export type Store = ReturnType<typeof createStore>;

export function createStore(ctx: PluginContext, t: Tables) {
  const db = () => ctx.db.client<Drizzle>();
  const now = () => new Date().toISOString();
  const persist = () => ctx.db.persist();

  const connections = {
    async list(): Promise<ConnectionRow[]> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.connections)
        .orderBy(t.connections.id);
      return rows.map(toConnection);
    },
    async byId(id: number): Promise<ConnectionRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.connections)
        .where(eq(t.connections.id, id))
        .limit(1);
      return rows[0] ? toConnection(rows[0]) : null;
    },
    async byPublicId(publicId: string): Promise<ConnectionRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.connections)
        .where(eq(t.connections.publicId, publicId))
        .limit(1);
      return rows[0] ? toConnection(rows[0]) : null;
    },
    async create(
      values: Omit<
        ConnectionRow,
        "id" | "createdAt" | "updatedAt" | "lastRequestAt"
      >,
    ) {
      const stamp = now();
      await (
        await db()
      )
        .insert(t.connections)
        .values({ ...values, createdAt: stamp, updatedAt: stamp });
      await persist();
      return (await connections.byPublicId(values.publicId))!;
    },
    async update(id: number, values: Partial<ConnectionRow>) {
      await (
        await db()
      )
        .update(t.connections)
        .set({ ...values, updatedAt: now() })
        .where(eq(t.connections.id, id));
      await persist();
      return connections.byId(id);
    },
    async touch(id: number) {
      await (
        await db()
      )
        .update(t.connections)
        .set({ lastRequestAt: now() })
        .where(eq(t.connections.id, id));
      await ctx.db.persist({ lazy: true });
    },
    async remove(id: number) {
      const drizzle = await db();
      const groupIds = (
        await drizzle
          .select({ id: t.groups.id })
          .from(t.groups)
          .where(eq(t.groups.connectionId, id))
      ).map((row: { id: number }) => row.id);
      if (groupIds.length > 0) {
        await drizzle
          .delete(t.members)
          .where(inArray(t.members.groupId, groupIds));
      }
      await drizzle.delete(t.groups).where(eq(t.groups.connectionId, id));
      await drizzle.delete(t.users).where(eq(t.users.connectionId, id));
      await drizzle.delete(t.events).where(eq(t.events.connectionId, id));
      await drizzle.delete(t.connections).where(eq(t.connections.id, id));
      await persist();
    },
  };

  const users = {
    /** Live users of a connection, without the ones the provider deleted. */
    async list(connectionId: number): Promise<UserRow[]> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(
          and(
            eq(t.users.connectionId, connectionId),
            isNull(t.users.deletedAt),
          ),
        )
        .orderBy(t.users.id);
      return rows.map(toUser);
    },
    async count(connectionId: number): Promise<number> {
      return (await users.list(connectionId)).length;
    },
    async byScimId(
      connectionId: number,
      scimId: string,
    ): Promise<UserRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(
          and(
            eq(t.users.connectionId, connectionId),
            eq(t.users.scimId, scimId),
            isNull(t.users.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ? toUser(rows[0]) : null;
    },
    async byIds(ids: number[]): Promise<UserRow[]> {
      if (ids.length === 0) return [];
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(inArray(t.users.id, ids));
      return rows.map(toUser);
    },
    async byTermixUser(userId: string): Promise<UserRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(eq(t.users.userId, userId))
        .limit(1);
      return rows[0] ? toUser(rows[0]) : null;
    },
    /** Any row, deleted or not, whose userName matches without case. */
    async byUserName(
      connectionId: number,
      userName: string,
    ): Promise<UserRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(eq(t.users.connectionId, connectionId));
      const lower = userName.toLowerCase();
      const hit = rows.find(
        (row: UserRow) => row.userName.toLowerCase() === lower,
      );
      return hit ? toUser(hit) : null;
    },
    async insert(
      values: Omit<
        UserRow,
        "id" | "createdAt" | "updatedAt" | "version" | "deletedAt"
      >,
    ) {
      const stamp = now();
      await (await db()).insert(t.users).values({
        ...values,
        attributes: JSON.stringify(values.attributes),
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await persist();
      return (await users.byScimId(values.connectionId, values.scimId))!;
    },
    async update(row: UserRow, values: Partial<UserRow>) {
      const { attributes, ...rest } = values;
      await (
        await db()
      )
        .update(t.users)
        .set({
          ...rest,
          ...(attributes ? { attributes: JSON.stringify(attributes) } : {}),
          version: row.version + 1,
          updatedAt: now(),
        })
        .where(eq(t.users.id, row.id));
      await persist();
      const rows = await (
        await db()
      )
        .select()
        .from(t.users)
        .where(eq(t.users.id, row.id));
      return toUser(rows[0]);
    },
    async remove(id: number) {
      const drizzle = await db();
      await drizzle.delete(t.members).where(eq(t.members.memberId, id));
      await drizzle.delete(t.users).where(eq(t.users.id, id));
      await persist();
    },
  };

  const groups = {
    async list(connectionId: number): Promise<GroupRow[]> {
      return (await db())
        .select()
        .from(t.groups)
        .where(eq(t.groups.connectionId, connectionId))
        .orderBy(t.groups.displayName);
    },
    async byScimId(
      connectionId: number,
      scimId: string,
    ): Promise<GroupRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.groups)
        .where(
          and(
            eq(t.groups.connectionId, connectionId),
            eq(t.groups.scimId, scimId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
    async byId(id: number): Promise<GroupRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.groups)
        .where(eq(t.groups.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async byIds(ids: number[]): Promise<GroupRow[]> {
      if (ids.length === 0) return [];
      return (await db())
        .select()
        .from(t.groups)
        .where(inArray(t.groups.id, ids));
    },
    async insert(
      values: Omit<
        GroupRow,
        "id" | "createdAt" | "updatedAt" | "version" | "roleName"
      >,
    ) {
      const stamp = now();
      await (
        await db()
      )
        .insert(t.groups)
        .values({ ...values, version: 1, createdAt: stamp, updatedAt: stamp });
      await persist();
      return (await groups.byScimId(values.connectionId, values.scimId))!;
    },
    async update(row: GroupRow, values: Partial<GroupRow>) {
      await (
        await db()
      )
        .update(t.groups)
        .set({ ...values, version: row.version + 1, updatedAt: now() })
        .where(eq(t.groups.id, row.id));
      await persist();
      return (await groups.byId(row.id))!;
    },
    async remove(id: number) {
      const drizzle = await db();
      await drizzle.delete(t.members).where(eq(t.members.groupId, id));
      await drizzle.delete(t.groups).where(eq(t.groups.id, id));
      await persist();
    },
  };

  const members = {
    async ofGroup(groupId: number): Promise<number[]> {
      const rows = await (
        await db()
      )
        .select({ memberId: t.members.memberId })
        .from(t.members)
        .where(eq(t.members.groupId, groupId));
      return rows.map((row: { memberId: number }) => row.memberId);
    },
    async groupsOf(memberId: number): Promise<number[]> {
      const rows = await (
        await db()
      )
        .select({ groupId: t.members.groupId })
        .from(t.members)
        .where(eq(t.members.memberId, memberId));
      return rows.map((row: { groupId: number }) => row.groupId);
    },
    async add(groupId: number, memberIds: number[]) {
      const have = new Set(await members.ofGroup(groupId));
      const fresh = [...new Set(memberIds)].filter((id) => !have.has(id));
      if (fresh.length === 0) return;
      await (
        await db()
      )
        .insert(t.members)
        .values(fresh.map((memberId) => ({ groupId, memberId })));
      await persist();
    },
    async remove(groupId: number, memberIds: number[]) {
      if (memberIds.length === 0) return;
      await (
        await db()
      )
        .delete(t.members)
        .where(
          and(
            eq(t.members.groupId, groupId),
            inArray(t.members.memberId, memberIds),
          ),
        );
      await persist();
    },
  };

  const events = {
    async add(
      connectionId: number,
      action: string,
      target: string | null,
      ok: boolean,
      detail?: string,
    ) {
      const drizzle = await db();
      await drizzle.insert(t.events).values({
        connectionId,
        action: action.slice(0, 32),
        target: target ? target.slice(0, 255) : null,
        ok,
        detail: detail ? detail.slice(0, 500) : null,
        createdAt: now(),
      });
      const recent = await drizzle
        .select({ id: t.events.id })
        .from(t.events)
        .where(eq(t.events.connectionId, connectionId))
        .orderBy(desc(t.events.id))
        .limit(1)
        .offset(EVENTS_KEPT - 1);
      if (recent[0]) {
        await drizzle
          .delete(t.events)
          .where(
            and(
              eq(t.events.connectionId, connectionId),
              lt(t.events.id, recent[0].id),
            ),
          );
      }
      await ctx.db.persist({ lazy: true });
    },
    async list(connectionId: number, limit = 50): Promise<EventRow[]> {
      const rows = await (
        await db()
      )
        .select()
        .from(t.events)
        .where(eq(t.events.connectionId, connectionId))
        .orderBy(desc(t.events.id))
        .limit(limit);
      return rows.map((row: EventRow) => ({ ...row, ok: !!row.ok }));
    },
  };

  return { connections, users, groups, members, events };
}
