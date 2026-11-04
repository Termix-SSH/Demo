import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Batch, BatchTarget, TargetSpec } from "../shared/types.js";
import { resolveTargets } from "./targets.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Drizzle = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = any;

const MAX_TARGETS = 1000;
const MAX_BATCH = 50;
const WAIT_TICK_MS = 1000;

/** Waiting states that end a target's turn without a result yet. */
const SETTLED = new Set([
  "success",
  "failed",
  "skipped",
  "pending_approval",
  "needs_interaction",
]);

export interface NewBatch {
  name: string;
  actionId: string;
  resourceKey?: string;
  input?: Record<string, unknown>;
  targets: TargetSpec;
  dryRun?: boolean;
  canary?: number;
  batchSize?: number;
  pauseSeconds?: number;
  stopAfterFailures?: number;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function now() {
  return new Date().toISOString();
}

/**
 * Runs one action across many hosts in steps: a canary first, then batches,
 * stopping after too many failures. A rollout only moves on while the server
 * is up. After a restart it waits for a person, and a change never resumes on
 * its own.
 */
export function createRollouts(
  ctx: PluginContext,
  tables: { batches: Table; targets: Table },
) {
  const db = () => ctx.db.client<Drizzle>();
  const { batches, targets } = tables;
  const running = new Map<number, { stop: boolean; pause: boolean }>();

  /** Inserts a batch and returns its id. MySQL has no RETURNING. */
  const insertId = async (values: Record<string, unknown>): Promise<number> => {
    const client = await db();
    if (ctx.db.dialect === "mysql") {
      const result = await client.insert(batches).values(values);
      const header = Array.isArray(result) ? result[0] : result;
      return Number(header?.insertId);
    }
    const rows = await client
      .insert(batches)
      .values(values)
      .returning({ id: batches.id });
    return Number(rows[0].id);
  };

  const toBatch = (
    row: Record<string, unknown>,
    counts: Record<string, number> = {},
  ): Batch => ({
    id: Number(row.id),
    name: String(row.name),
    actionId: String(row.actionId),
    resourceKey: (row.resourceKey as string | null) ?? null,
    dryRun: row.dryRun === true,
    canary: Number(row.canary),
    batchSize: Number(row.batchSize),
    pauseSeconds: Number(row.pauseSeconds),
    stopAfterFailures: Number(row.stopAfterFailures),
    status: row.status as Batch["status"],
    pausedReason: (row.pausedReason as string | null) ?? null,
    createdAt: (row.createdAt as string | null) ?? null,
    startedAt: (row.startedAt as string | null) ?? null,
    finishedAt: (row.finishedAt as string | null) ?? null,
    counts,
  });

  const toTarget = (row: Record<string, unknown>): BatchTarget => ({
    id: Number(row.id),
    hostId: Number(row.hostId),
    hostName: (row.hostName as string | null) ?? null,
    position: Number(row.position),
    status: String(row.status),
    runId: (row.runId as string | null) ?? null,
    summary: (row.summary as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  });

  const findRow = async (userId: string, id: number) => {
    const rows = await (
      await db()
    )
      .select()
      .from(batches)
      .where(and(eq(batches.id, id), eq(batches.userId, userId)));
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  };

  const targetRows = async (batchId: number) =>
    (await (
      await db()
    )
      .select()
      .from(targets)
      .where(eq(targets.batchId, batchId))
      .orderBy(asc(targets.position))) as Record<string, unknown>[];

  const setBatch = async (id: number, patch: Record<string, unknown>) => {
    await (await db()).update(batches).set(patch).where(eq(batches.id, id));
  };

  const setTarget = async (id: number, patch: Record<string, unknown>) => {
    await (await db()).update(targets).set(patch).where(eq(targets.id, id));
  };

  const countsOf = (rows: Record<string, unknown>[]) => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const status = String(row.status);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  };

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

  /** Runs one target and records what happened. Never throws. */
  const runTarget = async (
    batch: Record<string, unknown>,
    input: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Promise<string> => {
    const targetId = Number(target.id);
    await setTarget(targetId, { status: "running" });
    try {
      const outcome = await ctx.operations.invoke(String(batch.actionId), {
        hostId: Number(target.hostId),
        resourceKey: (batch.resourceKey as string | null) ?? undefined,
        input,
        dryRun: batch.dryRun === true,
        confirmed: true,
        batchId: `operations-center:${String(batch.id)}`,
        idempotencyKey: `batch-${String(batch.id)}-${targetId}`,
        via: "rollout",
      });
      const status =
        outcome.status === "success"
          ? "success"
          : outcome.status === "pending_approval" ||
              outcome.status === "needs_interaction"
            ? outcome.status
            : "failed";
      await setTarget(targetId, {
        status,
        runId: outcome.runId,
        summary: outcome.summary ?? null,
        error: outcome.error ?? null,
        finishedAt: now(),
      });
      return status;
    } catch (error) {
      await setTarget(targetId, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: now(),
      });
      return "failed";
    }
  };

  const sleep = async (
    ms: number,
    flags: { stop: boolean; pause: boolean },
  ) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !flags.stop && !flags.pause) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(WAIT_TICK_MS, end - Date.now())),
      );
    }
  };

  /** The loop for one rollout, as the user who started it. */
  const drive = async (userId: string, id: number) => {
    if (running.has(id)) return;
    const flags = { stop: false, pause: false };
    running.set(id, flags);
    try {
      await ctx.asUser(userId, async () => {
        const batch = await findRow(userId, id);
        if (!batch) return;
        const input = await inputOf(batch);
        const rows = await targetRows(id);
        let failures = rows.filter((row) => row.status === "failed").length;
        const limit = Number(batch.stopAfterFailures);
        const waiting = rows.filter((row) => row.status === "waiting");

        // The canary counts only on a fresh start.
        const canary = rows.some((row) => SETTLED.has(String(row.status)))
          ? 0
          : Number(batch.canary);
        const groups: Record<string, unknown>[][] = [];
        if (canary > 0) groups.push(waiting.slice(0, canary));
        const rest = waiting.slice(canary);
        for (let i = 0; i < rest.length; i += Number(batch.batchSize)) {
          groups.push(rest.slice(i, i + Number(batch.batchSize)));
        }

        for (const [index, group] of groups.entries()) {
          if (flags.stop || flags.pause) break;
          const results = await Promise.all(
            group.map((target) => runTarget(batch, input, target)),
          );
          failures += results.filter((status) => status === "failed").length;
          if (limit > 0 && failures >= limit) {
            await setBatch(id, {
              status: "paused",
              pausedReason: `Stopped after ${failures} failed hosts`,
            });
            return;
          }
          if (index < groups.length - 1 && Number(batch.pauseSeconds) > 0) {
            await sleep(Number(batch.pauseSeconds) * 1000, flags);
          }
        }

        if (flags.stop) {
          await setBatch(id, { status: "stopped", finishedAt: now() });
        } else if (flags.pause) {
          await setBatch(id, { status: "paused", pausedReason: "Paused" });
        } else {
          const done = await targetRows(id);
          await setBatch(id, {
            status: done.some((row) => row.status === "failed")
              ? "failed"
              : "done",
            finishedAt: now(),
          });
        }
      });
    } catch (error) {
      await setBatch(id, {
        status: "paused",
        pausedReason: error instanceof Error ? error.message : String(error),
      }).catch(() => {});
    } finally {
      running.delete(id);
      await ctx.db.persist({ lazy: true }).catch(() => {});
    }
  };

  return {
    async create(userId: string, spec: NewBatch): Promise<Batch> {
      const list = await resolveTargets(ctx, spec.targets);
      if (list.length === 0) throw new Error("No hosts match these targets");
      if (list.length > MAX_TARGETS) {
        throw new Error(`A rollout can reach at most ${MAX_TARGETS} hosts`);
      }
      const client = await db();
      const id = await insertId({
        userId,
        name: spec.name.slice(0, 200) || spec.actionId,
        actionId: spec.actionId,
        resourceKey: spec.resourceKey ?? null,
        inputSealed: spec.input
          ? await ctx.secrets.seal(JSON.stringify(spec.input))
          : null,
        dryRun: spec.dryRun === true,
        canary: clamp(spec.canary, 0, MAX_BATCH, 1),
        batchSize: clamp(spec.batchSize, 1, MAX_BATCH, 10),
        pauseSeconds: clamp(spec.pauseSeconds, 0, 3600, 0),
        stopAfterFailures: clamp(spec.stopAfterFailures, 0, MAX_TARGETS, 1),
        status: "draft",
        createdAt: now(),
      });
      for (const [position, target] of list.entries()) {
        await client.insert(targets).values({
          batchId: id,
          hostId: target.hostId,
          hostName: target.hostName,
          position,
        });
      }
      // A rollout is worth a save before it starts, so a crash keeps it.
      await ctx.db.persist();
      return (await this.get(userId, id))!.batch;
    },

    async list(userId: string): Promise<Batch[]> {
      const rows = (await (
        await db()
      )
        .select()
        .from(batches)
        .where(eq(batches.userId, userId))
        .orderBy(desc(batches.id))
        .limit(100)) as Record<string, unknown>[];
      if (rows.length === 0) return [];
      const all = (await (
        await db()
      )
        .select()
        .from(targets)
        .where(
          inArray(
            targets.batchId,
            rows.map((row) => Number(row.id)),
          ),
        )) as Record<string, unknown>[];
      return rows.map((row) =>
        toBatch(
          row,
          countsOf(all.filter((target) => target.batchId === row.id)),
        ),
      );
    },

    async get(userId: string, id: number) {
      const row = await findRow(userId, id);
      if (!row) return null;
      const rows = await targetRows(id);
      return {
        batch: toBatch(row, countsOf(rows)),
        targets: rows.map(toTarget),
      };
    },

    async start(userId: string, id: number): Promise<void> {
      const row = await findRow(userId, id);
      if (!row) throw new Error("Rollout not found");
      if (row.status === "running" || row.status === "done") return;
      // Hosts that failed get another go only for an action safe to repeat.
      await setBatch(id, {
        status: "running",
        pausedReason: null,
        startedAt: row.startedAt ?? now(),
      });
      void drive(userId, id);
    },

    async pause(userId: string, id: number): Promise<void> {
      if (!(await findRow(userId, id))) throw new Error("Rollout not found");
      const flags = running.get(id);
      if (flags) flags.pause = true;
      else await setBatch(id, { status: "paused", pausedReason: "Paused" });
    },

    async stop(userId: string, id: number): Promise<void> {
      if (!(await findRow(userId, id))) throw new Error("Rollout not found");
      const flags = running.get(id);
      if (flags) flags.stop = true;
      else await setBatch(id, { status: "stopped", finishedAt: now() });
      await ctx.db.persist({ lazy: true });
    },

    async retry(userId: string, id: number): Promise<void> {
      const row = await findRow(userId, id);
      if (!row) throw new Error("Rollout not found");
      if (running.has(id)) return;
      const client = await db();
      await client
        .update(targets)
        .set({ status: "waiting", error: null, runId: null })
        .where(and(eq(targets.batchId, id), eq(targets.status, "failed")));
      await this.start(userId, id);
    },

    async remove(userId: string, id: number): Promise<void> {
      if (!(await findRow(userId, id))) throw new Error("Rollout not found");
      if (running.has(id)) throw new Error("Stop the rollout first");
      const client = await db();
      await client.delete(targets).where(eq(targets.batchId, id));
      await client.delete(batches).where(eq(batches.id, id));
      await ctx.db.persist({ lazy: true });
    },

    /** After a restart nothing is running, so anything marked running waits. */
    async recover(): Promise<void> {
      const client = await db();
      await client
        .update(batches)
        .set({
          status: "paused",
          pausedReason: "Termix restarted. Check the hosts, then resume.",
        })
        .where(eq(batches.status, "running"));
      await client
        .update(targets)
        .set({
          status: "failed",
          error: "Termix restarted during this run. Check the host.",
        })
        .where(eq(targets.status, "running"));
    },

    stopAll(): void {
      for (const flags of running.values()) flags.stop = true;
    },
  };
}

export type Rollouts = ReturnType<typeof createRollouts>;
