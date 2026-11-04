import { and, desc, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  isCompliant,
  type Baseline,
  type BaselineResult,
  type TargetSpec,
} from "../shared/types.js";
import { parseTargets, resolveTargets } from "./targets.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Drizzle = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any;

export interface NewBaseline {
  id?: number;
  name: string;
  checkActionId: string;
  resourceKey?: string | null;
  input?: Record<string, unknown>;
  targets: TargetSpec;
  intervalMinutes?: number;
  fixActionId?: string | null;
  autoFix?: boolean;
  enabled?: boolean;
}

const MIN_INTERVAL = 5;

function now() {
  return new Date().toISOString();
}

/**
 * A baseline names a read action that proves a host is as it should be. It
 * runs on a schedule as its owner and records which hosts drifted. An
 * automatic fix runs the fix action through the gate, so rules still apply.
 */
export function createDrift(
  ctx: PluginContext,
  tables: { baselines: Table; results: Table },
) {
  const db = () => ctx.db.client<Drizzle>();
  const { baselines, results } = tables;
  const busy = new Set<number>();

  const toBaseline = (
    row: Record<string, unknown>,
    counts: Record<string, number> = {},
  ): Baseline => ({
    id: Number(row.id),
    name: String(row.name),
    checkActionId: String(row.checkActionId),
    resourceKey: (row.resourceKey as string | null) ?? null,
    targets: parseTargets(row.targets),
    intervalMinutes: Number(row.intervalMinutes),
    fixActionId: (row.fixActionId as string | null) ?? null,
    autoFix: row.autoFix === true,
    enabled: row.enabled !== false,
    lastRunAt: (row.lastRunAt as string | null) ?? null,
    counts,
  });

  const inputOf = async (row: Record<string, unknown>) => {
    const sealed = row.inputSealed as string | null;
    if (!sealed) return {};
    const text = await ctx.secrets.unseal(sealed);
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const findRow = async (userId: string, id: number) => {
    const rows = await (
      await db()
    )
      .select()
      .from(baselines)
      .where(and(eq(baselines.id, id), eq(baselines.userId, userId)));
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  };

  const resultRows = async (baselineId: number) =>
    (await (
      await db()
    )
      .select()
      .from(results)
      .where(eq(results.baselineId, baselineId))) as Record<string, unknown>[];

  const record = async (
    baselineId: number,
    hostId: number,
    hostName: string,
    state: BaselineResult["state"],
    detail: string | null,
    previous: Record<string, unknown> | undefined,
  ) => {
    const client = await db();
    const changed = previous?.state !== state;
    const values = {
      state,
      detail: detail?.slice(0, 1000) ?? null,
      hostName,
      checkedAt: now(),
      ...(changed ? { changedAt: now() } : {}),
    };
    if (previous) {
      await client
        .update(results)
        .set(values)
        .where(eq(results.id, Number(previous.id)));
    } else {
      await client.insert(results).values({ baselineId, hostId, ...values });
    }
    return changed;
  };

  /** Checks every host of one baseline as its owner. */
  const check = async (row: Record<string, unknown>) => {
    const id = Number(row.id);
    if (busy.has(id)) return;
    busy.add(id);
    const userId = String(row.userId);
    try {
      await ctx.asUser(userId, async () => {
        const input = await inputOf(row);
        const hosts = await resolveTargets(ctx, parseTargets(row.targets));
        const previous = new Map(
          (await resultRows(id)).map((result) => [
            Number(result.hostId),
            result,
          ]),
        );
        let drifted = 0;
        for (const host of hosts) {
          let state: BaselineResult["state"];
          let detail: string | null = null;
          try {
            const outcome = await ctx.operations.invoke(
              String(row.checkActionId),
              {
                hostId: host.hostId,
                resourceKey: (row.resourceKey as string | null) ?? undefined,
                input,
                via: "drift",
              },
            );
            if (outcome.status !== "success") {
              state = "error";
              detail = outcome.error ?? outcome.status;
            } else {
              state = isCompliant(outcome.data) ? "compliant" : "drifted";
              detail = outcome.summary ?? null;
            }
          } catch (error) {
            state = "error";
            detail = error instanceof Error ? error.message : String(error);
          }
          const changed = await record(
            id,
            host.hostId,
            host.hostName,
            state,
            detail,
            previous.get(host.hostId),
          );
          if (state !== "drifted") continue;
          drifted++;
          if (row.autoFix === true && row.fixActionId) {
            await ctx.operations
              .invoke(String(row.fixActionId), {
                hostId: host.hostId,
                resourceKey: (row.resourceKey as string | null) ?? undefined,
                input,
                confirmed: true,
                via: "drift",
              })
              .catch(() => {});
          } else if (changed) {
            await ctx.notify
              .send({
                title: `${host.hostName} drifted from ${String(row.name)}`,
                body: detail ?? "",
                severity: "warning",
                category: "operations-center.drifted",
                audience: { userId },
                link: { tab: "operations" },
                context: { hostId: host.hostId, hostName: host.hostName },
              })
              .catch(() => {});
          }
        }
        await (
          await db()
        )
          .update(baselines)
          .set({ lastRunAt: now() })
          .where(eq(baselines.id, id));
        void drifted;
      });
    } finally {
      busy.delete(id);
      await ctx.db.persist({ lazy: true }).catch(() => {});
    }
  };

  const countsOf = (rows: Record<string, unknown>[]) => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const state = String(row.state);
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  };

  return {
    async list(userId: string): Promise<Baseline[]> {
      const rows = (await (
        await db()
      )
        .select()
        .from(baselines)
        .where(eq(baselines.userId, userId))
        .orderBy(desc(baselines.id))) as Record<string, unknown>[];
      if (rows.length === 0) return [];
      const all = (await (
        await db()
      )
        .select()
        .from(results)
        .where(
          inArray(
            results.baselineId,
            rows.map((row) => Number(row.id)),
          ),
        )) as Record<string, unknown>[];
      return rows.map((row) =>
        toBaseline(
          row,
          countsOf(all.filter((result) => result.baselineId === row.id)),
        ),
      );
    },

    async results(
      userId: string,
      id: number,
    ): Promise<BaselineResult[] | null> {
      if (!(await findRow(userId, id))) return null;
      return (await resultRows(id))
        .map((row) => ({
          hostId: Number(row.hostId),
          hostName: (row.hostName as string | null) ?? null,
          state: row.state as BaselineResult["state"],
          detail: (row.detail as string | null) ?? null,
          checkedAt: (row.checkedAt as string | null) ?? null,
          changedAt: (row.changedAt as string | null) ?? null,
        }))
        .sort((a, b) => (a.hostName ?? "").localeCompare(b.hostName ?? ""));
    },

    async save(userId: string, spec: NewBaseline): Promise<void> {
      const client = await db();
      const values = {
        name: spec.name.slice(0, 200),
        checkActionId: spec.checkActionId,
        resourceKey: spec.resourceKey ?? null,
        inputSealed: spec.input
          ? await ctx.secrets.seal(JSON.stringify(spec.input))
          : null,
        targets: JSON.stringify(spec.targets),
        intervalMinutes: Math.max(
          Number(spec.intervalMinutes) || 60,
          MIN_INTERVAL,
        ),
        fixActionId: spec.fixActionId ?? null,
        autoFix: spec.autoFix === true,
        enabled: spec.enabled !== false,
      };
      if (spec.id) {
        if (!(await findRow(userId, spec.id))) {
          throw new Error("Baseline not found");
        }
        await client
          .update(baselines)
          .set(values)
          .where(eq(baselines.id, spec.id));
      } else {
        await client
          .insert(baselines)
          .values({ ...values, userId, createdAt: now() });
      }
      await ctx.db.persist({ lazy: true });
    },

    async remove(userId: string, id: number): Promise<void> {
      if (!(await findRow(userId, id))) throw new Error("Baseline not found");
      const client = await db();
      await client.delete(results).where(eq(results.baselineId, id));
      await client.delete(baselines).where(eq(baselines.id, id));
      await ctx.db.persist({ lazy: true });
    },

    async runNow(userId: string, id: number): Promise<void> {
      const row = await findRow(userId, id);
      if (!row) throw new Error("Baseline not found");
      void check(row);
    },

    /** Called on a timer: checks each baseline whose interval has passed. */
    async tick(): Promise<void> {
      const rows = (await (
        await db()
      )
        .select()
        .from(baselines)
        .where(eq(baselines.enabled, true))) as Record<string, unknown>[];
      const at = Date.now();
      for (const row of rows) {
        const last = row.lastRunAt ? Date.parse(String(row.lastRunAt)) : 0;
        if (at - last < Number(row.intervalMinutes) * 60_000) continue;
        await check(row).catch(() => {});
      }
    },

    async driftedFor(userId: string): Promise<number> {
      const rows = (await (
        await db()
      )
        .select()
        .from(baselines)
        .where(eq(baselines.userId, userId))) as Record<string, unknown>[];
      if (rows.length === 0) return 0;
      const all = (await (
        await db()
      )
        .select()
        .from(results)
        .where(
          inArray(
            results.baselineId,
            rows.map((row) => Number(row.id)),
          ),
        )) as Record<string, unknown>[];
      return all.filter((row) => row.state === "drifted").length;
    },
  };
}

export type Drift = ReturnType<typeof createDrift>;
