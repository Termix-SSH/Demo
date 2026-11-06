import { randomBytes } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { JobKind, JobRow, JobStatus } from "../shared/types.js";
import { VmError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { JobPlan, Target } from "./provider.js";
import type { Remote } from "./remote.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const JOBS_DIR = "/var/lib/termix-vms/jobs";
const POLL_MS = 10_000;
const START_GRACE_MS = 30_000;
const LOST_AFTER_MS = 24 * 60 * 60_000;
const KEEP_MS = 7 * 24 * 60 * 60_000;
const LOG_BYTES = 8000;

/**
 * ctx.ssh.exec stops at 10 minutes, so long work runs detached on the host.
 * body.sh does the work, run.sh writes its exit code to `result`.
 */
export function startScript(uid: string, plan: JobPlan): string {
  const dir = `${JOBS_DIR}/${uid}`;
  const run = `#!/bin/bash
cd ${q(dir)} || exit 1
bash body.sh
echo $? > result.tmp
mv result.tmp result
`;
  return `set -e
umask 077
mkdir -p ${q(dir)}
cd ${q(dir)}
${plan.setup}
printf '%s' ${q(toBase64(`umask 022\n${plan.body}`))} | base64 -d > body.sh
printf '%s' ${q(toBase64(run))} | base64 -d > run.sh
setsid nohup bash run.sh > log 2>&1 < /dev/null &
echo $! > pid
echo started
`;
}

const MARK = "@@";

export function pollScript(uids: string[]): string {
  return `for u in ${uids.map(q).join(" ")}; do
  D="${JOBS_DIR}/$u"
  echo "${MARK}run=$u"
  if [ ! -d "$D" ]; then echo "${MARK}missing"; continue; fi
  p=$(cat "$D/pid" 2>/dev/null || true)
  if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "${MARK}alive"; fi
  if [ -f "$D/result" ]; then echo "${MARK}result=$(cat "$D/result")"; fi
  echo "${MARK}log"
  grep -a '^@@phase ' "$D/log" 2>/dev/null | tail -n 1
  tail -c ${LOG_BYTES} "$D/log" 2>/dev/null | tr '\\r' '\\n'
  echo
done
echo "${MARK}end"
`;
}

export function cleanupScript(uids: string[]): string {
  return `for u in ${uids.map(q).join(" ")}; do rm -rf "${JOBS_DIR}/$u"; done
echo done
`;
}

export function cancelScript(uid: string): string {
  return `D=${q(`${JOBS_DIR}/${uid}`)}
p=$(cat "$D/pid" 2>/dev/null || true)
[ -n "$p" ] || { echo none; exit 0; }
kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
echo sent
`;
}

export interface Polled {
  missing: boolean;
  alive: boolean;
  result: number | null;
  log: string;
}

export function parsePoll(stdout: string): Map<string, Polled> {
  const out = new Map<string, Polled>();
  let current: Polled | null = null;
  let inLog = false;
  for (const line of stdout.split("\n")) {
    if (line.startsWith(`${MARK}run=`)) {
      current = { missing: false, alive: false, result: null, log: "" };
      out.set(line.slice(6).trim(), current);
      inLog = false;
    } else if (line.trim() === `${MARK}end`) {
      current = null;
    } else if (!current) {
      continue;
    } else if (inLog) {
      current.log += `${line}\n`;
    } else if (line.trim() === `${MARK}missing`) {
      current.missing = true;
    } else if (line.trim() === `${MARK}alive`) {
      current.alive = true;
    } else if (line.startsWith(`${MARK}result=`)) {
      current.result = Number(line.slice(9)) || 0;
    } else if (line.trim() === `${MARK}log`) {
      inLog = true;
    }
  }
  return out;
}

const PERCENT_RE = /(\d{1,3}(?:\.\d+)?)(?:\/100)?\s*%/g;
const PROGRESS_LINE_RE = /^[\s#=.\-O]*(\(?\d{1,3}(\.\d+)?(\/100)?\s*%\)?)?\s*$/;

/** Reads the phase, percent and readable lines out of a job's log. */
export function readLog(log: string): {
  phase: string;
  percent: number | null;
  lines: string[];
} {
  let phase = "";
  let percent: number | null = null;
  const lines: string[] = [];
  for (const line of log.split("\n")) {
    if (line.startsWith("@@phase ")) {
      phase = line.slice(8).trim();
      percent = null;
      continue;
    }
    if (line.startsWith("@@")) continue;
    let seen: string | null = null;
    for (const match of line.matchAll(PERCENT_RE)) seen = match[1];
    if (seen !== null) percent = Math.min(100, Number(seen));
    if (!PROGRESS_LINE_RE.test(line)) lines.push(line.trim());
  }
  return { phase, percent, lines };
}

export interface FinishedJob {
  row: StoredJob;
  status: JobStatus;
}

export interface StoredJob {
  id: number;
  uid: string;
  hostId: number;
  userId: string;
  kind: JobKind;
  label: string;
  vmName: string;
  status: JobStatus;
  phase: string;
  percent: number | null;
  log: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface Jobs {
  start: (target: Target, kind: JobKind, plan: JobPlan) => Promise<JobRow>;
  list: (hostId: number) => Promise<JobRow[]>;
  get: (id: number) => Promise<StoredJob | null>;
  cancel: (target: Target, id: number) => Promise<void>;
  /** Waits for a job to finish, for operations that report the result. */
  wait: (id: number, signal?: AbortSignal) => Promise<JobRow>;
  tick: () => Promise<void>;
  startPolling: () => void;
}

export function toJobRow(row: StoredJob): JobRow {
  return {
    id: row.id,
    hostId: row.hostId,
    kind: row.kind,
    label: row.label,
    status: row.status,
    phase: row.phase,
    percent: row.percent,
    log: row.log ?? "",
    error: row.error ?? "",
    vmName: row.vmName,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export function createJobs(
  ctx: PluginContext,
  remote: Remote,
  table: Table,
  onFinished: (finished: FinishedJob) => void,
): Jobs {
  const db = () => ctx.db.client<Drizzle>();
  let polling = false;

  async function byUid(uid: string): Promise<StoredJob> {
    const rows = (await (
      await db()
    )
      .select()
      .from(table)
      .where(eq(table.uid, uid))) as StoredJob[];
    return rows[0];
  }

  async function get(id: number): Promise<StoredJob | null> {
    const rows = (await (
      await db()
    )
      .select()
      .from(table)
      .where(eq(table.id, id))) as StoredJob[];
    return rows[0] ?? null;
  }

  async function update(row: StoredJob, values: Partial<StoredJob>) {
    await (await db()).update(table).set(values).where(eq(table.id, row.id));
  }

  async function finish(
    row: StoredJob,
    status: JobStatus,
    values: Partial<StoredJob>,
  ) {
    await update(row, {
      ...values,
      status,
      finishedAt: new Date().toISOString(),
    });
    await ctx.db.persist();
    onFinished({ row: { ...row, ...values }, status });
  }

  async function apply(row: StoredJob, polled: Polled, now: number) {
    const { phase, percent, lines } = readLog(polled.log);
    const log = lines.slice(-200).join("\n");
    const started = Date.parse(row.startedAt);
    if (polled.result !== null) {
      const ok = polled.result === 0;
      await finish(row, ok ? "success" : "failed", {
        phase,
        percent: ok ? 100 : percent,
        log,
        error: ok ? "" : lines[lines.length - 1] || "The job failed",
      });
      return true;
    }
    if (polled.missing) {
      await finish(row, "failed", { error: "The job is gone from the host" });
      return false;
    }
    if (!polled.alive && now - started > START_GRACE_MS) {
      await finish(row, "failed", {
        phase,
        log,
        error: lines[lines.length - 1] || "The job stopped by itself",
      });
      return true;
    }
    if (phase !== row.phase || percent !== row.percent || log !== row.log) {
      await update(row, { phase, percent, log });
    }
    return false;
  }

  async function pollHost(hostId: number, rows: StoredJob[]) {
    const settings = await readHostSettings(ctx, hostId);
    const uids = rows.map((row) => row.uid);
    const result = await remote.root(hostId, settings.sudo, pollScript(uids), {
      timeoutMs: 30_000,
    });
    const polled = parsePoll(result.stdout);
    const done: string[] = [];
    const now = Date.now();
    for (const row of rows) {
      const state = polled.get(row.uid);
      if (state && (await apply(row, state, now))) done.push(row.uid);
    }
    if (done.length) {
      await remote
        .root(hostId, settings.sudo, cleanupScript(done))
        .catch(() => undefined);
    }
  }

  async function tick() {
    const running = (await (
      await db()
    )
      .select()
      .from(table)
      .where(eq(table.status, "running"))) as StoredJob[];
    const groups = new Map<string, StoredJob[]>();
    for (const row of running) {
      const key = `${row.userId}:${row.hostId}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    await Promise.all(
      [...groups.values()].map(async (rows) => {
        try {
          // One asUser per host: each call is an audit line.
          await ctx.asUser(rows[0].userId, () =>
            pollHost(rows[0].hostId, rows),
          );
        } catch (error) {
          ctx.log.debug(
            `Could not read jobs on host ${rows[0].hostId}: ${String(error)}`,
          );
          for (const row of rows) {
            if (Date.now() - Date.parse(row.startedAt) > LOST_AFTER_MS) {
              await finish(row, "failed", {
                error: "Termix could not reach the host",
              });
            }
          }
        }
      }),
    );
  }

  async function prune() {
    const before = new Date(Date.now() - KEEP_MS).toISOString();
    await (
      await db()
    )
      .delete(table)
      .where(and(eq(table.status, "success"), lt(table.startedAt, before)));
  }

  return {
    get,
    tick,
    async start(target, kind, plan) {
      const uid = randomBytes(12).toString("hex");
      await (await db()).insert(table).values({
        uid,
        hostId: target.hostId,
        userId: String(ctx.currentActor() ?? ""),
        kind,
        label: plan.label.slice(0, 200),
        vmName: plan.vmName,
        startedAt: new Date().toISOString(),
      });
      await ctx.db.persist();
      const row = await byUid(uid);
      try {
        await remote.root(
          target.hostId,
          target.settings.sudo,
          startScript(uid, plan),
        );
      } catch (error) {
        await finish(row, "failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      return toJobRow(row);
    },
    async list(hostId) {
      await prune();
      const rows = (await (
        await db()
      )
        .select()
        .from(table)
        .where(eq(table.hostId, hostId))
        .orderBy(desc(table.id))
        .limit(50)) as StoredJob[];
      return rows.map(toJobRow);
    },
    async cancel(target, id) {
      const row = await get(id);
      if (!row || row.hostId !== target.hostId) {
        throw new VmError("Job not found", 404);
      }
      if (row.status !== "running") return;
      await remote.root(
        target.hostId,
        target.settings.sudo,
        cancelScript(row.uid),
      );
      await finish(row, "cancelled", { error: "" });
    },
    async wait(id, signal) {
      for (;;) {
        const row = await get(id);
        if (!row) throw new VmError("Job not found", 404);
        if (row.status !== "running") return toJobRow(row);
        if (signal?.aborted) throw new VmError("Stopped");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await tick();
      }
    },
    startPolling() {
      if (polling) return;
      polling = true;
      ctx.schedule.every(POLL_MS, () => tick(), { runNow: true });
    },
  };
}
