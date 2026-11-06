import { StorageError } from "./errors.js";
import type { ConfigInput } from "./store.js";
import { DEFAULT_CONFIG } from "./store.js";

function int(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new StorageError(
      `${label} must be a whole number from ${min} to ${max}`,
    );
  }
  return n;
}

/** Reads the thresholds a user sent. Anything left out keeps its old value. */
export function parseConfig(
  body: Record<string, unknown>,
  current: ConfigInput = DEFAULT_CONFIG,
): ConfigInput {
  return {
    alerts: typeof body.alerts === "boolean" ? body.alerts : current.alerts,
    intervalMin: int(
      body.intervalMin,
      current.intervalMin,
      5,
      1440,
      "Interval",
    ),
    tempWarnC: int(
      body.tempWarnC,
      current.tempWarnC,
      0,
      120,
      "Warning temperature",
    ),
    tempCritC: int(
      body.tempCritC,
      current.tempCritC,
      0,
      150,
      "Critical temperature",
    ),
    wearWarnPct: int(
      body.wearWarnPct,
      current.wearWarnPct,
      1,
      94,
      "Wear warning",
    ),
    thinWarnPct: int(
      body.thinWarnPct,
      current.thinWarnPct,
      1,
      94,
      "Thin pool warning",
    ),
  };
}

export function requireHostId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new StorageError("The host id is not valid");
  }
  return n;
}
