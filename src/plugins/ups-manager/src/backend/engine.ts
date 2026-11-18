import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { EnergyReport, HistoryRange, Reading } from "../shared/types.js";
import { EnergyLedger } from "./energy-ledger.js";
import { UpsError } from "./errors.js";
import {
  CONDITIONS,
  UNREACHABLE_AFTER,
  conditionsOf,
  diff,
  messageFor,
  type Condition,
} from "./conditions.js";
import { keepAwake } from "./keep-awake.js";
import { readHostSettings } from "./host-settings.js";
import type { History } from "./history.js";
import { readTarget } from "./reader.js";
import type { Remote } from "./remote.js";
import type { SourceRow, Store } from "./store.js";

export const TICK_MS = 30_000;
export const FLUSH_MS = 5 * 60_000;
const CONCURRENCY = 4;

export interface SourceState {
  reading: Reading | null;
  error: string;
  readAt: number | null;
  misses: number;
  active: Set<Condition>;
  lastTest: string;
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
 * Reads every UPS on a timer as the user who added it, keeps the history,
 * and raises events and alerts when a condition turns on or clears.
 */
export class Engine {
  private readonly states = new Map<number, SourceState>();
  private readonly running = new Set<number>();
  private readonly queues = new Map<number, Promise<void>>();
  private readonly sampledAt = new Map<number, number>();
  private readonly energyErrors = new Map<number, string>();
  private stops: Array<() => void> = [];
  private disposed = false;

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: Store,
    private readonly remote: Remote,
    private readonly history: History,
    private readonly energy: EnergyLedger,
  ) {}

  start(): void {
    keepAwake(this.ctx, "tick", true);
    this.stops.push(
      this.ctx.schedule.every(TICK_MS, () => this.tick(), {
        id: "tick",
        jitterMs: 5_000,
      }),
      this.ctx.schedule.every(FLUSH_MS, () => this.history.flush(), {
        id: "flush",
      }),
    );
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const stop of this.stops) stop();
    this.stops = [];
    await Promise.all(this.queues.values());
    await this.history.flush();
  }

  state(sourceId: number): SourceState | undefined {
    return this.states.get(sourceId);
  }

  forget(sourceId: number): void {
    this.states.delete(sourceId);
    this.history.drop(sourceId);
    this.energy.forget(sourceId);
    this.sampledAt.delete(sourceId);
    this.energyErrors.delete(sourceId);
    void this.ctx.kv.delete(`active:${sourceId}`).catch(() => undefined);
  }

  /** One source queue covers sampling, settings mutations and removal. */
  async exclusive<T>(id: number, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const result = previous.then(work);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(id, settled);
    try {
      return await result;
    } finally {
      if (this.queues.get(id) === settled) this.queues.delete(id);
    }
  }

  breakContinuity(id: number): void {
    this.energy.break(id);
  }

  async energyReport(id: number): Promise<EnergyReport> {
    try {
      await this.energy.load(id);
      this.energyErrors.delete(id);
    } catch (error) {
      this.energyErrors.set(id, `Energy state unavailable: ${message(error)}`);
    }
    return {
      ...this.energy.report(id),
      ...(this.energyErrors.has(id)
        ? { persistenceError: this.energyErrors.get(id)! }
        : {}),
    };
  }

  async energyHistory(id: number, range: HistoryRange) {
    const report = await this.energyReport(id);
    return {
      ...this.energy.history(id, range),
      persistenceError: report.persistenceError,
    };
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: SourceRow[];
    try {
      rows = (await this.store.all()).filter((row) => row.enabled);
    } catch (error) {
      for (const id of this.states.keys()) this.energy.break(id);
      this.ctx.log.warn(`Could not load UPS sources: ${message(error)}`);
      return;
    }
    // Nothing watched: nothing keeps the process running.
    keepAwake(this.ctx, "tick", rows.length > 0);
    const ids = new Set(rows.map((row) => row.id));
    for (const id of [...this.states.keys()])
      if (!ids.has(id)) {
        this.states.delete(id);
        this.energy.break(id);
      }
    await mapLimit(rows, CONCURRENCY, (row) => this.check(row));
  }

  private async check(row: SourceRow): Promise<void> {
    if (this.running.has(row.id)) return;
    this.running.add(row.id);
    try {
      await this.ctx.asUser(row.userId, async () => {
        const access = await this.ctx.hosts.checkAccess(row.hostId, "connect");
        if (
          !access.hasAccess ||
          !(await readHostSettings(this.ctx, row.hostId)).enabled
        ) {
          this.energy.break(row.id);
          return;
        }
        await this.refresh(row, true);
      });
    } catch (error) {
      this.energy.break(row.id);
      this.ctx.log.debug(`UPS check failed for ${row.id}: ${message(error)}`);
    } finally {
      this.running.delete(row.id);
    }
  }

  /** Reads one source now, as whoever is acting, and records the result. */
  async refresh(row: SourceRow, canonical = false): Promise<SourceState> {
    return this.exclusive(row.id, async () => {
      const current = await this.store.get(row.id);
      if (!current) throw new UpsError("UPS not found", 404);
      if (!current.enabled) {
        this.energy.break(current.id);
        return this.load(current);
      }
      const now = performance.now();
      const last = this.sampledAt.get(current.id);
      // Repeated scheduled calls cannot create extra history/energy observations.
      if (canonical && last !== undefined && now - last < TICK_MS - 5_000) {
        return this.load(current);
      }
      if (canonical) this.sampledAt.set(current.id, now);
      return this.read(current, canonical);
    });
  }

  private async read(row: SourceRow, canonical: boolean): Promise<SourceState> {
    let reading: Reading | null = null;
    let error = "";
    try {
      reading = await readTarget(
        this.remote,
        row,
        await this.store.openSecrets(row),
      );
    } catch (e) {
      error = message(e);
    }
    if (!reading) this.energy.break(row.id);
    if (canonical && reading) {
      try {
        await this.energy.sample(row, reading, Date.now() / 1000);
      } catch (e) {
        this.energyErrors.set(row.id, `Energy tracking failed: ${message(e)}`);
        this.ctx.log.warn(
          `Energy sampling failed for ${row.id}: ${message(e)}`,
        );
      }
      this.history.add(row.id, Math.floor(Date.now() / 1000), reading);
    }
    return this.apply(row, reading, error, canonical);
  }

  private async load(row: SourceRow): Promise<SourceState> {
    const known = this.states.get(row.id);
    if (known) return known;
    const saved = await this.ctx.kv.get(`active:${row.id}`).catch(() => null);
    const active = new Set<Condition>(
      Array.isArray(saved)
        ? (saved as string[]).filter((c): c is Condition =>
            (CONDITIONS as string[]).includes(c),
          )
        : [],
    );
    const state: SourceState = {
      reading: null,
      error: "",
      readAt: null,
      misses: 0,
      active,
      lastTest: "",
    };
    this.states.set(row.id, state);
    return state;
  }

  private async apply(
    row: SourceRow,
    reading: Reading | null,
    error: string,
    canonical: boolean,
  ): Promise<SourceState> {
    const state = await this.load(row);
    const before = new Set(state.active);
    const now = Date.now();
    let after: Set<Condition>;
    if (reading) {
      state.reading = reading;
      state.error = "";
      state.misses = 0;
      state.readAt = now;
      after = conditionsOf(reading, row);
      if (
        reading.lastTest &&
        state.lastTest &&
        reading.lastTest !== state.lastTest
      ) {
        await this.store.addEvent(
          row.id,
          "test",
          `Self test: ${reading.lastTest}`,
        );
      }
      state.lastTest = reading.lastTest;
    } else {
      state.error = error;
      if (canonical) state.misses += 1;
      after = new Set(before);
      if (state.misses >= UNREACHABLE_AFTER) after.add("unreachable");
    }
    state.active = after;
    const changes = diff(before, after);
    if (changes.length) {
      await this.ctx.kv
        .set(`active:${row.id}`, [...after])
        .catch(() => undefined);
    }
    for (const change of changes) {
      const text = messageFor(change, state.reading, row.label);
      await this.store.addEvent(
        row.id,
        change.on ? change.condition : `${change.condition}-cleared`,
        text.title,
      );
      const loud = change.on || change.condition === "on-battery";
      if (row.alerts && loud) await this.alert(row, change, text);
      if (change.condition === "on-battery") await this.emit(row, change.on);
    }
    return state;
  }

  private async emit(row: SourceRow, onBattery: boolean): Promise<void> {
    if (typeof this.ctx.operations?.emit !== "function") return;
    await this.ctx.operations
      .emit(
        onBattery ? "ups-manager.on-battery" : "ups-manager.power-restored",
        { sourceName: row.label },
        { hostId: row.hostId },
      )
      .catch(() => undefined);
  }

  private async alert(
    row: SourceRow,
    change: { condition: Condition; on: boolean },
    text: { title: string; body: string; severity: string },
  ): Promise<void> {
    try {
      await this.ctx.notify.send({
        title: text.title,
        body: text.body || undefined,
        severity: text.severity as "info" | "warning" | "critical",
        category: `ups-manager.${change.condition.replace(/-/g, "_")}`,
        audience: { userId: row.userId },
        link: { tab: "ups-manager" },
        dedupeKey: `ups-manager:${row.id}:${change.condition}:${change.on ? "on" : "off"}`,
        context: {
          hostId: row.hostId,
          sourceId: row.id,
          sourceName: row.label,
        },
      });
    } catch (error) {
      this.ctx.log.warn(`Could not send a UPS alert: ${message(error)}`);
    }
  }
}
