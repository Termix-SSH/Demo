import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryPoint, HistoryRange, Reading } from "../shared/types.js";

/** Raw samples kept per drive: 24 hours at one every 15 minutes is 96, so keep 200. */
export const RAW_LIMIT = 200;
/** Hourly averages kept per drive: 30 days. */
export const HOUR_LIMIT = 720;
const HOUR = 3600;
const FIELDS = 4;

type Values = [number | null, number | null, number | null, number | null];

interface Bucket {
  t: number;
  sums: number[];
  counts: number[];
}

interface Series {
  raw: HistoryPoint[];
  hours: Bucket[];
}

function pointOf(t: number, v: Values): HistoryPoint {
  return { t, p: v[0], w: v[1], h: v[2], r: v[3] };
}

function average(sum: number, count: number): number | null {
  return count ? Math.round((sum / count) * 10) / 10 : null;
}

export function keyOf(hostId: number, device: string): string {
  return `${hostId}:${device}`;
}

/** Samples are kept in memory and in one small file, saved now and then. */
export class History {
  private readonly series = new Map<string, Series>();
  private dirty = false;

  constructor(private readonly dir: string | null) {}

  private file(): string | null {
    return this.dir ? path.join(this.dir, "history.json") : null;
  }

  async load(): Promise<void> {
    const file = this.file();
    if (!file) return;
    try {
      const data = JSON.parse(await readFile(file, "utf8")) as {
        series?: Record<string, Series>;
      };
      for (const [key, s] of Object.entries(data.series ?? {})) {
        if (Array.isArray(s?.raw) && Array.isArray(s?.hours)) {
          this.series.set(key, s);
        }
      }
    } catch {
      // No file yet, or it is damaged. Start empty.
    }
  }

  async flush(): Promise<void> {
    const file = this.file();
    if (!file || !this.dirty) return;
    this.dirty = false;
    const series: Record<string, Series> = {};
    for (const [key, s] of this.series) series[key] = s;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify({ v: 1, series }));
      await rename(temp, file);
    } catch {
      this.dirty = true;
    }
  }

  /** Records one sample for every drive in the reading. */
  add(hostId: number, atSec: number, reading: Reading): void {
    for (const d of reading.devices) {
      if (d.tempC === null && d.wearPct === null && d.powerOnHours === null) {
        continue;
      }
      const values: Values = [
        d.tempC,
        d.wearPct,
        d.powerOnHours,
        d.reallocated === null && d.pending === null
          ? null
          : (d.reallocated ?? 0) + (d.pending ?? 0),
      ];
      this.push(keyOf(hostId, d.id), atSec, values);
    }
  }

  private push(key: string, atSec: number, values: Values): void {
    let s = this.series.get(key);
    if (!s) {
      s = { raw: [], hours: [] };
      this.series.set(key, s);
    }
    s.raw.push(pointOf(atSec, values));
    if (s.raw.length > RAW_LIMIT) s.raw.splice(0, s.raw.length - RAW_LIMIT);

    const start = atSec - (atSec % HOUR);
    let bucket = s.hours[s.hours.length - 1];
    if (!bucket || bucket.t !== start) {
      bucket = {
        t: start,
        sums: new Array<number>(FIELDS).fill(0),
        counts: new Array<number>(FIELDS).fill(0),
      };
      s.hours.push(bucket);
      if (s.hours.length > HOUR_LIMIT) {
        s.hours.splice(0, s.hours.length - HOUR_LIMIT);
      }
    }
    values.forEach((value, index) => {
      if (value === null) return;
      bucket.sums[index] += value;
      bucket.counts[index] += 1;
    });
    this.dirty = true;
  }

  dropHost(hostId: number): void {
    const prefix = `${hostId}:`;
    for (const key of [...this.series.keys()]) {
      if (key.startsWith(prefix) && this.series.delete(key)) this.dirty = true;
    }
  }

  /** Points oldest first. 24h comes from raw samples, the rest from hourly averages. */
  range(
    hostId: number,
    device: string,
    range: HistoryRange,
    nowSec = Math.floor(Date.now() / 1000),
  ): HistoryPoint[] {
    const s = this.series.get(keyOf(hostId, device));
    if (!s) return [];
    if (range === "24h") return s.raw.filter((p) => p.t >= nowSec - 24 * HOUR);
    const since = nowSec - (range === "7d" ? 7 : 30) * 24 * HOUR;
    return s.hours
      .filter((b) => b.t + HOUR > since)
      .map((b) =>
        pointOf(b.t, [
          average(b.sums[0], b.counts[0]),
          average(b.sums[1], b.counts[1]),
          average(b.sums[2], b.counts[2]),
          average(b.sums[3], b.counts[3]),
        ]),
      );
  }
}
