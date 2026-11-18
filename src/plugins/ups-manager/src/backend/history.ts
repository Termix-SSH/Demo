import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryPoint, HistoryRange, Reading } from "../shared/types.js";

/** Raw samples kept per UPS: 24 hours at one every 30 seconds. */
export const RAW_LIMIT = 2880;
/** Hourly averages kept per UPS: 30 days. */
export const HOUR_LIMIT = 720;
const HOUR = 3600;
const FIELDS = 5;

type Values = [
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

interface Bucket {
  t: number;
  sums: number[];
  counts: number[];
}

interface Series {
  raw: HistoryPoint[];
  hours: Bucket[];
}

function valuesOf(reading: Reading): Values {
  return [
    reading.chargePct,
    reading.runtimeSec,
    reading.loadOrigin === "estimated" ? null : reading.loadPct,
    reading.inputV,
    reading.outputV,
  ];
}

function pointOf(t: number, v: Values): HistoryPoint {
  return { t, c: v[0], r: v[1], l: v[2], i: v[3], o: v[4] };
}

function average(sum: number, count: number): number | null {
  return count ? Math.round((sum / count) * 10) / 10 : null;
}

/** Samples are kept in memory and in one small file, saved now and then. */
export class History {
  private readonly series = new Map<number, Series>();
  private dirty = false;
  private loadFailed = false;
  private writing: Promise<void> = Promise.resolve();
  error = "";

  constructor(
    private readonly dir: string | null,
    private readonly log: { warn: (message: string) => void } = console,
  ) {}

  private file(): string | null {
    return this.dir ? path.join(this.dir, "history.json") : null;
  }

  async load(): Promise<void> {
    const file = this.file();
    if (!file) return;
    try {
      const data = JSON.parse(await readFile(file, "utf8")) as {
        sources?: Record<string, Series>;
      };
      if (
        !data.sources ||
        typeof data.sources !== "object" ||
        Array.isArray(data.sources)
      )
        throw new Error("Missing history sources");
      for (const [id, s] of Object.entries(data.sources)) {
        if (
          !Number.isSafeInteger(Number(id)) ||
          Number(id) < 1 ||
          !Array.isArray(s?.raw) ||
          !Array.isArray(s?.hours) ||
          !s.raw.every(
            (p) =>
              Number.isFinite(p?.t) &&
              ["c", "r", "l", "i", "o"].every((key) => {
                const value = p[key as keyof HistoryPoint];
                return (
                  value === null ||
                  (typeof value === "number" && Number.isFinite(value))
                );
              }),
          ) ||
          !s.hours.every(
            (b) =>
              Number.isFinite(b?.t) &&
              Array.isArray(b.sums) &&
              Array.isArray(b.counts) &&
              b.sums.length === FIELDS &&
              b.counts.length === FIELDS &&
              b.sums.every(Number.isFinite) &&
              b.counts.every((n) => Number.isSafeInteger(n) && n >= 0),
          )
        )
          throw new Error("Invalid history series");
        this.series.set(Number(id), s);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      this.series.clear();
      this.loadFailed = true;
      this.error =
        "UPS history could not be loaded. Restore a backup before saving history.";
      this.log.warn(`${this.error} ${String(error)}`);
    }
  }

  async flush(): Promise<void> {
    const result = this.writing.then(() => this.write());
    this.writing = result.catch(() => undefined);
    return result;
  }

  private async write(): Promise<void> {
    const file = this.file();
    if (!file || !this.dirty || this.loadFailed) return;
    this.dirty = false;
    const sources: Record<string, Series> = {};
    for (const [id, s] of this.series) sources[String(id)] = s;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      await writeFile(temp, JSON.stringify({ v: 1, sources }));
      await rename(temp, file);
      this.error = "";
    } catch (error) {
      this.dirty = true;
      this.error = "UPS history could not be saved. Check server storage.";
      this.log.warn(`${this.error} ${String(error)}`);
      throw error;
    }
  }

  add(sourceId: number, atSec: number, reading: Reading): void {
    if (this.loadFailed) return;
    let s = this.series.get(sourceId);
    if (!s) {
      s = { raw: [], hours: [] };
      this.series.set(sourceId, s);
    }
    const previous = s.raw[s.raw.length - 1];
    if (previous && atSec - previous.t < 30) return;
    const values = valuesOf(reading);
    s.raw = s.raw.filter((p) => p.t >= atSec - 24 * HOUR);
    s.hours = s.hours.filter((b) => b.t + HOUR > atSec - 30 * 24 * HOUR);
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
      if (s.hours.length > HOUR_LIMIT)
        s.hours.splice(0, s.hours.length - HOUR_LIMIT);
    }
    values.forEach((value, index) => {
      if (value === null) return;
      bucket.sums[index] += value;
      bucket.counts[index] += 1;
    });
    this.dirty = true;
  }

  drop(sourceId: number): void {
    if (this.series.delete(sourceId)) this.dirty = true;
  }

  /** Points oldest first. 24h comes from raw samples, the rest from hourly averages. */
  range(
    sourceId: number,
    range: HistoryRange,
    nowSec = Math.floor(Date.now() / 1000),
  ): HistoryPoint[] {
    const s = this.series.get(sourceId);
    if (!s) return [];
    if (range === "24h") {
      return downsample(
        s.raw.filter((p) => p.t >= nowSec - 24 * HOUR),
        288,
      );
    }
    const since = nowSec - (range === "7d" ? 7 : 30) * 24 * HOUR;
    return s.hours
      .filter((b) => b.t + HOUR > since)
      .map((b) =>
        pointOf(b.t, [
          average(b.sums[0], b.counts[0]),
          average(b.sums[1], b.counts[1]),
          average(b.sums[2], b.counts[2]),
          average(b.sums[3], b.counts[3]),
          average(b.sums[4], b.counts[4]),
        ]),
      );
  }
}

/** Averages groups of neighbours so a chart gets at most `max` points. */
export function downsample(
  points: HistoryPoint[],
  max: number,
): HistoryPoint[] {
  if (points.length <= max) return points;
  const size = Math.ceil(points.length / max);
  const out: HistoryPoint[] = [];
  for (let at = 0; at < points.length; at += size) {
    const group = points.slice(at, at + size);
    const mean = (key: "c" | "r" | "l" | "i" | "o"): number | null => {
      const values = group
        .map((p) => p[key])
        .filter((v): v is number => v !== null);
      return values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
            10
        : null;
    };
    out.push({
      t: group[group.length - 1].t,
      c: mean("c"),
      r: mean("r"),
      l: mean("l"),
      i: mean("i"),
      o: mean("o"),
    });
  }
  return out;
}
