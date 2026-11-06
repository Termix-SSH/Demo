import { SecurityError } from "./errors.js";
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
    throw new SecurityError(
      `${label} must be a whole number from ${min} to ${max}`,
    );
  }
  return n;
}

/** Reads the limits a user sent. Anything left out keeps its old value. */
export function parseConfig(
  body: Record<string, unknown>,
  current: ConfigInput = DEFAULT_CONFIG,
): ConfigInput {
  return {
    alerts: typeof body.alerts === "boolean" ? body.alerts : current.alerts,
    intervalMin: int(
      body.intervalMin,
      current.intervalMin,
      15,
      1440,
      "Key check interval",
    ),
    vulnIntervalH: int(
      body.vulnIntervalH,
      current.vulnIntervalH,
      1,
      168,
      "Scan interval",
    ),
    minRsaBits: int(
      body.minRsaBits,
      current.minRsaBits,
      2048,
      8192,
      "RSA size",
    ),
    keyMaxAgeDays: int(
      body.keyMaxAgeDays,
      current.keyMaxAgeDays,
      0,
      3650,
      "Key age limit",
    ),
  };
}

export function requireHostId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new SecurityError("The host id is not valid");
  }
  return n;
}

const ADVISORY_RE = /^[A-Za-z0-9][A-Za-z0-9._:+-]{1,79}$/;

export function requireAdvisory(value: unknown): string {
  const text = String(value ?? "");
  if (!ADVISORY_RE.test(text)) {
    throw new SecurityError("The advisory id is not valid");
  }
  return text;
}
