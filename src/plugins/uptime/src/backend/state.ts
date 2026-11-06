import type { CheckResult, MonitorStatus } from "../shared/types.js";

/** Live state of one monitor. Only status and open reach the database. */
export interface RunState {
  status: MonitorStatus;
  since: number | null;
  failures: number;
  /** An incident is open. */
  open: boolean;
  lastAt: number | null;
  latencyMs: number | null;
  message: string;
  lastAlertAt: number | null;
}

export function freshState(): RunState {
  return {
    status: "unknown",
    since: null,
    failures: 0,
    open: false,
    lastAt: null,
    latencyMs: null,
    message: "",
    lastAlertAt: null,
  };
}

export type Transition = "down" | "up" | null;

export interface StepResult {
  state: RunState;
  transition: Transition;
  /** Failed but not down yet, so the next check comes sooner. */
  retry: boolean;
}

/** One check result applied to the state. Pure, so restarts and tests are simple. */
export function applyResult(
  previous: RunState,
  result: CheckResult,
  options: { retries: number; maintenance: boolean; now: number },
): StepResult {
  const { retries, maintenance, now } = options;
  const base: RunState = {
    ...previous,
    lastAt: now,
    latencyMs: result.latencyMs,
    message: result.message,
  };
  const withStatus = (status: MonitorStatus): RunState => ({
    ...base,
    status,
    since: previous.status === status ? previous.since : now,
  });

  if (result.ok) {
    const closes = previous.open;
    return {
      state: {
        ...withStatus(maintenance ? "maintenance" : "up"),
        failures: 0,
        open: false,
      },
      transition: closes ? "up" : null,
      retry: false,
    };
  }
  if (maintenance) {
    return {
      state: { ...withStatus("maintenance"), failures: 0 },
      transition: null,
      retry: false,
    };
  }
  const failures = previous.failures + 1;
  if (failures <= retries) {
    // A monitor already down stays down through a retry count reset.
    const status = previous.open ? "down" : "pending";
    return {
      state: { ...withStatus(status), failures },
      transition: null,
      retry: !previous.open,
    };
  }
  return {
    state: { ...withStatus("down"), failures, open: true },
    transition: previous.open ? null : "down",
    retry: false,
  };
}

/** True when a still open incident is due another alert. */
export function reminderDue(
  state: RunState,
  resendMinutes: number,
  now: number,
): boolean {
  if (!state.open || resendMinutes <= 0) return false;
  return now - (state.lastAlertAt ?? 0) >= resendMinutes * 60_000;
}

/** Warn once per step as a certificate gets close to its end. */
export const CERT_STEPS = [30, 14, 7] as const;

/** The step this many days falls in, or null when there is nothing to say. */
export function certStep(daysLeft: number, warnDays: number): number | null {
  if (daysLeft > warnDays) return null;
  const steps = [warnDays, ...CERT_STEPS.filter((step) => step < warnDays)];
  return steps.filter((step) => daysLeft <= step).at(-1) ?? null;
}
