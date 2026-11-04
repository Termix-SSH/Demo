import { asc, eq } from "drizzle-orm";
import type {
  PluginContext,
  PluginOperationApprovalDecision,
  PluginOperationApprovalInput,
} from "@termix-ssh/plugin-sdk/backend";
import type { Risk, Rule, RuleEffect } from "../shared/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Drizzle = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any;

const RANK: Record<Risk, number> = { read: 0, change: 1, destructive: 2 };
const EFFECTS: RuleEffect[] = ["allow", "approve", "deny"];

function list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      return list(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

export function toRule(row: Record<string, unknown>): Rule {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    position: Number(row.position ?? 0),
    enabled: row.enabled !== false,
    effect: EFFECTS.includes(row.effect as RuleEffect)
      ? (row.effect as RuleEffect)
      : "approve",
    minRisk: (["read", "change", "destructive"] as Risk[]).includes(
      row.minRisk as Risk,
    )
      ? (row.minRisk as Risk)
      : "change",
    origins: list(row.origins),
    pluginIds: list(row.pluginIds),
    actionIds: list(row.actionIds),
    hostTags: list(row.hostTags),
    allowSelf: row.allowSelf === true,
    expiresInMinutes:
      typeof row.expiresInMinutes === "number" ? row.expiresInMinutes : null,
  };
}

/** The name rules use for where a run came from. */
export function originName(origin: PluginOperationApprovalInput["origin"]) {
  if (origin.kind === "plugin") return origin.via || "plugin";
  return origin.kind;
}

export function ruleMatches(
  rule: Rule,
  input: PluginOperationApprovalInput,
): boolean {
  if (!rule.enabled) return false;
  if (RANK[input.effectiveRisk] < RANK[rule.minRisk]) return false;
  if (rule.origins.length && !rule.origins.includes(originName(input.origin))) {
    return false;
  }
  if (rule.pluginIds.length && !rule.pluginIds.includes(input.pluginId)) {
    return false;
  }
  if (rule.actionIds.length && !rule.actionIds.includes(input.actionId)) {
    return false;
  }
  if (rule.hostTags.length) {
    const tags = input.hostTags ?? [];
    if (!rule.hostTags.some((tag) => tags.includes(tag))) return false;
  }
  return true;
}

/** The first matching rule decides. No match leaves it to core's default. */
export function decide(
  rules: Rule[],
  input: PluginOperationApprovalInput,
): PluginOperationApprovalDecision | null {
  const rule = rules.find((candidate) => ruleMatches(candidate, input));
  if (!rule) return null;
  return {
    decision: rule.effect,
    reason: rule.name,
    allowSelf: rule.allowSelf,
    expiresInMinutes: rule.expiresInMinutes ?? undefined,
  };
}

/** What a new server starts with, so the assistant and MCP can ask. */
export const DEFAULT_RULES = [
  {
    name: "The assistant and MCP need approval for changes",
    position: 0,
    effect: "approve",
    minRisk: "change",
    origins: ["assistant", "mcp"],
    allowSelf: true,
  },
  {
    name: "The assistant and MCP can read",
    position: 1,
    effect: "allow",
    minRisk: "read",
    origins: ["assistant", "mcp"],
  },
];

export function createRuleStore(ctx: PluginContext, table: Table) {
  const db = () => ctx.db.client<Drizzle>();
  let cache: Rule[] | null = null;

  const store = {
    async all(): Promise<Rule[]> {
      if (cache) return cache;
      const rows = await (
        await db()
      )
        .select()
        .from(table)
        .orderBy(asc(table.position), asc(table.id));
      cache = (rows as Record<string, unknown>[]).map(toRule);
      return cache;
    },
    async seed(): Promise<void> {
      if ((await store.all()).length > 0) return;
      if (await ctx.kv.get("rulesSeeded")) return;
      const client = await db();
      for (const rule of DEFAULT_RULES) {
        await client.insert(table).values({
          ...rule,
          origins: JSON.stringify(rule.origins),
          createdAt: new Date().toISOString(),
        });
      }
      await ctx.kv.set("rulesSeeded", true);
      cache = null;
      await ctx.db.persist({ lazy: true });
    },
    async save(
      rule: Omit<Rule, "id"> & { id?: number },
      userId: string,
    ): Promise<void> {
      const client = await db();
      const values = {
        name: rule.name.slice(0, 120),
        position: rule.position,
        enabled: rule.enabled,
        effect: rule.effect,
        minRisk: rule.minRisk,
        origins: JSON.stringify(rule.origins),
        pluginIds: JSON.stringify(rule.pluginIds),
        actionIds: JSON.stringify(rule.actionIds),
        hostTags: JSON.stringify(rule.hostTags),
        allowSelf: rule.allowSelf,
        expiresInMinutes: rule.expiresInMinutes,
        updatedBy: userId,
      };
      if (rule.id) {
        await client.update(table).set(values).where(eq(table.id, rule.id));
      } else {
        await client
          .insert(table)
          .values({ ...values, createdAt: new Date().toISOString() });
      }
      cache = null;
      await ctx.db.persist();
    },
    async remove(id: number): Promise<void> {
      await (await db()).delete(table).where(eq(table.id, id));
      cache = null;
      await ctx.db.persist();
    },
  };
  return store;
}

export type RuleStore = ReturnType<typeof createRuleStore>;

export function validRule(body: Record<string, unknown>): string | null {
  if (typeof body.name !== "string" || !body.name.trim()) {
    return "A rule needs a name";
  }
  if (!EFFECTS.includes(body.effect as RuleEffect)) return "Unknown effect";
  if (!["read", "change", "destructive"].includes(String(body.minRisk))) {
    return "Unknown risk";
  }
  return null;
}
