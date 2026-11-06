import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Flag, Reading } from "../../shared/types.js";

/** A number from text like "12.5 Percent", or null. */
export function num(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const match = /-?\d+(?:\.\d+)?/.exec(value);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function emptyReading(): Reading {
  return {
    state: "unknown",
    flags: [],
    chargePct: null,
    runtimeSec: null,
    loadPct: null,
    inputV: null,
    outputV: null,
    batteryV: null,
    tempC: null,
    nominalW: null,
    manufacturer: "",
    model: "",
    serial: "",
    lastTest: "",
    rawStatus: "",
  };
}

export function addFlag(flags: Flag[], flag: Flag): void {
  if (!flags.includes(flag)) flags.push(flag);
}

/** Script text that explains a failure and stops. */
export function failWith(message: string): string {
  return `{ printf 'SCRIPT_ERR:%s\\n' ${shellQuote(message)}; exit 1; }`;
}

/** Script text that stops with the captured $out as the reason. */
export const FAIL_OUT = `{ printf 'SCRIPT_ERR:%s\\n' "$(printf '%s\\n' "$out" | grep -v '^Init SSL')"; exit 1; }`;

/** A script line that needs a command, or stops with a hint. */
export function needs(command: string, hint: string): string {
  return `command -v ${command} >/dev/null 2>&1 || ${failWith(hint)}`;
}
