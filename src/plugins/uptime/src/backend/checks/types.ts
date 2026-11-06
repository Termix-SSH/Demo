import type {
  CheckResult,
  MonitorConfig,
  MonitorSecrets,
  MonitorType,
} from "../../shared/types.js";

/** What a check needs to know about its monitor. */
export interface CheckTarget {
  id: number;
  type: MonitorType;
  config: MonitorConfig;
  secrets: MonitorSecrets;
  hostId: number | null;
  fromHostId: number | null;
  intervalSec: number;
  timeoutSec: number;
  /** Checks act as this user. */
  runAs: string;
}

export interface CheckEnv {
  allowPrivate: boolean;
  signal: AbortSignal;
}

export interface RemoteResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export type RemoteRun = (
  hostId: number,
  runAs: string,
  command: string,
  stdin: string | undefined,
  timeoutMs: number,
) => Promise<RemoteResult>;

export function failed(
  message: string,
  latencyMs: number | null = null,
): CheckResult {
  return { ok: false, latencyMs, message };
}

export function passed(message: string, latencyMs: number | null): CheckResult {
  return { ok: true, latencyMs, message };
}

export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message || error.message;
  }
  return String(error);
}

export const round = Math.round;
