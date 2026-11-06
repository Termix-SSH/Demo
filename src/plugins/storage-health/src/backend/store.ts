import { desc, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostConfig, StorageEvent } from "../shared/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const EVENT_LIMIT = 300;

export interface HostRow extends HostConfig {
  id: number;
  userId: string;
}

export type ConfigInput = Omit<HostConfig, "hostId">;

export const DEFAULT_CONFIG: ConfigInput = {
  alerts: true,
  intervalMin: 15,
  tempWarnC: 0,
  tempCritC: 0,
  wearWarnPct: 80,
  thinWarnPct: 90,
};

export interface Store {
  all: () => Promise<HostRow[]>;
  get: (hostId: number) => Promise<HostRow | null>;
  /** Creates the row on first use. */
  ensure: (hostId: number, userId: string) => Promise<HostRow>;
  update: (hostId: number, config: ConfigInput) => Promise<void>;
  remove: (hostId: number) => Promise<void>;
  addEvent: (hostId: number, type: string, text: string) => Promise<void>;
  events: (hostId: number, limit?: number) => Promise<StorageEvent[]>;
}

export function createStore(
  ctx: PluginContext,
  hosts: Table,
  events: Table,
): Store {
  const db = () => ctx.db.client<Drizzle>();

  const store: Store = {
    async all() {
      return (await (await db()).select().from(hosts)) as HostRow[];
    },
    async get(hostId) {
      const rows = (await (
        await db()
      )
        .select()
        .from(hosts)
        .where(eq(hosts.hostId, hostId))) as HostRow[];
      return rows[0] ?? null;
    },
    async ensure(hostId, userId) {
      const known = await store.get(hostId);
      if (known) return known;
      await (await db()).insert(hosts).values({ hostId, userId });
      await ctx.db.persist();
      const made = await store.get(hostId);
      if (!made) throw new Error("Could not save the host");
      return made;
    },
    async update(hostId, config) {
      await (
        await db()
      )
        .update(hosts)
        .set({
          alerts: config.alerts,
          intervalMin: config.intervalMin,
          tempWarnC: config.tempWarnC,
          tempCritC: config.tempCritC,
          wearWarnPct: config.wearWarnPct,
          thinWarnPct: config.thinWarnPct,
        })
        .where(eq(hosts.hostId, hostId));
      await ctx.db.persist();
    },
    async remove(hostId) {
      const client = await db();
      await client.delete(events).where(eq(events.hostId, hostId));
      await client.delete(hosts).where(eq(hosts.hostId, hostId));
      await ctx.db.persist();
    },
    async addEvent(hostId, type, text) {
      const client = await db();
      await client.insert(events).values({
        hostId,
        at: Date.now(),
        type,
        text: text.slice(0, 300),
      });
      const old = (await client
        .select({ id: events.id })
        .from(events)
        .where(eq(events.hostId, hostId))
        .orderBy(desc(events.at), desc(events.id))
        .limit(10_000)
        .offset(EVENT_LIMIT)) as Array<{ id: number }>;
      if (old.length) {
        await client.delete(events).where(
          inArray(
            events.id,
            old.map((r) => r.id),
          ),
        );
      }
      await ctx.db.persist({ lazy: true });
    },
    async events(hostId, limit = 100) {
      const rows = (await (
        await db()
      )
        .select()
        .from(events)
        .where(eq(events.hostId, hostId))
        .orderBy(desc(events.at), desc(events.id))
        .limit(limit)) as Array<{
        id: number;
        hostId: number;
        at: number | string;
        type: string;
        text: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        hostId: r.hostId,
        at: Number(r.at),
        type: r.type,
        text: r.text,
      }));
    },
  };
  return store;
}
