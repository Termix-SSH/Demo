import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import type {
  PluginContext,
  PluginDatabase,
} from "@termix-ssh/plugin-sdk/backend";
import type { Note, NoteInput, NoteSummary, Scope } from "../shared/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;

export interface Row {
  id: number;
  uid: string;
  scope: Scope;
  hostId: number | null;
  folder: string | null;
  userId: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function toRow(row: any): Row {
  const updated = row.updatedAt;
  return {
    id: row.id,
    uid: row.uid,
    scope: row.scope,
    hostId: row.hostId ?? null,
    folder: row.folder ?? null,
    userId: row.userId,
    title: row.title ?? "",
    body: row.body ?? "",
    tags: parseTags(row.tags),
    pinned: Boolean(row.pinned),
    updatedAt:
      updated instanceof Date ? updated.toISOString() : String(updated),
  };
}

function excerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function toSummary(
  row: Row,
  actor: string,
  canEdit: boolean,
): NoteSummary {
  return {
    uid: row.uid,
    scope: row.scope,
    hostId: row.hostId,
    folder: row.folder,
    title: row.title,
    excerpt: excerpt(row.body),
    tags: row.tags,
    pinned: row.pinned,
    mine: row.userId === actor,
    canEdit,
    updatedAt: row.updatedAt,
  };
}

export function toNote(row: Row, actor: string, canEdit: boolean): Note {
  return { ...toSummary(row, actor, canEdit), body: row.body };
}

export function createStore(
  _ctx: PluginContext,
  db: PluginDatabase,
  table: Table,
) {
  const client = () => db.client<any>();

  async function select(where: unknown): Promise<Row[]> {
    const rows = await (await client()).select().from(table).where(where);
    return rows.map(toRow);
  }

  return {
    async byUid(uid: string): Promise<Row | null> {
      const rows = await select(eq(table.uid, uid));
      return rows[0] ?? null;
    },

    forHost(hostId: number): Promise<Row[]> {
      return select(and(eq(table.scope, "host"), eq(table.hostId, hostId)));
    },

    forFolder(folder: string): Promise<Row[]> {
      return select(and(eq(table.scope, "folder"), eq(table.folder, folder)));
    },

    forUser(userId: string): Promise<Row[]> {
      return select(and(eq(table.scope, "global"), eq(table.userId, userId)));
    },

    /** Every row the user can open, for search across scopes. */
    visible(
      userId: string,
      hostIds: number[],
      folders: string[],
    ): Promise<Row[]> {
      const parts: unknown[] = [
        and(eq(table.scope, "global"), eq(table.userId, userId)),
      ];
      if (hostIds.length) {
        parts.push(
          and(eq(table.scope, "host"), inArray(table.hostId, hostIds)),
        );
      }
      if (folders.length) {
        parts.push(
          and(eq(table.scope, "folder"), inArray(table.folder, folders)),
        );
      }
      return select(or(...(parts as never[])));
    },

    async create(userId: string, input: NoteInput): Promise<Row> {
      const uid = randomUUID();
      const now = new Date().toISOString();
      await (await client()).insert(table).values({
        uid,
        scope: input.scope,
        hostId: input.scope === "host" ? (input.hostId ?? null) : null,
        folder: input.scope === "folder" ? (input.folder ?? null) : null,
        userId,
        title: input.title,
        body: input.body,
        tags: JSON.stringify(input.tags),
        pinned: input.pinned,
        createdAt: now,
        updatedAt: now,
      });
      await db.persist();
      return (await this.byUid(uid)) as Row;
    },

    async update(
      uid: string,
      patch: Partial<Pick<Row, "title" | "body" | "tags" | "pinned">>,
    ): Promise<void> {
      const set: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.body !== undefined) set.body = patch.body;
      if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
      if (patch.pinned !== undefined) set.pinned = patch.pinned;
      await (await client()).update(table).set(set).where(eq(table.uid, uid));
      await db.persist();
    },

    async remove(uid: string): Promise<void> {
      await (await client()).delete(table).where(eq(table.uid, uid));
      await db.persist();
    },

    async removeHost(hostId: number): Promise<void> {
      await (
        await client()
      )
        .delete(table)
        .where(and(eq(table.scope, "host"), eq(table.hostId, hostId)));
      await db.persist();
    },

    async removeUser(userId: string): Promise<void> {
      await (
        await client()
      )
        .delete(table)
        .where(and(eq(table.scope, "global"), eq(table.userId, userId)));
      await db.persist();
    },
  };
}

export type Store = ReturnType<typeof createStore>;
