import type {
  HistoryPoint,
  MonitorStatus,
  UptimeNumbers,
} from "../shared/types.js";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
const HOURS_KEPT = 7;

export type RollupSize = "hour" | "day";

export interface RollupRow {
  monitorId: number;
  size: RollupSize;
  bucket: number;
  up: number;
  down: number;
  maintenance: number;
  latencySum: number;
  latencyCount: number;
  latencyMin: number | null;
  latencyMax: number | null;
}

export function bucketOf(size: RollupSize, atMs: number): number {
  const span = size === "hour" ? HOUR_MS : DAY_MS;
  return Math.floor(atMs / span) * span;
}

function percent(up: number, down: number): number | null {
  const total = up + down;
  return total === 0 ? null : Math.round((up / total) * 10000) / 100;
}

const keyOf = (row: Pick<RollupRow, "size" | "bucket">) =>
  `${row.size}:${row.bucket}`;

/**
 * Totals per hour and per day, kept whole in memory. Uptime numbers and charts
 * read from here. The database is only where they rest between restarts.
 */
export class RollupStore {
  private readonly byMonitor = new Map<number, Map<string, RollupRow>>();
  private readonly dirty = new Set<RollupRow>();

  load(rows: RollupRow[]): void {
    for (const row of rows) this.slot(row.monitorId).set(keyOf(row), row);
  }

  private slot(monitorId: number): Map<string, RollupRow> {
    let rows = this.byMonitor.get(monitorId);
    if (!rows) {
      rows = new Map();
      this.byMonitor.set(monitorId, rows);
    }
    return rows;
  }

  add(
    monitorId: number,
    atMs: number,
    status: MonitorStatus,
    latencyMs: number | null,
  ): void {
    for (const size of ["hour", "day"] as const) {
      const bucket = bucketOf(size, atMs);
      const rows = this.slot(monitorId);
      const key = keyOf({ size, bucket });
      let row = rows.get(key);
      if (!row) {
        row = {
          monitorId,
          size,
          bucket,
          up: 0,
          down: 0,
          maintenance: 0,
          latencySum: 0,
          latencyCount: 0,
          latencyMin: null,
          latencyMax: null,
        };
        rows.set(key, row);
      }
      if (status === "up") row.up++;
      // A retry that recovers was never an outage, so pending counts for neither.
      else if (status === "down") row.down++;
      else if (status === "maintenance") row.maintenance++;
      if (latencyMs !== null) {
        row.latencySum += Math.round(latencyMs);
        row.latencyCount++;
        row.latencyMin = Math.min(row.latencyMin ?? latencyMs, latencyMs);
        row.latencyMax = Math.max(row.latencyMax ?? latencyMs, latencyMs);
      }
      this.dirty.add(row);
    }
  }

  private rows(
    monitorId: number,
    size: RollupSize,
    since: number,
  ): RollupRow[] {
    return [...(this.byMonitor.get(monitorId)?.values() ?? [])]
      .filter((row) => row.size === size && row.bucket >= since)
      .sort((a, b) => a.bucket - b.bucket);
  }

  uptime(monitorId: number, now: number): UptimeNumbers {
    const over = (size: RollupSize, spanMs: number) => {
      let up = 0;
      let down = 0;
      for (const row of this.rows(monitorId, size, now - spanMs)) {
        up += row.up;
        down += row.down;
      }
      return percent(up, down);
    };
    return {
      day: over("hour", DAY_MS),
      week: over("hour", 7 * DAY_MS),
      month: over("day", 30 * DAY_MS),
      quarter: over("day", 90 * DAY_MS),
    };
  }

  history(
    monitorId: number,
    size: RollupSize,
    spanMs: number,
    now: number,
  ): HistoryPoint[] {
    return this.rows(monitorId, size, now - spanMs).map((row) => ({
      t: Math.floor(row.bucket / 1000),
      up: row.up,
      down: row.down,
      ms: row.latencyCount
        ? Math.round(row.latencySum / row.latencyCount)
        : null,
      min: row.latencyMin,
      max: row.latencyMax,
    }));
  }

  /** One percent per day, oldest first, for a status page bar. */
  days(monitorId: number, count: number, now: number): Array<number | null> {
    const today = bucketOf("day", now);
    const rows = this.byMonitor.get(monitorId);
    const days: Array<number | null> = [];
    for (let index = count - 1; index >= 0; index--) {
      const bucket = today - index * DAY_MS;
      const row = rows?.get(keyOf({ size: "day", bucket }));
      days.push(row ? percent(row.up, row.down) : null);
    }
    return days;
  }

  /** Hands out what changed since the last save. */
  takeDirty(): RollupRow[] {
    const rows = [...this.dirty];
    this.dirty.clear();
    return rows;
  }

  /** Puts rows back after a failed save. */
  restoreDirty(rows: RollupRow[]): void {
    for (const row of rows) this.dirty.add(row);
  }

  forget(monitorId: number): void {
    this.byMonitor.delete(monitorId);
  }

  /** Drops old rows here and returns the cutoffs for the database. */
  prune(historyDays: number, now: number): { hours: number; days: number } {
    const hours = now - HOURS_KEPT * DAY_MS;
    const days = now - historyDays * DAY_MS;
    for (const rows of this.byMonitor.values()) {
      for (const [key, row] of rows) {
        if (row.bucket < (row.size === "hour" ? hours : days)) rows.delete(key);
      }
    }
    return { hours, days };
  }
}
