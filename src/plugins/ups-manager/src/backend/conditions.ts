import type { Reading } from "../shared/types.js";

/** Things worth an alert. A key is on while the UPS is in that state. */
export type Condition =
  | "on-battery"
  | "low-battery"
  | "replace-battery"
  | "overload"
  | "low-charge"
  | "low-runtime"
  | "unreachable"
  | "test-failed";

export const CONDITIONS: Condition[] = [
  "on-battery",
  "low-battery",
  "replace-battery",
  "overload",
  "low-charge",
  "low-runtime",
  "unreachable",
  "test-failed",
];

export interface Thresholds {
  lowCharge: number;
  lowRuntimeMin: number;
}

/** Misses in a row before a UPS counts as unreachable. */
export const UNREACHABLE_AFTER = 3;

const FAILED_TEST = /fail|warning|error|aborted|critical/i;

/**
 * The conditions that are on for a reading. Charge and runtime only count
 * while the UPS runs on battery, since a charging UPS is not in trouble.
 */
export function conditionsOf(
  reading: Reading,
  limits: Thresholds,
): Set<Condition> {
  const on = new Set<Condition>();
  const battery = reading.state === "battery";
  if (battery) on.add("on-battery");
  if (reading.flags.includes("low-battery")) on.add("low-battery");
  if (reading.flags.includes("replace-battery")) on.add("replace-battery");
  if (reading.flags.includes("overload")) on.add("overload");
  if (
    battery &&
    reading.chargePct !== null &&
    reading.chargePct <= limits.lowCharge
  )
    on.add("low-charge");
  if (
    battery &&
    limits.lowRuntimeMin > 0 &&
    reading.runtimeSec !== null &&
    reading.runtimeSec <= limits.lowRuntimeMin * 60
  )
    on.add("low-runtime");
  if (reading.lastTest && FAILED_TEST.test(reading.lastTest))
    on.add("test-failed");
  return on;
}

export interface Change {
  condition: Condition;
  /** True when it turned on, false when it cleared. */
  on: boolean;
}

/** What turned on or off between two states. */
export function diff(before: Set<Condition>, after: Set<Condition>): Change[] {
  const changes: Change[] = [];
  for (const condition of CONDITIONS) {
    const was = before.has(condition);
    const is = after.has(condition);
    if (was !== is) changes.push({ condition, on: is });
  }
  return changes;
}

export type Severity = "critical" | "warning" | "info";

export interface Message {
  title: string;
  body: string;
  severity: Severity;
}

function minutes(seconds: number | null): string {
  return seconds === null ? "unknown" : `${Math.round(seconds / 60)} min`;
}

/** Plain text for an event or alert. Clearing messages are info. */
export function messageFor(
  change: Change,
  reading: Reading | null,
  name: string,
): Message {
  const charge =
    reading?.chargePct === null || reading === null
      ? "unknown"
      : `${Math.round(reading.chargePct)}%`;
  const runtime = minutes(reading?.runtimeSec ?? null);
  if (!change.on) {
    const cleared: Record<Condition, string> = {
      "on-battery": `Power is back on ${name}`,
      "low-battery": `${name} battery is no longer low`,
      "replace-battery": `${name} battery replace warning cleared`,
      overload: `${name} is no longer overloaded`,
      "low-charge": `${name} charge is back above the limit`,
      "low-runtime": `${name} runtime is back above the limit`,
      unreachable: `${name} is reachable again`,
      "test-failed": `${name} self test no longer reports a problem`,
    };
    return { title: cleared[change.condition], body: "", severity: "info" };
  }
  switch (change.condition) {
    case "on-battery":
      return {
        title: `${name} is running on battery`,
        body: `Power was lost. Charge ${charge}, about ${runtime} left.`,
        severity: "critical",
      };
    case "low-battery":
      return {
        title: `${name} battery is low`,
        body: `Charge ${charge}, about ${runtime} left. Hosts on it may shut down soon.`,
        severity: "critical",
      };
    case "replace-battery":
      return {
        title: `${name} needs a new battery`,
        body: "The UPS reports that its battery should be replaced.",
        severity: "warning",
      };
    case "overload":
      return {
        title: `${name} is overloaded`,
        body: `Load is ${reading?.loadPct ?? "unknown"}%. Unplug something from it.`,
        severity: "critical",
      };
    case "low-charge":
      return {
        title: `${name} charge is low`,
        body: `Charge is ${charge} on battery.`,
        severity: "critical",
      };
    case "low-runtime":
      return {
        title: `${name} has little runtime left`,
        body: `About ${runtime} left on battery.`,
        severity: "critical",
      };
    case "unreachable":
      return {
        title: `Termix cannot read ${name}`,
        body: "The UPS did not answer several times in a row.",
        severity: "warning",
      };
    case "test-failed":
      return {
        title: `${name} self test problem`,
        body: `Last test result: ${reading?.lastTest ?? "unknown"}.`,
        severity: "warning",
      };
  }
}
