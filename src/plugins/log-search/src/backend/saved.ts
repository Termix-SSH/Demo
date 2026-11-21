import { and, asc, desc, eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import {
  MAX_SAVED,
  RANGE_IDS,
  type RangeId,
  type SavedAlert,
  type SavedQuery,
  type SavedSearch,
  type SavedSearchInput,
} from "../shared/types.js";
import { parseSearch } from "./query.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ctx.db.define hands the table back untyped.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MIN_EVERY = 1;
export const MAX_EVERY = 1440;

export interface SavedRow {
  id: number;
  createdBy: string;
  name: string;
  search: string;
  alertEnabled: boolean | number;
  alertEvery: number;
  alertMin: number;
  alertChannels: string | null;
  alertActive: boolean | number;
  lastRunAt: string | null;
  lastMatchAt: string | null;
  lastCount: number | null;
  lastError: string | null;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Checks a saved search from a request. Anything odd throws. */
export function parseSavedInput(
  input: Record<string, unknown>,
): SavedSearchInput {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100 || /[\r\n\0]/.test(name)) {
    throw new HostScriptError("A name of up to 100 characters is required");
  }
  const raw = (input.search ?? {}) as Record<string, unknown>;
  const range = RANGE_IDS.includes(raw.range as RangeId)
    ? (raw.range as RangeId)
    : "1h";
  // parseSearch checks the pattern, hosts, sources and filters.
  const checked = parseSearch({ ...raw, from: undefined, to: undefined });
  const search: SavedQuery = {
    query: checked.query,
    regex: checked.regex,
    caseSensitive: checked.caseSensitive,
    hostIds: checked.hostIds,
    sources: checked.sources,
    range,
    level: checked.level,
    origin: checked.origin,
  };
  const alertIn = (input.alert ?? {}) as Record<string, unknown>;
  const every = Math.round(Number(alertIn.everyMinutes) || 5);
  const min = Math.round(Number(alertIn.minMatches) || 1);
  const alert: SavedAlert = {
    enabled: alertIn.enabled === true,
    everyMinutes: Math.min(MAX_EVERY, Math.max(MIN_EVERY, every)),
    minMatches: Math.min(100_000, Math.max(1, min)),
    channelIds: (Array.isArray(alertIn.channelIds) ? alertIn.channelIds : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 20),
  };
  return { name, search, alert };
}

export function toSaved(row: SavedRow): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    search: parseJson<SavedQuery>(row.search, {
      query: "",
      regex: false,
      caseSensitive: false,
      hostIds: [],
      sources: ["journal", "files", "docker"],
      range: "1h",
      level: "all",
      origin: "",
    }),
    alert: {
      enabled: !!row.alertEnabled,
      everyMinutes: row.alertEvery,
      minMatches: row.alertMin,
      channelIds: parseJson<number[]>(row.alertChannels, []),
    },
    alertActive: !!row.alertActive,
    lastRunAt: row.lastRunAt,
    lastMatchAt: row.lastMatchAt,
    lastCount: row.lastCount,
    lastError: row.lastError,
  };
}

export type SavedStore = ReturnType<typeof createSavedStore>;

export function createSavedStore(ctx: PluginContext, table: Table) {
  const client = () => ctx.db.client<Drizzle>();

  async function find(userId: string, id: number): Promise<SavedRow | null> {
    const rows = (await (
      await client()
    )
      .select()
      .from(table)
      .where(and(eq(table.id, id), eq(table.createdBy, userId)))
      .limit(1)) as SavedRow[];
    return rows[0] ?? null;
  }

  const columns = (input: SavedSearchInput) => ({
    name: input.name,
    search: JSON.stringify(input.search),
    alertEnabled: input.alert.enabled,
    alertEvery: input.alert.everyMinutes,
    alertMin: input.alert.minMatches,
    alertChannels: JSON.stringify(input.alert.channelIds),
  });

  return {
    find,

    async list(userId: string): Promise<SavedRow[]> {
      return (await (
        await client()
      )
        .select()
        .from(table)
        .where(eq(table.createdBy, userId))
        .orderBy(asc(table.name))) as SavedRow[];
    },

    async listAlerting(): Promise<SavedRow[]> {
      return (await (
        await client()
      )
        .select()
        .from(table)
        .where(eq(table.alertEnabled, true))
        .orderBy(asc(table.id))) as SavedRow[];
    },

    async create(userId: string, input: SavedSearchInput): Promise<SavedRow> {
      const drizzle = await client();
      const existing = (await drizzle
        .select({ id: table.id })
        .from(table)
        .where(eq(table.createdBy, userId))) as unknown[];
      if (existing.length >= MAX_SAVED) {
        throw new HostScriptError(`You can save up to ${MAX_SAVED} searches`);
      }
      const now = new Date().toISOString();
      await drizzle.insert(table).values({
        createdBy: userId,
        ...columns(input),
        alertActive: false,
        createdAt: now,
      });
      await ctx.db.persist();
      // No returning() on every engine: find the row by what was written.
      const rows = (await drizzle
        .select()
        .from(table)
        .where(and(eq(table.createdBy, userId), eq(table.createdAt, now)))
        .orderBy(desc(table.id))
        .limit(1)) as SavedRow[];
      return rows[0];
    },

    async update(
      userId: string,
      id: number,
      input: SavedSearchInput,
    ): Promise<SavedRow | null> {
      const row = await find(userId, id);
      if (!row) return null;
      await (
        await client()
      )
        .update(table)
        .set({
          ...columns(input),
          // A changed search starts over: no open alert, no old window.
          alertActive: false,
          lastRunAt: null,
        })
        .where(eq(table.id, id));
      await ctx.db.persist();
      return find(userId, id);
    },

    async remove(userId: string, id: number): Promise<boolean> {
      const row = await find(userId, id);
      if (!row) return false;
      await (await client()).delete(table).where(eq(table.id, id));
      await ctx.db.persist();
      return true;
    },

    async recordRun(
      id: number,
      values: Partial<
        Pick<
          SavedRow,
          | "alertActive"
          | "lastRunAt"
          | "lastMatchAt"
          | "lastCount"
          | "lastError"
        >
      >,
    ): Promise<void> {
      await (await client()).update(table).set(values).where(eq(table.id, id));
      await ctx.db.persist({ lazy: true });
    },
  };
}
