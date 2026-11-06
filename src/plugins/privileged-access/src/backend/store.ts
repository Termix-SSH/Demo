import { and, desc, eq, inArray } from "drizzle-orm";
import type { PluginDatabase } from "@termix-ssh/plugin-sdk/backend";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ctx.db.define hands the table back untyped; typed at this module's edge.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type RequestStatus =
  "pending" | "approved" | "denied" | "expired" | "revoked" | "cancelled";

export interface AccessRequest {
  id: number;
  hostId: number;
  hostName: string | null;
  userId: string;
  username: string | null;
  reason: string | null;
  ticket: string | null;
  hours: number;
  status: RequestStatus;
  createdAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
  endedBy: string | null;
}

export type NewRequest = Pick<
  AccessRequest,
  "hostId" | "hostName" | "userId" | "username" | "reason" | "ticket" | "hours"
>;

export type RequestStore = ReturnType<typeof createRequestStore>;

/** Written without RETURNING so it runs the same on all three engines. */
export function createRequestStore(db: PluginDatabase, table: Table) {
  const client = () => db.client<Drizzle>();

  async function get(id: number): Promise<AccessRequest | null> {
    const drizzle = await client();
    const rows = await drizzle
      .select()
      .from(table)
      .where(eq(table.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    get,

    async create(input: NewRequest): Promise<AccessRequest> {
      const drizzle = await client();
      const createdAt = new Date().toISOString();
      await drizzle
        .insert(table)
        .values({ ...input, status: "pending", createdAt });
      const rows = await drizzle
        .select()
        .from(table)
        .where(
          and(eq(table.userId, input.userId), eq(table.hostId, input.hostId)),
        )
        .orderBy(desc(table.id))
        .limit(1);
      await db.persist();
      return rows[0];
    },

    async update(id: number, fields: Partial<AccessRequest>): Promise<void> {
      const drizzle = await client();
      await drizzle.update(table).set(fields).where(eq(table.id, id));
      await db.persist();
    },

    async byStatus(statuses: RequestStatus[]): Promise<AccessRequest[]> {
      const drizzle = await client();
      return drizzle
        .select()
        .from(table)
        .where(inArray(table.status, statuses))
        .orderBy(desc(table.id));
    },

    async forUser(userId: string, limit = 200): Promise<AccessRequest[]> {
      const drizzle = await client();
      return drizzle
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(desc(table.id))
        .limit(limit);
    },

    async all(limit = 2000): Promise<AccessRequest[]> {
      const drizzle = await client();
      return drizzle.select().from(table).orderBy(desc(table.id)).limit(limit);
    },
  };
}
