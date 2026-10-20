import { desc, eq, inArray } from "drizzle-orm";
import type {
  PluginActivityEntry,
  PluginActivityProvider,
  PluginDatabase,
  PluginRecordActivityResult,
} from "@termix-ssh/plugin-sdk/backend";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const RATE_LIMIT_MS = 1000;
const KEEP_PER_USER = 100;
const MAX_LIST = 200;

/** Only the shape is checked: each tab names the types it reopens. */
function isActivityType(type: unknown): type is string {
  return typeof type === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(type);
}

/**
 * The recent activity store. Core checks that the user may reach the host
 * before it calls record, so this only validates, rate limits and stores.
 */
export function createActivityProvider(
  db: PluginDatabase,
  table: Table,
  onError: (message: string, error: unknown) => void,
): PluginActivityProvider {
  const client = () => db.client<Drizzle>();
  const lastLogged = new Map<string, number>();

  return {
    record: async (
      userId,
      { type, hostId, hostName },
    ): Promise<PluginRecordActivityResult> => {
      if (!isActivityType(type)) return { status: "invalid_type" };

      const key = `${userId}:${hostId}:${type}`;
      const now = Date.now();
      const last = lastLogged.get(key);
      if (last && now - last < RATE_LIMIT_MS) return { status: "rate_limited" };
      lastLogged.set(key, now);
      if (lastLogged.size > 10000) {
        for (const [k, at] of lastLogged) {
          if (now - at > RATE_LIMIT_MS * 2) lastLogged.delete(k);
        }
      }

      const drizzle = await client();
      const rows = await drizzle
        .insert(table)
        .values({ userId, type, hostId, hostName })
        .returning({ id: table.id });
      const id = rows[0]?.id as number;

      // Best effort: a failed trim must not fail the log itself.
      try {
        const all = await drizzle
          .select({ id: table.id })
          .from(table)
          .where(eq(table.userId, userId))
          .orderBy(desc(table.timestamp), desc(table.id));
        const stale = all
          .slice(KEEP_PER_USER)
          .map((row: { id: number }) => row.id);
        if (stale.length > 0) {
          await drizzle.delete(table).where(inArray(table.id, stale));
        }
      } catch (error) {
        onError("Failed to trim recent activity", error);
      }

      return { status: "logged", id };
    },

    list: async (userId, limit): Promise<PluginActivityEntry[]> => {
      const drizzle = await client();
      const rows = await drizzle
        .select()
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(desc(table.timestamp), desc(table.id))
        .limit(Math.min(MAX_LIST, Math.max(1, limit)));
      return rows as PluginActivityEntry[];
    },

    deleteByUserId: async (userId) => {
      const drizzle = await client();
      await drizzle.delete(table).where(eq(table.userId, userId));
    },

    deleteByHostIds: async (hostIds) => {
      if (hostIds.length === 0) return;
      const drizzle = await client();
      await drizzle.delete(table).where(inArray(table.hostId, hostIds));
    },
  };
}
