import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, ne } from "drizzle-orm";
import type { PluginDatabase } from "@termix-ssh/plugin-sdk/backend";

type WorkspaceKind = "manual" | "last_session";

export interface WorkspaceRecord {
  id: number;
  userId: string;
  name: string;
  color: string | null;
  icon: string | null;
  kind: WorkspaceKind;
  isDefault: boolean;
  payload: string;
  syncId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface WorkspaceCreateInput {
  name: string;
  color?: string | null;
  icon?: string | null;
  payload: string;
}

export interface WorkspaceUpdateInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// The table comes from ctx.db.define, which the SDK hands back untyped, and
// the drizzle handle is the server's own. Typed at this module's edge instead.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

/**
 * Per-user workspace storage.
 *
 * Written without RETURNING so it runs the same on all three engines: an
 * insert is read back by the sync id it was given, an update by its id.
 */
export function createWorkspaceRepository(db: PluginDatabase, table: Table) {
  const client = () => db.client<Drizzle>();

  async function findById(
    userId: string,
    id: number,
  ): Promise<WorkspaceRecord | null> {
    const drizzle = await client();
    const rows = await drizzle
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .limit(1);
    return (rows[0] as WorkspaceRecord) ?? null;
  }

  async function findBySyncId(syncId: string): Promise<WorkspaceRecord> {
    const drizzle = await client();
    const rows = await drizzle
      .select()
      .from(table)
      .where(eq(table.syncId, syncId))
      .limit(1);
    return rows[0] as WorkspaceRecord;
  }

  async function findLastSession(
    userId: string,
  ): Promise<WorkspaceRecord | null> {
    const drizzle = await client();
    const rows = await drizzle
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.kind, "last_session")))
      .orderBy(asc(table.id))
      .limit(1);
    return (rows[0] as WorkspaceRecord) ?? null;
  }

  // Autosaves for one user run one at a time, so two can't both insert.
  const lastSessionQueue = new Map<string, Promise<unknown>>();
  function serialized<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = lastSessionQueue.get(userId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const settled = next.catch(() => {});
    lastSessionQueue.set(userId, settled);
    void settled.then(() => {
      if (lastSessionQueue.get(userId) === settled) {
        lastSessionQueue.delete(userId);
      }
    });
    return next;
  }

  async function insert(
    userId: string,
    values: Omit<
      WorkspaceRecord,
      "id" | "userId" | "syncId" | "createdAt" | "updatedAt" | "lastUsedAt"
    >,
    now: string,
  ): Promise<WorkspaceRecord> {
    const syncId = randomUUID();
    const drizzle = await client();
    await drizzle
      .insert(table)
      .values({ ...values, userId, syncId, createdAt: now, updatedAt: now });
    await db.persist();
    return findBySyncId(syncId);
  }

  async function write(
    userId: string,
    id: number,
    values: Record<string, unknown>,
  ): Promise<WorkspaceRecord | null> {
    const drizzle = await client();
    await drizzle
      .update(table)
      .set(values)
      .where(and(eq(table.id, id), eq(table.userId, userId)));
    await db.persist();
    return findById(userId, id);
  }

  /** A manual workspace the user owns, or null. Last Session is not editable. */
  async function findManual(
    userId: string,
    id: number,
  ): Promise<WorkspaceRecord | null> {
    const existing = await findById(userId, id);
    return existing && existing.kind === "manual" ? existing : null;
  }

  return {
    findById,
    findLastSession,

    async listByUser(userId: string): Promise<WorkspaceRecord[]> {
      const drizzle = await client();
      return drizzle.select().from(table).where(eq(table.userId, userId));
    },

    upsertLastSession(
      userId: string,
      payload: string,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord> {
      return serialized(userId, async () => {
        const existing = await findLastSession(userId);
        if (existing) {
          return write(userId, existing.id, { payload, updatedAt: now });
        }
        const created = await insert(
          userId,
          {
            name: "Last Session",
            color: null,
            icon: null,
            kind: "last_session",
            isDefault: false,
            payload,
          },
          now,
        );
        // Another server sharing the database may have inserted one too.
        // Keep the oldest row and drop the rest.
        const first = await findLastSession(userId);
        if (first && first.id !== created.id) {
          const drizzle = await client();
          await drizzle
            .delete(table)
            .where(
              and(
                eq(table.userId, userId),
                eq(table.kind, "last_session"),
                gt(table.id, first.id),
              ),
            );
          await db.persist();
          return write(userId, first.id, { payload, updatedAt: now });
        }
        return created;
      });
    },

    async create(
      userId: string,
      input: WorkspaceCreateInput,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord> {
      return insert(
        userId,
        {
          name: input.name,
          color: input.color ?? null,
          icon: input.icon ?? null,
          kind: "manual",
          isDefault: false,
          payload: input.payload,
        },
        now,
      );
    },

    async update(
      userId: string,
      id: number,
      input: WorkspaceUpdateInput,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord | null> {
      const existing = await findManual(userId, id);
      if (!existing) return null;
      return write(userId, id, {
        name: input.name ?? existing.name,
        color: input.color === undefined ? existing.color : input.color,
        icon: input.icon === undefined ? existing.icon : input.icon,
        updatedAt: now,
      });
    },

    async updateContent(
      userId: string,
      id: number,
      payload: string,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord | null> {
      if (!(await findManual(userId, id))) return null;
      return write(userId, id, { payload, updatedAt: now });
    },

    async setDefault(
      userId: string,
      id: number,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord | null> {
      if (!(await findManual(userId, id))) return null;
      const drizzle = await client();
      await drizzle
        .update(table)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.isDefault, true),
            ne(table.id, id),
          ),
        );
      return write(userId, id, { isDefault: true, updatedAt: now });
    },

    async unsetDefault(
      userId: string,
      id: number,
      now = new Date().toISOString(),
    ): Promise<WorkspaceRecord | null> {
      if (!(await findManual(userId, id))) return null;
      return write(userId, id, { isDefault: false, updatedAt: now });
    },

    async touchLastUsed(
      userId: string,
      id: number,
      now = new Date().toISOString(),
    ): Promise<void> {
      await write(userId, id, { lastUsedAt: now });
    },

    async delete(userId: string, id: number): Promise<boolean> {
      if (!(await findManual(userId, id))) return false;
      const drizzle = await client();
      await drizzle
        .delete(table)
        .where(and(eq(table.id, id), eq(table.userId, userId)));
      await db.persist();
      return true;
    },
  };
}
