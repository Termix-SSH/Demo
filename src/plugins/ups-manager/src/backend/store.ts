import { and, desc, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Backend, SourceSecrets, UpsEvent } from "../shared/types.js";
import type { ParsedSource } from "./validate.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const EVENT_LIMIT = 300;
export const MAX_SOURCES_PER_HOST = 8;

export interface SourceRow {
  id: number;
  hostId: number;
  userId: string;
  backend: Backend;
  label: string;
  target: string;
  snmpVersion: "1" | "2c" | "3";
  secrets: string | null;
  lowCharge: number;
  lowRuntimeMin: number;
  alerts: boolean;
  enabled: boolean;
}

export interface Store {
  all: () => Promise<SourceRow[]>;
  forHost: (hostId: number) => Promise<SourceRow[]>;
  get: (id: number) => Promise<SourceRow | null>;
  create: (
    hostId: number,
    userId: string,
    source: ParsedSource,
  ) => Promise<SourceRow>;
  update: (
    row: SourceRow,
    source: ParsedSource,
    clearSecrets: boolean,
  ) => Promise<void>;
  remove: (id: number) => Promise<void>;
  openSecrets: (row: SourceRow) => Promise<SourceSecrets>;
  addEvent: (sourceId: number, type: string, text: string) => Promise<void>;
  events: (sourceId: number, limit?: number) => Promise<UpsEvent[]>;
}

export function createStore(
  ctx: PluginContext,
  sources: Table,
  events: Table,
): Store {
  const db = () => ctx.db.client<Drizzle>();

  async function seal(secrets: SourceSecrets): Promise<string | null> {
    return Object.keys(secrets).length
      ? ctx.secrets.seal(JSON.stringify(secrets))
      : null;
  }

  async function open(row: SourceRow): Promise<SourceSecrets> {
    if (!row.secrets) return {};
    const text = await ctx.secrets.unseal(row.secrets);
    if (!text) return {};
    try {
      return JSON.parse(text) as SourceSecrets;
    } catch {
      return {};
    }
  }

  const store: Store = {
    async all() {
      return (await (await db()).select().from(sources)) as SourceRow[];
    },
    async forHost(hostId) {
      return (await (
        await db()
      )
        .select()
        .from(sources)
        .where(eq(sources.hostId, hostId))) as SourceRow[];
    },
    async get(id) {
      const rows = (await (
        await db()
      )
        .select()
        .from(sources)
        .where(eq(sources.id, id))) as SourceRow[];
      return rows[0] ?? null;
    },
    async create(hostId, userId, source) {
      const client = await db();
      await client.insert(sources).values({
        hostId,
        userId,
        backend: source.backend,
        label: source.label,
        target: source.target,
        snmpVersion: source.snmpVersion,
        secrets: await seal(source.secrets),
        lowCharge: source.lowCharge,
        lowRuntimeMin: source.lowRuntimeMin,
        alerts: source.alerts,
        enabled: source.enabled,
      });
      await ctx.db.persist();
      const rows = (await client
        .select()
        .from(sources)
        .where(
          and(eq(sources.hostId, hostId), eq(sources.userId, userId)),
        )) as SourceRow[];
      return rows.reduce((a, b) => (b.id > a.id ? b : a));
    },
    async update(row, source, clearSecrets) {
      const merged = clearSecrets
        ? source.secrets
        : { ...(await open(row)), ...source.secrets };
      await (
        await db()
      )
        .update(sources)
        .set({
          backend: source.backend,
          label: source.label,
          target: source.target,
          snmpVersion: source.snmpVersion,
          secrets: await seal(merged),
          lowCharge: source.lowCharge,
          lowRuntimeMin: source.lowRuntimeMin,
          alerts: source.alerts,
          enabled: source.enabled,
        })
        .where(eq(sources.id, row.id));
      await ctx.db.persist();
    },
    async remove(id) {
      const client = await db();
      await client.delete(events).where(eq(events.sourceId, id));
      await client.delete(sources).where(eq(sources.id, id));
      await ctx.db.persist();
    },
    openSecrets: open,
    async addEvent(sourceId, type, text) {
      const client = await db();
      await client.insert(events).values({
        sourceId,
        at: Date.now(),
        type,
        text: text.slice(0, 300),
      });
      const old = (await client
        .select({ id: events.id })
        .from(events)
        .where(eq(events.sourceId, sourceId))
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
    async events(sourceId, limit = 100) {
      const rows = (await (
        await db()
      )
        .select()
        .from(events)
        .where(eq(events.sourceId, sourceId))
        .orderBy(desc(events.at), desc(events.id))
        .limit(limit)) as Array<{
        id: number;
        sourceId: number;
        at: number | string;
        type: string;
        text: string;
      }>;
      return rows.map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        at: Number(r.at),
        type: r.type,
        text: r.text,
      }));
    },
  };
  return store;
}
