export type RuleEffect = "allow" | "approve" | "deny";
export type Risk = "read" | "change" | "destructive";

/** Where a run came from, as rules match it. */
export const ORIGINS = [
  "ui",
  "api",
  "automation",
  "rollout",
  "drift",
  "fleet",
  "assistant",
  "approved",
  "mcp",
  "plugin",
] as const;
export type Origin = (typeof ORIGINS)[number];

export interface Rule {
  id: number;
  name: string;
  position: number;
  enabled: boolean;
  effect: RuleEffect;
  minRisk: Risk;
  origins: string[];
  pluginIds: string[];
  actionIds: string[];
  hostTags: string[];
  allowSelf: boolean;
  expiresInMinutes: number | null;
}

export interface TargetSpec {
  hostIds?: number[];
  tags?: string[];
  fleetIds?: number[];
}

export type BatchStatus =
  "draft" | "running" | "paused" | "stopped" | "done" | "failed";

export interface Batch {
  id: number;
  name: string;
  actionId: string;
  resourceKey: string | null;
  dryRun: boolean;
  canary: number;
  batchSize: number;
  pauseSeconds: number;
  stopAfterFailures: number;
  status: BatchStatus;
  pausedReason: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  counts: Record<string, number>;
}

export interface BatchTarget {
  id: number;
  hostId: number;
  hostName: string | null;
  position: number;
  status: string;
  runId: string | null;
  summary: string | null;
  error: string | null;
}

export interface Baseline {
  id: number;
  name: string;
  checkActionId: string;
  resourceKey: string | null;
  targets: TargetSpec;
  intervalMinutes: number;
  fixActionId: string | null;
  autoFix: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  counts: Record<string, number>;
}

export interface BaselineResult {
  hostId: number;
  hostName: string | null;
  state: "compliant" | "drifted" | "error";
  detail: string | null;
  checkedAt: string | null;
  changedAt: string | null;
}

/** Whether a check result means the host is as it should be. */
export function isCompliant(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const value = data as { compliant?: unknown; status?: unknown };
  if (typeof value.compliant === "boolean") return value.compliant;
  if (typeof value.status === "string") return value.status === "ok";
  return true;
}
