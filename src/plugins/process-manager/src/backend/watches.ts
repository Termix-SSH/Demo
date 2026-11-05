import { and, eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  AppRow,
  ProcessRow,
  WatchBody,
  WatchKind,
  WatchRule,
} from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { ProcessService } from "./service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Tables come from ctx.db.define, which the SDK hands back untyped.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WATCH_TICK_MS = 30_000;
/** Most watches one user may keep on one host. */
export const MAX_WATCHES = 50;
/** Most automatic restarts of one app in an hour. */
export const MAX_AUTO_RESTARTS = 3;
const RESTART_WINDOW_MS = 10 * 60_000;
const HOUR_MS = 60 * 60_000;

const KINDS: WatchKind[] = ["process", "pm2", "supervisor"];
const RULES: WatchRule[] = ["down", "restarts", "cpu", "mem"];

export interface WatchRow {
  id: number;
  userId: string;
  hostId: number;
  kind: WatchKind;
  target: string;
  rule: WatchRule;
  threshold: number;
  autoRestart: boolean;
}

export interface WatchStore {
  list: (userId: string, hostId: number) => Promise<WatchRow[]>;
  listForUser: (userId: string) => Promise<WatchRow[]>;
  listAll: () => Promise<WatchRow[]>;
  add: (userId: string, hostId: number, body: WatchBody) => Promise<void>;
  remove: (userId: string, id: number) => Promise<void>;
}

/** Checks a watch body and fills its defaults. */
export function cleanWatch(raw: unknown): Required<WatchBody> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const kind = String(b.kind) as WatchKind;
  const rule = String(b.rule ?? "down") as WatchRule;
  const target = String(b.target ?? "").trim();
  if (!KINDS.includes(kind)) throw new HostScriptError("The kind is not valid");
  if (!RULES.includes(rule)) throw new HostScriptError("The rule is not valid");
  if (!target || target.length > 255 || /[\0\r\n]/.test(target)) {
    throw new HostScriptError("The target is not valid");
  }
  if (rule === "restarts" && kind !== "pm2") {
    throw new HostScriptError("Restart counts are only known for pm2 apps");
  }
  const threshold = Math.max(0, Math.floor(Number(b.threshold) || 0));
  if (rule !== "down" && threshold < 1) {
    throw new HostScriptError("Set a limit above zero");
  }
  if (rule === "cpu" && threshold > 100 * 64) {
    throw new HostScriptError("The CPU limit is too high");
  }
  return {
    kind,
    target,
    rule,
    threshold: rule === "down" ? 0 : threshold,
    autoRestart:
      b.autoRestart === true && rule === "down" && kind !== "process",
  };
}

export function createWatchStore(ctx: PluginContext, table: Table): WatchStore {
  const db = () => ctx.db.client<Drizzle>();
  const all = async (where?: unknown) => {
    const q = (await db()).select().from(table);
    return (where ? await q.where(where) : await q) as WatchRow[];
  };
  return {
    async list(userId, hostId) {
      return (
        await all(and(eq(table.userId, userId), eq(table.hostId, hostId)))
      ).sort((a, b) => a.id - b.id);
    },
    async listForUser(userId) {
      return (await all(eq(table.userId, userId))).sort(
        (a, b) => a.hostId - b.hostId || a.id - b.id,
      );
    },
    async listAll() {
      return all();
    },
    async add(userId, hostId, body) {
      const clean = cleanWatch(body);
      const existing = await this.list(userId, hostId);
      if (existing.length >= MAX_WATCHES) {
        throw new HostScriptError("This host has too many watches");
      }
      if (
        existing.some(
          (w) =>
            w.kind === clean.kind &&
            w.target === clean.target &&
            w.rule === clean.rule,
        )
      ) {
        throw new HostScriptError("That watch exists already");
      }
      await (await db()).insert(table).values({ userId, hostId, ...clean });
      await ctx.db.persist();
    },
    async remove(userId, id) {
      await (
        await db()
      )
        .delete(table)
        .where(and(eq(table.userId, userId), eq(table.id, id)));
      await ctx.db.persist();
    },
  };
}

export interface Reading {
  processes: ProcessRow[];
  apps: AppRow[];
}

export interface Verdict {
  /** bad is a rule being broken, ok is fine, null is unknown. */
  bad: boolean | null;
  note: string;
}

/** Decides one watch from what the host shows right now. */
export function judge(
  watch: WatchRow,
  reading: Reading,
  history: number[],
): Verdict {
  if (watch.kind === "process") {
    const needle = watch.target.toLowerCase();
    const hits = reading.processes.filter(
      (p) =>
        p.command.toLowerCase() === needle ||
        p.args.toLowerCase().includes(needle),
    );
    if (watch.rule === "down") {
      return { bad: hits.length === 0, note: "No matching process is running" };
    }
    if (watch.rule === "cpu") {
      const cpu = hits.reduce((sum, p) => sum + p.cpu, 0);
      return {
        bad: cpu > watch.threshold,
        note: `CPU is at ${cpu.toFixed(0)}%`,
      };
    }
    if (watch.rule === "mem") {
      const mem = hits.reduce((sum, p) => sum + p.mem, 0);
      return {
        bad: mem > watch.threshold,
        note: `Memory is at ${mem.toFixed(0)}%`,
      };
    }
    return { bad: null, note: "" };
  }
  const app = reading.apps.find(
    (a) =>
      a.manager === watch.kind &&
      (a.name === watch.target || a.key === watch.target),
  );
  if (!app) {
    return watch.rule === "down"
      ? { bad: true, note: "The app is not listed anymore" }
      : { bad: null, note: "" };
  }
  switch (watch.rule) {
    case "down":
      if (app.health === "wait") return { bad: null, note: "" };
      return { bad: app.health === "down", note: `The app is ${app.status}` };
    case "restarts": {
      const first = history[0] ?? app.restarts ?? 0;
      const delta = (app.restarts ?? 0) - first;
      return {
        bad: delta >= watch.threshold,
        note: `Restarted ${delta} times in the last 10 minutes`,
      };
    }
    case "cpu":
      return app.cpu == null
        ? { bad: null, note: "" }
        : { bad: app.cpu > watch.threshold, note: `CPU is at ${app.cpu}%` };
    case "mem": {
      if (app.mem == null) return { bad: null, note: "" };
      const mb = Math.round(app.mem / 1048576);
      return { bad: mb > watch.threshold, note: `Memory is at ${mb} MB` };
    }
  }
}

export type Change = {
  watch: WatchRow;
  bad: boolean;
  note: string;
  restarted: string;
};

/**
 * Checks every watch on a timer, as the user who owns it, and reports a watch
 * going bad or recovering. The first check only learns the state, so
 * something already broken when Termix starts is not reported.
 */
export class WatchChecker {
  private readonly last = new Map<number, boolean>();
  private readonly restarts = new Map<
    number,
    Array<{ at: number; n: number }>
  >();
  private readonly autoRestarts = new Map<number, number[]>();
  private readonly running = new Set<string>();
  private stop: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: WatchStore,
    private readonly service: ProcessService,
    private readonly onChange: (change: Change) => Promise<void>,
  ) {}

  start(): void {
    this.stop = this.ctx.schedule.every(WATCH_TICK_MS, () => this.tick(), {
      jitterMs: 5_000,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stop?.();
    this.last.clear();
    this.restarts.clear();
    this.autoRestarts.clear();
  }

  /** up, down or empty before the first check. */
  stateOf(id: number): string {
    const bad = this.last.get(id);
    return bad === undefined ? "" : bad ? "down" : "up";
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: WatchRow[];
    try {
      rows = await this.store.listAll();
    } catch (error) {
      this.ctx.log.warn(`Could not load watches: ${String(error)}`);
      return;
    }
    const groups = new Map<string, WatchRow[]>();
    for (const row of rows) {
      const key = `${row.userId}:${row.hostId}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const ids = new Set(rows.map((r) => r.id));
    for (const id of [...this.last.keys()])
      if (!ids.has(id)) this.last.delete(id);
    const jobs: Promise<void>[] = [];
    for (const [key, group] of groups) {
      if (this.running.has(key)) continue;
      this.running.add(key);
      jobs.push(this.check(group).finally(() => this.running.delete(key)));
    }
    await Promise.all(jobs);
  }

  private async check(group: WatchRow[]): Promise<void> {
    const { userId, hostId } = group[0];
    try {
      await this.ctx.asUser(userId, async () => {
        const access = await this.ctx.hosts.checkAccess(hostId, "connect");
        if (!access.hasAccess) return;
        const settings = await readHostSettings(this.ctx, hostId);
        if (!settings.enabled) return;
        const needsApps = group.some((w) => w.kind !== "process");
        const needsProcs = group.some((w) => w.kind === "process");
        const [list, managers] = await Promise.all([
          needsProcs
            ? this.service.processes(hostId, settings)
            : Promise.resolve(null),
          needsApps
            ? this.service.managers(hostId, settings)
            : Promise.resolve(null),
        ]);
        if (this.disposed) return;
        const reading: Reading = {
          processes: list?.processes ?? [],
          apps: managers?.apps ?? [],
        };
        const now = Date.now();
        for (const watch of group) {
          const history = this.trackRestarts(watch, reading, now);
          const verdict = judge(watch, reading, history);
          if (verdict.bad === null) continue;
          const before = this.last.get(watch.id);
          this.last.set(watch.id, verdict.bad);
          if (before === undefined || before === verdict.bad) continue;
          let restarted = "";
          if (verdict.bad && watch.autoRestart) {
            restarted = await this.autoRestart(watch, hostId, now);
          }
          await this.onChange({
            watch,
            bad: verdict.bad,
            note: verdict.note,
            restarted,
          });
        }
      });
    } catch (error) {
      this.ctx.log.debug(
        `Watch check failed for host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Restart counts seen in the last 10 minutes, oldest first. */
  private trackRestarts(watch: WatchRow, reading: Reading, now: number) {
    if (watch.rule !== "restarts") return [];
    const app = reading.apps.find(
      (a) =>
        a.manager === "pm2" &&
        (a.name === watch.target || a.key === watch.target),
    );
    if (!app || app.restarts == null) return [];
    const samples = this.restarts.get(watch.id) ?? [];
    samples.push({ at: now, n: app.restarts });
    while (samples.length > 1 && now - samples[0].at > RESTART_WINDOW_MS) {
      samples.shift();
    }
    this.restarts.set(watch.id, samples);
    return samples.map((sample) => sample.n);
  }

  private async autoRestart(
    watch: WatchRow,
    hostId: number,
    now: number,
  ): Promise<string> {
    const recent = (this.autoRestarts.get(watch.id) ?? []).filter(
      (t) => now - t < HOUR_MS,
    );
    if (recent.length >= MAX_AUTO_RESTARTS) {
      this.autoRestarts.set(watch.id, recent);
      return "Not restarted: too many automatic restarts this hour";
    }
    recent.push(now);
    this.autoRestarts.set(watch.id, recent);
    try {
      const outcome = await this.ctx.operations.run(
        "process-manager.app-restart",
        {
          hostId,
          resourceKey: `${watch.kind}:${watch.target}`,
          confirmed: true,
          via: "watch",
        },
      );
      return outcome.status === "success"
        ? "Restarted automatically"
        : `Restart failed: ${outcome.error ?? outcome.status}`;
    } catch (error) {
      return `Restart failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/** Sends the watcher an alert and an event when a watch breaks or recovers. */
export function createWatchAlerts(ctx: PluginContext) {
  return async ({ watch, bad, note, restarted }: Change): Promise<void> => {
    try {
      const host = await ctx
        .asUser(watch.userId, () => ctx.hosts.get(watch.hostId))
        .catch(() => null);
      const hostName = host?.name || host?.ip || `#${watch.hostId}`;
      const what = watch.target;
      const rule = watch.rule;
      const category = bad
        ? rule === "down"
          ? "process-manager.process_down"
          : "process-manager.process_limit"
        : "process-manager.process_recovered";
      const title = bad
        ? rule === "down"
          ? `${what} is down on ${hostName}`
          : rule === "restarts"
            ? `${what} keeps restarting on ${hostName}`
            : `${what} uses too much ${rule === "cpu" ? "CPU" : "memory"} on ${hostName}`
        : rule === "down"
          ? `${what} is back on ${hostName}`
          : `${what} is back to normal on ${hostName}`;
      await ctx.notify.send({
        title,
        body: [note, restarted].filter(Boolean).join(". "),
        severity: bad ? (rule === "down" ? "critical" : "warning") : "success",
        category,
        audience: { userId: watch.userId },
        link: { tab: "process-manager" },
        dedupeKey: `process-manager:${watch.id}:${bad ? "bad" : "ok"}`,
        context: { hostId: watch.hostId, hostName },
      });
      if (bad && (rule === "down" || rule === "restarts")) {
        const event =
          rule === "restarts"
            ? "process-manager.restart-loop"
            : watch.kind === "process"
              ? "process-manager.process-down"
              : "process-manager.app-crashed";
        await ctx.operations.emit(
          event,
          { target: watch.target, kind: watch.kind, rule, note },
          { hostId: watch.hostId },
        );
      }
    } catch (error) {
      ctx.log.warn(
        `Could not send a process alert: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
