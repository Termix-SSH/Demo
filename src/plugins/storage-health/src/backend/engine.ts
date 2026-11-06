import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Reading } from "../shared/types.js";
import {
  CONDITIONS,
  SEVERITY,
  UNREACHABLE_AFTER,
  applyHealth,
  conditionsOf,
  diff,
  messageFor,
  type Change,
} from "./conditions.js";
import { readHostSettings } from "./host-settings.js";
import type { History } from "./history.js";
import { parseReading } from "./parsers.js";
import type { Remote } from "./remote.js";
import { READ_SCRIPT } from "./scripts.js";
import type { HostRow, Store } from "./store.js";

export const TICK_MS = 60_000;
export const FLUSH_MS = 5 * 60_000;
const CONCURRENCY = 3;

export interface HostState {
  reading: Reading | null;
  error: string;
  readAt: number | null;
  attemptAt: number;
  misses: number;
  active: Set<string>;
  tests: Map<string, string>;
  scrubs: Map<string, boolean>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

/**
 * Reads every watched host on a timer as the user who set it up, keeps the
 * history, and raises events and alerts when a problem starts or clears.
 */
export class Engine {
  private readonly states = new Map<number, HostState>();
  private readonly running = new Set<number>();
  private stops: Array<() => void> = [];
  private disposed = false;

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: Store,
    private readonly remote: Remote,
    private readonly history: History,
  ) {}

  start(): void {
    this.stops.push(
      this.ctx.schedule.every(TICK_MS, () => this.tick(), { jitterMs: 5_000 }),
      this.ctx.schedule.every(FLUSH_MS, () => this.history.flush()),
    );
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const stop of this.stops) stop();
    this.stops = [];
    await this.history.flush();
  }

  state(hostId: number): HostState | undefined {
    return this.states.get(hostId);
  }

  forget(hostId: number): void {
    this.states.delete(hostId);
    this.history.dropHost(hostId);
    void this.ctx.kv.delete(`active:${hostId}`).catch(() => undefined);
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: HostRow[];
    try {
      rows = await this.store.all();
    } catch (error) {
      this.ctx.log.warn(`Could not load watched hosts: ${message(error)}`);
      return;
    }
    const ids = new Set(rows.map((row) => row.hostId));
    for (const id of [...this.states.keys()]) {
      if (!ids.has(id)) this.states.delete(id);
    }
    const now = Date.now();
    const due = rows.filter((row) => {
      const state = this.states.get(row.hostId);
      return (
        !state || now - state.attemptAt >= row.intervalMin * 60_000 - 5_000
      );
    });
    await mapLimit(due, CONCURRENCY, (row) => this.check(row));
  }

  private async check(row: HostRow): Promise<void> {
    if (this.running.has(row.hostId)) return;
    this.running.add(row.hostId);
    try {
      await this.ctx.asUser(row.userId, async () => {
        const access = await this.ctx.hosts.checkAccess(row.hostId, "connect");
        if (!access.hasAccess) return;
        const settings = await readHostSettings(this.ctx, row.hostId);
        if (!settings.enabled) return;
        await this.refresh(row, settings.useSudo);
      });
    } catch (error) {
      this.ctx.log.debug(
        `Storage check failed for ${row.hostId}: ${message(error)}`,
      );
    } finally {
      this.running.delete(row.hostId);
    }
  }

  /** Reads one host now, as whoever is acting, and records the result. */
  async refresh(row: HostRow, useSudo: boolean): Promise<HostState> {
    let reading: Reading | null = null;
    let error = "";
    try {
      reading = parseReading(
        await this.remote.read(row.hostId, useSudo, READ_SCRIPT),
      );
      applyHealth(reading, row);
    } catch (e) {
      error = message(e);
    }
    return this.apply(row, reading, error);
  }

  private async load(row: HostRow): Promise<HostState> {
    const known = this.states.get(row.hostId);
    if (known) return known;
    const saved = await this.ctx.kv
      .get(`active:${row.hostId}`)
      .catch(() => null);
    const active = new Set<string>(
      Array.isArray(saved)
        ? (saved as string[]).filter((key) =>
            (CONDITIONS as readonly string[]).includes(key.split("|")[0]),
          )
        : [],
    );
    const state: HostState = {
      reading: null,
      error: "",
      readAt: null,
      attemptAt: 0,
      misses: 0,
      active,
      tests: new Map(),
      scrubs: new Map(),
    };
    this.states.set(row.hostId, state);
    return state;
  }

  private async apply(
    row: HostRow,
    reading: Reading | null,
    error: string,
  ): Promise<HostState> {
    const state = await this.load(row);
    const before = new Set(state.active);
    const now = Date.now();
    state.attemptAt = now;
    let after: Set<string>;
    if (reading) {
      state.reading = reading;
      state.error = "";
      state.misses = 0;
      state.readAt = now;
      this.history.add(row.hostId, Math.floor(now / 1000), reading);
      after = new Set(conditionsOf(reading, row).keys());
      await this.watchTests(row, state, reading);
    } else {
      state.error = error;
      state.misses += 1;
      after = new Set(before);
      if (state.misses >= UNREACHABLE_AFTER) after.add("unreachable|host");
    }
    // A read that works clears the unreachable flag.
    if (reading) after.delete("unreachable|host");
    state.active = after;
    const changes = diff(before, after);
    if (changes.length) {
      await this.ctx.kv
        .set(`active:${row.hostId}`, [...after])
        .catch(() => undefined);
    }
    const label = await this.hostLabel(row.hostId);
    for (const change of changes) {
      const text = messageFor(change, state.reading, label);
      await this.store.addEvent(
        row.hostId,
        change.on ? change.kind : `${change.kind}-cleared`,
        text.title,
      );
      const severity = SEVERITY[change.kind];
      const loud = change.on ? severity !== "info" : severity === "critical";
      if (row.alerts && loud) await this.alert(row, change, text);
      await this.emit(row, change, label);
    }
    return state;
  }

  /** Records finished self tests and scrubs as events. */
  private async watchTests(
    row: HostRow,
    state: HostState,
    reading: Reading,
  ): Promise<void> {
    for (const d of reading.devices) {
      const last = state.tests.get(d.id);
      if (last !== undefined && d.selfTest && d.selfTest !== last) {
        await this.store.addEvent(
          row.hostId,
          "test",
          `Self test on ${d.id}: ${d.selfTest}`,
        );
      }
      state.tests.set(d.id, d.selfTest);
    }
    const scans: Array<{ id: string; running: boolean; text: string }> = [
      ...reading.pools.map((p) => ({
        id: p.id,
        running: p.scrubbing,
        text: `${p.name}: ${p.scan}`,
      })),
      ...reading.btrfs.map((b) => ({
        id: b.id,
        running: b.scrubbing,
        text: `${b.mount}: ${b.scrub}`,
      })),
      ...reading.arrays.map((a) => ({
        id: a.id,
        running: a.syncAction !== "",
        text: `${a.name}: ${a.syncAction || "idle"}`,
      })),
    ];
    for (const scan of scans) {
      if (state.scrubs.get(scan.id) === true && !scan.running) {
        await this.store.addEvent(
          row.hostId,
          "scrub",
          `Scrub finished, ${scan.text}`.slice(0, 300),
        );
      }
      state.scrubs.set(scan.id, scan.running);
    }
  }

  private async hostLabel(hostId: number): Promise<string> {
    try {
      const host = await this.ctx.hosts.get(hostId);
      const named = host as { name?: string; ip?: string } | null;
      return named?.name || named?.ip || `host ${hostId}`;
    } catch {
      return `host ${hostId}`;
    }
  }

  private async emit(
    row: HostRow,
    change: Change,
    label: string,
  ): Promise<void> {
    if (typeof this.ctx.operations?.emit !== "function") return;
    const payload = {
      condition: change.kind,
      subject: change.subject,
      hostName: label,
    };
    const send = (name: string) =>
      this.ctx.operations
        .emit(name, payload, { hostId: row.hostId })
        .catch(() => undefined);
    if (!change.on) {
      if (SEVERITY[change.kind] !== "info")
        await send("storage-health.recovered");
      return;
    }
    if (SEVERITY[change.kind] !== "info") await send("storage-health.degraded");
    if (change.kind === "smart-failing")
      await send("storage-health.smart-failing");
    if (change.kind === "raid-degraded" || change.kind === "pool-degraded") {
      await send("storage-health.raid-degraded");
    }
  }

  private async alert(
    row: HostRow,
    change: Change,
    text: { title: string; body: string; severity: string },
  ): Promise<void> {
    try {
      await this.ctx.notify.send({
        title: text.title,
        body: text.body || undefined,
        severity: text.severity as "info" | "warning" | "critical",
        category: `storage-health.${change.kind.replace(/-/g, "_")}`,
        audience: { userId: row.userId },
        link: { tab: "storage-health" },
        dedupeKey: `storage-health:${row.hostId}:${change.kind}:${change.subject}:${change.on ? "on" : "off"}`,
        context: {
          hostId: row.hostId,
          subject: change.subject,
        },
      });
    } catch (error) {
      this.ctx.log.warn(`Could not send a storage alert: ${message(error)}`);
    }
  }
}
