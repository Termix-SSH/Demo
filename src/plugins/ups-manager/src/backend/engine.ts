import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Reading } from "../shared/types.js";
import {
  CONDITIONS,
  UNREACHABLE_AFTER,
  conditionsOf,
  diff,
  messageFor,
  type Condition,
} from "./conditions.js";
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

  state(sourceId: number): SourceState | undefined {
    return this.states.get(sourceId);
  }

  forget(sourceId: number): void {
    this.states.delete(sourceId);
    this.history.drop(sourceId);
    void this.ctx.kv.delete(`active:${sourceId}`).catch(() => undefined);
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: SourceRow[];
    try {
      rows = (await this.store.all()).filter((row) => row.enabled);
    } catch (error) {
      this.ctx.log.warn(`Could not load UPS sources: ${message(error)}`);
      return;
    }
    const ids = new Set(rows.map((row) => row.id));
    for (const id of [...this.states.keys()])
      if (!ids.has(id)) this.states.delete(id);
    await mapLimit(rows, CONCURRENCY, (row) => this.check(row));
  }

  private async check(row: SourceRow): Promise<void> {
    if (this.running.has(row.id)) return;
    this.running.add(row.id);
    try {
      await this.ctx.asUser(row.userId, async () => {
        const access = await this.ctx.hosts.checkAccess(row.hostId, "connect");
        if (!access.hasAccess) return;
        if (!(await readHostSettings(this.ctx, row.hostId)).enabled) return;
        await this.refresh(row);
      });
    } catch (error) {
      this.ctx.log.debug(`UPS check failed for ${row.id}: ${message(error)}`);
    } finally {
      this.running.delete(row.id);
    }
  }

  /** Reads one source now, as whoever is acting, and records the result. */
  async refresh(row: SourceRow): Promise<SourceState> {
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
    return this.apply(row, reading, error);
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
      this.history.add(row.id, Math.floor(now / 1000), reading);
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
      state.misses += 1;
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
