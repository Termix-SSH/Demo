import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { RuleSet, RuleSpec } from "../shared/types.js";
import type { HostState } from "./backends/types.js";
import { FirewallError } from "./errors.js";
import { parseRuleSpec, specKey } from "./validate.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const MAX_SETS = 50;
export const MAX_SET_RULES = 100;
export const MAX_SET_HOSTS = 500;

export interface RuleSetInput {
  name: string;
  description: string;
  rules: RuleSpec[];
  hosts: number[];
}

export function parseRuleSetInput(input: unknown): RuleSetInput {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 120)
    throw new FirewallError("Give the rule set a name, up to 120 characters");
  const description = String(body.description ?? "")
    .trim()
    .slice(0, 1000);
  const rawRules = Array.isArray(body.rules) ? body.rules : [];
  if (rawRules.length > MAX_SET_RULES)
    throw new FirewallError(`A rule set can hold up to ${MAX_SET_RULES} rules`);
  const rules = rawRules.map((rule, index) => {
    try {
      return parseRuleSpec(rule);
    } catch (error) {
      throw new FirewallError(
        `Rule ${index + 1}: ${error instanceof Error ? error.message : "not valid"}`,
      );
    }
  });
  const hosts = [
    ...new Set((Array.isArray(body.hosts) ? body.hosts : []).map(Number)),
  ].filter((id) => Number.isInteger(id) && id > 0);
  if (hosts.length > MAX_SET_HOSTS)
    throw new FirewallError(
      `A rule set can target up to ${MAX_SET_HOSTS} hosts`,
    );
  return { name, description, rules, hosts };
}

/** Rules from the set that the host does not have yet. */
export function missingRules(state: HostState, rules: RuleSpec[]): RuleSpec[] {
  const zone = state.defaultZone;
  const have = new Set(
    state.rules
      .filter((r) => state.backend !== "firewalld" || r.zone === zone)
      .map((r) => specKey(r)),
  );
  return rules.filter((rule) => !have.has(specKey(rule)));
}

export interface RuleSetStore {
  list: (userId: string) => Promise<RuleSet[]>;
  get: (userId: string, id: number) => Promise<RuleSet>;
  create: (userId: string, input: RuleSetInput) => Promise<RuleSet>;
  update: (userId: string, id: number, input: RuleSetInput) => Promise<RuleSet>;
  remove: (userId: string, id: number) => Promise<void>;
  markApplied: (id: number, hostId: number) => Promise<void>;
}

interface SetRow {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  rules: unknown;
  updatedAt: string;
}

function readRules(value: unknown): RuleSpec[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = [];
    }
  }
  const out: RuleSpec[] = [];
  for (const item of Array.isArray(list) ? list : []) {
    try {
      out.push(parseRuleSpec(item));
    } catch {
      // A rule that no longer checks out is left out.
    }
  }
  return out;
}

export function createRuleSetStore(
  ctx: PluginContext,
  sets: Table,
  targets: Table,
): RuleSetStore {
  const db = () => ctx.db.client<Drizzle>();

  async function hostsOf(ids: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (!ids.length) return map;
    const rows = (await (
      await db()
    )
      .select()
      .from(targets)
      .where(inArray(targets.rulesetId, ids))) as Array<{
      rulesetId: number;
      hostId: number;
    }>;
    for (const row of rows)
      map.set(row.rulesetId, [...(map.get(row.rulesetId) ?? []), row.hostId]);
    return map;
  }

  function toSet(row: SetRow, hosts: number[]): RuleSet {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      rules: readRules(row.rules),
      hosts: [...hosts].sort((a, b) => a - b),
      updatedAt: String(row.updatedAt ?? ""),
    };
  }

  async function setHosts(id: number, hosts: number[]): Promise<void> {
    const client = await db();
    const current = (await client
      .select()
      .from(targets)
      .where(eq(targets.rulesetId, id))) as Array<{
      hostId: number;
    }>;
    const keep = new Set(hosts);
    const drop = current.map((r) => r.hostId).filter((h) => !keep.has(h));
    if (drop.length) {
      await client
        .delete(targets)
        .where(and(eq(targets.rulesetId, id), inArray(targets.hostId, drop)));
    }
    const have = new Set(current.map((r) => r.hostId));
    const add = hosts.filter((h) => !have.has(h));
    if (add.length)
      await client
        .insert(targets)
        .values(add.map((hostId) => ({ rulesetId: id, hostId })));
  }

  async function get(userId: string, id: number): Promise<RuleSet> {
    const rows = (await (
      await db()
    )
      .select()
      .from(sets)
      .where(and(eq(sets.id, id), eq(sets.userId, userId)))) as SetRow[];
    if (!rows[0]) throw new FirewallError("Rule set not found", 404);
    return toSet(rows[0], (await hostsOf([id])).get(id) ?? []);
  }

  return {
    async list(userId) {
      const rows = (await (
        await db()
      )
        .select()
        .from(sets)
        .where(eq(sets.userId, userId))) as SetRow[];
      const hosts = await hostsOf(rows.map((r) => r.id));
      return rows
        .map((row) => toSet(row, hosts.get(row.id) ?? []))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    get,
    async create(userId, input) {
      const existing = (await (
        await db()
      )
        .select()
        .from(sets)
        .where(eq(sets.userId, userId))) as SetRow[];
      if (existing.length >= MAX_SETS)
        throw new FirewallError(`You can have up to ${MAX_SETS} rule sets`);
      const key = randomUUID();
      const client = await db();
      await client.insert(sets).values({
        userId,
        setKey: key,
        name: input.name,
        description: input.description,
        rules: JSON.stringify(input.rules),
      });
      const inserted = (await client
        .select()
        .from(sets)
        .where(eq(sets.setKey, key))) as SetRow[];
      const id = inserted[0].id;
      await setHosts(id, input.hosts);
      await ctx.db.persist();
      return get(userId, id);
    },
    async update(userId, id, input) {
      await get(userId, id);
      await (
        await db()
      )
        .update(sets)
        .set({
          name: input.name,
          description: input.description,
          rules: JSON.stringify(input.rules),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(sets.id, id), eq(sets.userId, userId)));
      await setHosts(id, input.hosts);
      await ctx.db.persist();
      return get(userId, id);
    },
    async remove(userId, id) {
      await get(userId, id);
      const client = await db();
      await client.delete(targets).where(eq(targets.rulesetId, id));
      await client
        .delete(sets)
        .where(and(eq(sets.id, id), eq(sets.userId, userId)));
      await ctx.db.persist();
    },
    async markApplied(id, hostId) {
      await (
        await db()
      )
        .update(targets)
        .set({ appliedAt: new Date().toISOString() })
        .where(and(eq(targets.rulesetId, id), eq(targets.hostId, hostId)));
      await ctx.db.persist({ lazy: true });
    },
  };
}
