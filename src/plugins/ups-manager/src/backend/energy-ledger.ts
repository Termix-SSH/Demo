import { randomUUID } from "node:crypto";
import type {
  EnergyEpoch,
  EnergyHistory,
  EnergyPoint,
  EnergyReport,
  ElectricalReading,
  HistoryRange,
  Reading,
} from "../shared/types.js";
import { hourlyEnergy, integratePower, type PowerSample } from "./energy.js";
import type { SourceRow, Store } from "./store.js";

const DAY = 86400;
const RETENTION = 30 * DAY;

interface Document {
  version: 1;
  epochs: EnergyEpoch[];
  raw: EnergyPoint[];
  hours: EnergyPoint[];
}

interface State {
  document: Document;
  baseline: PowerSample | null;
  observation: PowerSample | null;
  electrical: ElectricalReading | null;
  error: string;
  pending: Document | null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonnegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function epoch(value: unknown): value is EnergyEpoch {
  return (
    record(value) &&
    typeof value.id === "string" &&
    typeof value.identity === "string" &&
    (value.origin === "reported" ||
      value.origin === "calculated-dc" ||
      value.origin === "unavailable") &&
    nonnegative(value.startedAt) &&
    nonnegative(value.lastAt) &&
    value.lastAt >= value.startedAt &&
    nonnegative(value.observedWh) &&
    nonnegative(value.coveredSec)
  );
}

function point(value: unknown): value is EnergyPoint {
  return (
    record(value) &&
    nonnegative(value.t) &&
    nonnegative(value.end) &&
    value.end > value.t &&
    typeof value.epoch === "string" &&
    nonnegative(value.wh) &&
    nonnegative(value.coveredSec) &&
    nonnegative(value.observedSec) &&
    value.coveredSec <= value.observedSec + 0.001 &&
    value.observedSec <= value.end - value.t + 1 &&
    [
      "outputW",
      "minW",
      "maxW",
      "inputW",
      "inputA",
      "outputA",
      "batteryA",
    ].every(
      (key) =>
        value[key] === null ||
        (key === "batteryA" ? finite(value[key]) : nonnegative(value[key])),
    ) &&
    (value.coveredSec > 0
      ? nonnegative(value.outputW) &&
        nonnegative(value.minW) &&
        nonnegative(value.maxW) &&
        value.minW <= value.maxW
      : value.wh === 0 &&
        value.outputW === null &&
        value.minW === null &&
        value.maxW === null)
  );
}

export function decodeEnergy(payload: string): Document {
  const data: unknown = JSON.parse(payload);
  if (
    !record(data) ||
    data.version !== 1 ||
    !Array.isArray(data.epochs) ||
    !data.epochs.every(epoch) ||
    !Array.isArray(data.raw) ||
    !data.raw.every(point) ||
    !Array.isArray(data.hours) ||
    !data.hours.every(point)
  ) {
    throw new Error(
      "Invalid energy state; restore a backup before resuming tracking",
    );
  }
  const ids = new Set(data.epochs.map((e) => e.id));
  if (
    ids.size !== data.epochs.length ||
    [...data.raw, ...data.hours].some((p) => !ids.has(p.epoch))
  ) {
    throw new Error("Invalid energy epoch references");
  }
  return { version: 1, epochs: data.epochs, raw: data.raw, hours: data.hours };
}

export function sourceIdentity(row: SourceRow, reading: Reading): string {
  return JSON.stringify([
    row.hostId,
    row.backend,
    row.target,
    row.snmpVersion,
    row.inputDc === true,
    row.outputDc === true,
    reading.manufacturer,
    reading.model,
    reading.serial,
  ]);
}

function weighted(
  a: number | null,
  b: number | null,
  left: number,
  right: number,
): number | null {
  // Missing support for either endpoint is not a measured zero.
  return a === null || b === null
    ? null
    : (a * left + b * right) / (left + right);
}

function merge(a: EnergyPoint, b: EnergyPoint): EnergyPoint {
  const wh = a.wh + b.wh;
  const coveredSec = a.coveredSec + b.coveredSec;
  return {
    t: Math.min(a.t, b.t),
    end: Math.max(a.end, b.end),
    epoch: a.epoch,
    wh,
    coveredSec,
    observedSec: a.observedSec + b.observedSec,
    outputW: coveredSec ? (wh * 3600) / coveredSec : null,
    minW:
      a.minW === null
        ? b.minW
        : b.minW === null
          ? a.minW
          : Math.min(a.minW, b.minW),
    maxW:
      a.maxW === null
        ? b.maxW
        : b.maxW === null
          ? a.maxW
          : Math.max(a.maxW, b.maxW),
    inputW: weighted(a.inputW, b.inputW, a.observedSec, b.observedSec),
    inputA: weighted(a.inputA, b.inputA, a.observedSec, b.observedSec),
    outputA: weighted(a.outputA, b.outputA, a.observedSec, b.observedSec),
    batteryA: weighted(a.batteryA, b.batteryA, a.observedSec, b.observedSec),
  };
}

/** Callers serialize all reads/writes for a source, including edits and deletion. */
export class EnergyLedger {
  private readonly states = new Map<number, State>();
  private readonly loads = new Map<number, Promise<void>>();

  constructor(
    private readonly store: Pick<Store, "readEnergy" | "writeEnergy">,
    private readonly log: { warn: (message: string) => void },
  ) {}

  async load(id: number): Promise<void> {
    if (this.states.has(id)) return;
    const pending = this.loads.get(id);
    if (pending) return pending;
    const loading = this.read(id);
    this.loads.set(id, loading);
    try {
      await loading;
    } finally {
      this.loads.delete(id);
    }
  }

  private async read(id: number): Promise<void> {
    try {
      const payload = await this.store.readEnergy(id);
      this.states.set(id, {
        document:
          payload === null
            ? { version: 1, epochs: [], raw: [], hours: [] }
            : decodeEnergy(payload),
        baseline: null,
        observation: null,
        electrical: null,
        error: "",
        pending: null,
      });
    } catch (error) {
      this.log.warn(`Energy state unavailable for UPS ${id}: ${String(error)}`);
      // Do not install an empty state that could overwrite damaged totals.
      throw error;
    }
  }

  break(id: number): void {
    const state = this.states.get(id);
    if (state) {
      state.baseline = null;
      state.observation = null;
      state.electrical = null;
    }
  }

  forget(id: number): void {
    this.states.delete(id);
  }

  report(id: number): EnergyReport {
    const state = this.states.get(id);
    const epochs = state?.document.epochs ?? [];
    return {
      epochs: epochs.map((e) => ({ ...e })),
      current:
        epochs.length && epochs[epochs.length - 1].origin !== "unavailable"
          ? { ...epochs[epochs.length - 1] }
          : null,
      persistenceError: state?.error ?? "",
      correlationStatus: "timestamped-service-required",
    };
  }

  async sample(
    row: SourceRow,
    reading: Reading,
    at: number,
    monotonic = performance.now() / 1000,
  ): Promise<void> {
    if (!nonnegative(at) || !nonnegative(monotonic)) {
      this.break(row.id);
      throw new Error("Invalid energy observation timestamp");
    }
    await this.load(row.id);
    const state = this.states.get(row.id)!;
    if (state.pending) {
      await this.store.writeEnergy(row.id, JSON.stringify(state.pending));
      state.document = state.pending;
      state.pending = null;
      state.error = "";
    }
    const electrical = reading.electrical;
    const watts = electrical?.outputPowerW;
    const origin =
      nonnegative(watts) &&
      (electrical?.outputPowerOrigin === "reported" ||
        electrical?.outputPowerOrigin === "calculated-dc")
        ? electrical.outputPowerOrigin
        : "unavailable";
    const next = structuredClone(state.document);
    const identity = sourceIdentity(row, reading);
    let active = next.epochs[next.epochs.length - 1];
    if (
      !active ||
      active.identity !== identity ||
      (origin !== "unavailable" && active.origin !== origin)
    ) {
      active = {
        id: randomUUID(),
        identity,
        origin,
        startedAt: at,
        lastAt: at,
        observedWh: 0,
        coveredSec: 0,
      };
      next.epochs.push(active);
      state.baseline = null;
      state.observation = null;
      state.electrical = null;
    }
    // Clock reversals never move stored time backwards or bridge old samples.
    if (
      at < active.lastAt ||
      (at === active.lastAt && state.baseline !== null)
    ) {
      this.break(row.id);
      this.log.warn(
        `Energy observation time did not advance for UPS ${row.id}; continuity was broken`,
      );
      return;
    }
    const current: PowerSample = {
      at,
      monotonic,
      watts: watts ?? 0,
      epoch: active.id,
    };
    const interval =
      origin === "unavailable" ? null : integratePower(state.baseline, current);
    const observed = integratePower(state.observation, {
      ...current,
      watts: 0,
    });
    if (observed) {
      active.observedWh += interval?.wh ?? 0;
      active.coveredSec += interval?.coveredSec ?? 0;
      const mean = (
        key:
          | "inputPowerW"
          | "inputCurrentA"
          | "outputCurrentA"
          | "batteryCurrentA",
        left = 0,
        right = 1,
      ) => {
        const previous = state.electrical?.[key];
        const currentValue = electrical?.[key];
        return finite(previous) && finite(currentValue)
          ? previous + ((currentValue - previous) * (left + right)) / 2
          : null;
      };
      const averages = {
        inputW:
          state.electrical?.inputPowerOrigin === electrical?.inputPowerOrigin
            ? mean("inputPowerW")
            : null,
        inputA: mean("inputCurrentA"),
        outputA: mean("outputCurrentA"),
        batteryA: mean("batteryCurrentA"),
      };
      const p: EnergyPoint = {
        t: observed.start,
        end: observed.end,
        epoch: active.id,
        wh: interval?.wh ?? 0,
        coveredSec: interval?.coveredSec ?? 0,
        observedSec: observed.coveredSec,
        outputW: interval ? (interval.wh * 3600) / interval.coveredSec : null,
        minW: interval ? Math.min(interval.startW, interval.endW) : null,
        maxW: interval ? Math.max(interval.startW, interval.endW) : null,
        ...averages,
      };
      next.raw.push(p);
      for (const slice of hourlyEnergy(interval ?? observed)) {
        const start = Math.max(observed.start, slice.hour);
        const end = Math.min(observed.end, slice.hour + 3600);
        const left = (start - observed.start) / (observed.end - observed.start);
        const right = (end - observed.start) / (observed.end - observed.start);
        const startW = interval
          ? interval.startW + (interval.endW - interval.startW) * left
          : null;
        const endW = interval
          ? interval.startW + (interval.endW - interval.startW) * right
          : null;
        const hourPoint = {
          ...p,
          t: start,
          end,
          wh: interval ? slice.wh : 0,
          coveredSec: interval ? slice.coveredSec : 0,
          observedSec: slice.coveredSec,
          outputW: interval ? (slice.wh * 3600) / slice.coveredSec : null,
          minW:
            startW !== null && endW !== null ? Math.min(startW, endW) : null,
          maxW:
            startW !== null && endW !== null ? Math.max(startW, endW) : null,
          inputW:
            state.electrical?.inputPowerOrigin === electrical?.inputPowerOrigin
              ? mean("inputPowerW", left, right)
              : null,
          inputA: mean("inputCurrentA", left, right),
          outputA: mean("outputCurrentA", left, right),
          batteryA: mean("batteryCurrentA", left, right),
        };
        const old = next.hours.findIndex(
          (h) =>
            Math.floor(h.t / 3600) * 3600 === slice.hour && h.epoch === p.epoch,
        );
        if (old >= 0) next.hours[old] = merge(next.hours[old], hourPoint);
        else next.hours.push(hourPoint);
      }
    }
    active.lastAt = Math.max(active.lastAt, at);
    next.raw = next.raw.filter((p) => p.end > at - DAY).slice(-6000);
    next.hours = next.hours.filter((p) => p.end > at - RETENTION).slice(-2160);
    try {
      await this.store.writeEnergy(row.id, JSON.stringify(next));
      state.document = next;
      state.baseline = origin === "unavailable" ? null : current;
      state.observation = { ...current, watts: 0 };
      state.electrical = electrical ?? null;
      state.error = "";
    } catch (error) {
      state.baseline = null;
      state.observation = null;
      state.electrical = null;
      state.pending = next;
      state.error =
        "Energy persistence failed; totals are incomplete. Check server logs and storage.";
      this.log.warn(
        `Could not persist energy for UPS ${row.id}: ${String(error)}`,
      );
      // A retry rewrites the identical full snapshot, never re-adds its interval.
      throw error;
    }
  }

  history(
    id: number,
    range: HistoryRange,
    now = Date.now() / 1000,
  ): EnergyHistory {
    const report = this.report(id);
    const state = this.states.get(id);
    const start =
      now - (range === "24h" ? DAY : range === "7d" ? 7 * DAY : RETENTION);
    const resolutionSec = range === "24h" ? 300 : 3600;
    // Include only complete stored buckets within the requested range.
    // Never prorate missing measurements or reconstruct energy from rounded W.
    const observed =
      (range === "24h" ? state?.document.raw : state?.document.hours)
        ?.filter((p) => p.t >= start && p.end <= now)
        .sort((a, b) => a.t - b.t) ?? [];
    const observedWh = observed.reduce((sum, p) => sum + p.wh, 0);
    const coveredSec = observed.reduce((sum, p) => sum + p.coveredSec, 0);
    const points: EnergyPoint[] = [];
    for (const p of observed) {
      const previous = points[points.length - 1];
      if (
        range === "24h" &&
        previous &&
        previous.epoch === p.epoch &&
        previous.end === p.t &&
        Math.floor(previous.t / 300) === Math.floor(p.t / 300)
      ) {
        points[points.length - 1] = merge(previous, p);
      } else points.push({ ...p });
    }
    const first = report.epochs[0]?.startedAt ?? now;
    const eligibleSec = Math.max(0, now - Math.max(start, first));
    return {
      ...report,
      range,
      start,
      end: now,
      points,
      observedWh,
      coveredSec,
      eligibleSec,
      coveragePct: eligibleSec
        ? Math.min(100, (100 * coveredSec) / eligibleSec)
        : 0,
      averageW: coveredSec ? (observedWh * 3600) / coveredSec : null,
      sampledPeakW: points.some((p) => p.maxW !== null)
        ? Math.max(...points.flatMap((p) => (p.maxW === null ? [] : [p.maxW])))
        : null,
      incomplete: !eligibleSec || coveredSec < eligibleSec - 0.001,
      resolutionSec,
    };
  }
}
