import { createHash } from "node:crypto";
import type {
  PluginContext,
  PluginHostProbeTarget,
} from "@termix-ssh/plugin-sdk/backend";
import {
  REMOTE_TYPES,
  type CertInfo,
  type CheckResult,
  type MonitorSecrets,
} from "../shared/types.js";
import type { AlertSender } from "./alerts.js";
import type { BeatStore } from "./beats.js";
import { checkDns } from "./checks/dns.js";
import { checkHttp } from "./checks/http.js";
import { PingPool } from "./checks/ping.js";
import { checkFromHost } from "./checks/remote.js";
import { checkCommand, checkDocker, checkSystemd } from "./checks/ssh.js";
import { checkTcp } from "./checks/tcp.js";
import { checkTls, readCert } from "./checks/tls.js";
import {
  errorText,
  failed,
  passed,
  type CheckEnv,
  type CheckTarget,
  type RemoteRun,
} from "./checks/types.js";
import { ConcurrentLimiter } from "./limiter.js";
import { inMaintenance, type MaintenanceWindow } from "./maintenance.js";
import type { MonitorRow, Repository } from "./repository.js";
import { DAY_MS, type RollupStore } from "./rollups.js";
import {
  applyResult,
  certStep,
  freshState,
  reminderDue,
  type RunState,
} from "./state.js";

const TICK_MS = 5_000;
const RELOAD_MS = 60_000;
const FLUSH_MS = 5 * 60_000;
const CERT_READ_MS = 3_600_000;
const PERMISSION_TTL_MS = 15 * 60_000;
const TARGETS_TTL_MS = 10 * 60_000;
const FIRST_RUN_SPREAD_MS = 60_000;
const JUMP_MIN_INTERVAL_MS = 300_000;
const CONCURRENCY = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface Entry {
  row: MonitorRow;
  secrets: MonitorSecrets;
  state: RunState;
  nextAt: number;
  running: boolean;
  jumped: boolean;
  cert: CertInfo | null;
  certAt: number;
  certStep: number | null;
  pushAt: number | null;
}

export interface EngineDeps {
  ctx: PluginContext;
  repo: Repository;
  beats: BeatStore;
  rollups: RollupStore;
  alerts: AlertSender;
  relay: RemoteRun;
  now?: () => number;
  random?: () => number;
  dataDir?: () => Promise<string>;
}

export class UptimeEngine {
  private readonly entries = new Map<number, Entry>();
  private readonly watchers = new Map<number, Set<string>>();
  private readonly limiter = new ConcurrentLimiter(CONCURRENCY);
  private readonly permissions = new Map<
    string,
    { allowed: boolean; at: number }
  >();
  private readonly hostTargets = new Map<
    string,
    { rows: Map<number, PluginHostProbeTarget>; at: number }
  >();
  private readonly stops: Array<() => void> = [];
  private readonly ping: PingPool;
  private windows: MaintenanceWindow[] = [];
  private disposed = false;

  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.ping = new PingPool(deps.ctx);
  }

  async start(): Promise<void> {
    const { ctx, repo, beats, rollups } = this.deps;
    await beats.load(await ctx.files.dataDir());
    rollups.load(await repo.listRollups());
    await this.reload();
    const every = (ms: number, work: () => Promise<void>) => {
      this.stops.push(
        ctx.schedule.every(ms, () => this.guard(work), { jitterMs: 0 }),
      );
    };
    every(TICK_MS, () => this.tick());
    every(RELOAD_MS, () => this.reload());
    every(FLUSH_MS, () => this.flush());
  }

  /** A timer that throws counts against the plugin's error budget. */
  private async guard(work: () => Promise<void>): Promise<void> {
    if (this.disposed) return;
    try {
      await work();
    } catch (error) {
      this.deps.ctx.log.warn(`Uptime timer failed: ${errorText(error)}`);
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const stop of this.stops) stop();
    this.ping.stopAll();
    await this.guardFlush();
  }

  private async guardFlush(): Promise<void> {
    try {
      await this.flush();
    } catch (error) {
      this.deps.ctx.log.warn(`Could not save uptime data: ${errorText(error)}`);
    }
  }

  private async unsealed(row: MonitorRow): Promise<MonitorSecrets> {
    if (!row.sealed) return {};
    const text = await this.deps.ctx.secrets.unseal(row.sealed);
    if (!text) return {};
    try {
      return JSON.parse(text) as MonitorSecrets;
    } catch {
      return {};
    }
  }

  /** Picks up rows changed or removed outside this class, like a deleted user. */
  async reload(): Promise<void> {
    const { repo, beats } = this.deps;
    const rows = await repo.listMonitors();
    const open = await repo.openCauses();
    const seen = new Set<number>();
    for (const row of rows) {
      seen.add(row.id);
      await this.upsert(row, open.get(row.id));
    }
    for (const id of [...this.entries.keys()]) {
      if (!seen.has(id)) this.drop(id);
    }
    beats.keepOnly(seen);
    this.windows = await repo.listWindows();
    const watches = await repo.listAllWatches();
    this.watchers.clear();
    for (const { monitorId, userId } of watches) {
      if (!this.watchers.has(monitorId)) {
        this.watchers.set(monitorId, new Set());
      }
      this.watchers.get(monitorId)?.add(userId);
    }
  }

  async upsert(row: MonitorRow, openCause?: string): Promise<Entry> {
    const known = this.entries.get(row.id);
    if (known) {
      const changed = known.row.sealed !== row.sealed;
      known.row = row;
      if (changed) known.secrets = await this.unsealed(row);
      if (!row.enabled && known.state.status !== "paused") {
        known.state = { ...known.state, status: "paused", since: this.now() };
        this.ping.drop(row.id);
      } else if (row.enabled && known.state.status === "paused") {
        known.state = { ...known.state, status: "unknown", since: this.now() };
        known.nextAt = this.now();
      }
      return known;
    }
    const now = this.now();
    const entry: Entry = {
      row,
      secrets: await this.unsealed(row),
      state: {
        ...freshState(),
        status: row.enabled ? row.status : "paused",
        since: row.statusSince,
        lastAt: row.lastCheckAt,
        open: openCause !== undefined || row.status === "down",
        message: openCause ?? "",
        lastAlertAt: now,
      },
      nextAt:
        now +
        Math.floor(
          this.random() * Math.min(row.intervalSec * 1000, FIRST_RUN_SPREAD_MS),
        ),
      running: false,
      jumped: false,
      cert: null,
      certAt: 0,
      certStep: null,
      pushAt: row.type === "push" ? now : null,
    };
    this.entries.set(row.id, entry);
    return entry;
  }

  drop(id: number): void {
    this.entries.delete(id);
    this.ping.drop(id);
    this.watchers.delete(id);
  }

  dropPing(id: number): void {
    this.ping.drop(id);
  }

  entry(id: number): Entry | undefined {
    return this.entries.get(id);
  }

  all(): Entry[] {
    return [...this.entries.values()];
  }

  byPushHash(hash: string): Entry | undefined {
    return this.all().find((entry) => entry.row.pushTokenHash === hash);
  }

  byKey(key: string): Entry | undefined {
    return this.all().find((entry) => entry.row.key === key);
  }

  isWatching(id: number, userId: string): boolean {
    return this.watchers.get(id)?.has(userId) === true;
  }

  async setWatch(id: number, userId: string, on: boolean): Promise<void> {
    await this.deps.repo.setWatch(id, userId, on);
    if (!this.watchers.has(id)) this.watchers.set(id, new Set());
    const users = this.watchers.get(id);
    if (on) users?.add(userId);
    else users?.delete(userId);
  }

  async refreshWindows(): Promise<void> {
    this.windows = await this.deps.repo.listWindows();
  }

  listWindows(): MaintenanceWindow[] {
    return this.windows;
  }

  async allowPrivate(userId: string): Promise<boolean> {
    const cached = this.permissions.get(userId);
    const now = this.now();
    if (cached && now - cached.at < PERMISSION_TTL_MS) return cached.allowed;
    const { ctx } = this.deps;
    const allowed = await ctx
      .asUser(userId, () => ctx.rbac.has("private-targets"))
      .catch(() => false);
    this.permissions.set(userId, { allowed, at: now });
    return allowed;
  }

  private async targetsFor(
    userId: string,
  ): Promise<Map<number, PluginHostProbeTarget>> {
    const cached = this.hostTargets.get(userId);
    const now = this.now();
    if (cached && now - cached.at < TARGETS_TTL_MS) return cached.rows;
    const { ctx } = this.deps;
    const rows = await ctx.asUser(userId, () => ctx.hosts.probeTargets());
    const map = new Map(rows.map((row) => [row.id, row]));
    this.hostTargets.set(userId, { rows: map, at: now });
    return map;
  }

  private async checkHost(
    target: CheckTarget,
    entry?: Entry,
  ): Promise<CheckResult> {
    const { ctx } = this.deps;
    const hostId = target.hostId;
    if (!hostId) return failed("This monitor has no host");
    try {
      const host = (await this.targetsFor(target.runAs)).get(hostId);
      if (!host) return failed("This host is gone, or you lost access to it");
      const port = target.config.port ?? host.port;
      const timeoutMs = target.timeoutSec * 1000;
      const started = performance.now();
      let open: boolean;
      if (host.jumpHosts.length > 0) {
        if (entry) entry.jumped = true;
        open = await ctx.asUser(target.runAs, () =>
          ctx.ssh.probe(hostId, { port, timeoutMs }),
        );
      } else {
        open = await ctx.network.tcpProbe(host.ip, port, { timeoutMs });
      }
      const latency = Math.round(performance.now() - started);
      return open
        ? passed(`Port ${port} answered`, latency)
        : failed(`Port ${port} did not answer`, latency);
    } catch (error) {
      return failed(errorText(error));
    }
  }

  async execute(
    target: CheckTarget,
    env: CheckEnv,
    entry?: Entry,
  ): Promise<CheckResult> {
    const { relay } = this.deps;
    if (target.fromHostId && REMOTE_TYPES.includes(target.type)) {
      return checkFromHost(target, relay);
    }
    switch (target.type) {
      case "http":
        return checkHttp(target, env);
      case "tcp":
        return checkTcp(target, env);
      case "ping":
        return this.ping.check(target, env.allowPrivate);
      case "dns":
        return checkDns(target, env);
      case "tls":
        return checkTls(target, env);
      case "host":
        return this.checkHost(target, entry);
      case "docker":
        return checkDocker(target, relay);
      case "systemd":
        return checkSystemd(target, relay);
      case "command":
        return checkCommand(target, relay);
      case "push":
        return failed("A push monitor waits for its URL to be called");
    }
  }

  private target(entry: Entry): CheckTarget {
    const { row, secrets } = entry;
    return {
      id: row.id,
      type: row.type,
      config: row.config,
      secrets,
      hostId: row.hostId,
      fromHostId: row.fromHostId,
      intervalSec: row.intervalSec,
      timeoutSec: row.timeoutSec,
      runAs: row.updatedBy,
    };
  }

  /** Runs a monitor that is not saved yet, as the signed-in user. */
  async test(target: CheckTarget, signal: AbortSignal): Promise<CheckResult> {
    const allowPrivate = await this.deps.ctx.rbac.has("private-targets");
    // Test ids are negative, so a ping test never reuses a real monitor's.
    const result = await this.execute(target, { allowPrivate, signal });
    if (target.type === "ping") this.ping.drop(target.id);
    return result;
  }

  async tick(): Promise<void> {
    const now = this.now();
    const jobs: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.row.enabled || entry.running) continue;
      if (now < entry.nextAt) continue;
      if (entry.row.type === "push") {
        this.checkPushDeadline(entry, now);
        continue;
      }
      jobs.push(this.queue(entry));
    }
    await Promise.all(jobs);
  }

  private checkPushDeadline(entry: Entry, now: number): void {
    const { row } = entry;
    const graceMs = (row.config.graceSec ?? 60) * 1000;
    const deadline = (entry.pushAt ?? row.createdAt) + row.intervalSec * 1000;
    if (now < deadline + graceMs) {
      entry.nextAt = now + TICK_MS;
      return;
    }
    void this.record(entry, failed("No push arrived in time")).catch((error) =>
      this.deps.ctx.log.warn(`Uptime push check: ${errorText(error)}`),
    );
  }

  private async queue(entry: Entry): Promise<void> {
    entry.running = true;
    await this.limiter.run(async () => {
      try {
        await this.runEntry(entry);
      } catch (error) {
        this.deps.ctx.log.warn(
          `Check failed for monitor ${entry.row.id}: ${errorText(error)}`,
        );
        entry.nextAt = this.now() + entry.row.intervalSec * 1000;
      } finally {
        entry.running = false;
      }
    });
  }

  private async runEntry(entry: Entry): Promise<void> {
    const { row } = entry;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      (row.timeoutSec + 15) * 1000,
    );
    try {
      const allowPrivate = await this.allowPrivate(row.updatedBy);
      const env = { allowPrivate, signal: controller.signal };
      const result = await this.execute(this.target(entry), env, entry);
      const remote = !!row.fromHostId;
      if (row.type === "http" && !remote) await this.readHttpCert(entry, env);
      await this.record(entry, result);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The certificate of an https monitor, at most once an hour. */
  private async readHttpCert(entry: Entry, env: CheckEnv): Promise<void> {
    const { config, timeoutSec } = entry.row;
    const now = this.now();
    if (!config.url?.startsWith("https:")) return;
    if (now - entry.certAt < CERT_READ_MS) return;
    entry.certAt = now;
    try {
      const url = new URL(config.url);
      const read = await readCert(
        url.hostname,
        Number(url.port) || 443,
        timeoutSec * 1000,
        env.allowPrivate,
        env.signal,
      );
      entry.cert = read.cert;
    } catch {
      // The HTTP check reports a dead host. This only adds a date.
    }
  }

  async runNow(id: number): Promise<CheckResult | null> {
    const entry = this.entries.get(id);
    if (!entry || !entry.row.enabled || entry.row.type === "push") return null;
    if (!entry.running) await this.queue(entry);
    return {
      ok: entry.state.status === "up",
      latencyMs: entry.state.latencyMs,
      message: entry.state.message,
    };
  }

  /** A call to a push URL. */
  async push(
    entry: Entry,
    report: { ok: boolean; message: string; latencyMs: number | null },
  ): Promise<void> {
    entry.pushAt = this.now();
    await this.record(
      entry,
      report.ok
        ? passed(report.message || "Push arrived", report.latencyMs)
        : failed(report.message || "The job reported a failure"),
    );
  }

  private async record(entry: Entry, result: CheckResult): Promise<void> {
    const { repo, beats, rollups, alerts } = this.deps;
    const { row } = entry;
    const now = this.now();
    if (result.cert) entry.cert = result.cert;
    const previous = entry.state;
    const maintenance = inMaintenance(
      this.windows,
      { key: row.key, userId: row.userId, tags: row.tags },
      now,
    );
    const step = applyResult(previous, result, {
      retries: row.retries,
      maintenance,
      now,
    });
    entry.state = step.state;
    const retryMs = row.retryIntervalSec * 1000;
    let gap = step.retry ? retryMs : row.intervalSec * 1000;
    if (entry.jumped) gap = Math.max(gap, JUMP_MIN_INTERVAL_MS);
    entry.nextAt = now + gap;
    const status = step.state.status;
    beats.add(row.id, now, status, step.state.latencyMs);
    rollups.add(row.id, now, status, step.state.latencyMs);

    const users = [...(this.watchers.get(row.id) ?? [])];
    if (previous.status !== status) await repo.saveState(row.id, step.state);
    const payload = {
      monitor: row.key,
      name: row.name,
      type: row.type,
      message: step.state.message,
    };
    const hostOption = { hostId: row.hostId ?? undefined };
    if (step.transition === "down") {
      await repo.openIncident(row.id, now, step.state.message);
      entry.state = { ...entry.state, lastAlertAt: now };
      await alerts.down(row, users, step.state.message);
      await this.emit("uptime.monitor-down", payload, hostOption);
    } else if (step.transition === "up") {
      const downMs = now - (previous.since ?? now);
      await repo.closeIncident(row.id, now);
      await alerts.up(row, users, downMs);
      await this.emit("uptime.monitor-up", payload, hostOption);
    } else if (reminderDue(step.state, row.resendMinutes, now)) {
      entry.state = { ...entry.state, lastAlertAt: now };
      await alerts.reminder(
        row,
        users,
        step.state.message,
        now - (step.state.since ?? now),
      );
    }

    if (entry.cert) {
      const warnDays = row.config.certWarnDays ?? 14;
      const stepAt =
        warnDays > 0 ? certStep(entry.cert.daysLeft, warnDays) : null;
      if (stepAt !== null && stepAt !== entry.certStep) {
        await alerts.cert(row, users, entry.cert);
        await this.emit(
          "uptime.cert-expiring",
          { ...payload, daysLeft: entry.cert.daysLeft },
          hostOption,
        );
      }
      entry.certStep = stepAt;
    }
  }

  private async emit(
    id: string,
    payload: Record<string, unknown>,
    options: { hostId?: number },
  ): Promise<void> {
    try {
      await this.deps.ctx.operations.emit(id, payload, options);
    } catch (error) {
      this.deps.ctx.log.warn(`Could not emit ${id}: ${errorText(error)}`);
    }
  }

  async flush(): Promise<void> {
    const { ctx, repo, beats, rollups } = this.deps;
    const dirty = rollups.takeDirty();
    try {
      await repo.saveRollups(dirty);
    } catch (error) {
      rollups.restoreDirty(dirty);
      throw error;
    }
    await beats.save(await ctx.files.dataDir());
    await this.prune();
  }

  private lastPrune = 0;

  private async prune(): Promise<void> {
    const now = this.now();
    if (now - this.lastPrune < DAY_MS) return;
    this.lastPrune = now;
    const { ctx, repo, rollups } = this.deps;
    const days = Number(await ctx.settings.get("historyDays")) || 90;
    const cutoffs = rollups.prune(days, now);
    await repo.pruneRollups(cutoffs.hours, cutoffs.days);
  }
}
