import type { Health, Severity, VulnSeverity } from "../shared/types";

export function enabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.["security-center"]?.enableSecurity === true;
}

export type RowTone = "destructive" | "warning" | "success" | "muted";

export function rowTone(health: Health): RowTone {
  return health === "fail"
    ? "destructive"
    : health === "warn"
      ? "warning"
      : health === "ok"
        ? "success"
        : "muted";
}

export type StatTone = "default" | "ok" | "warn" | "bad";

export function statTone(health: Health): StatTone {
  return health === "fail"
    ? "bad"
    : health === "warn"
      ? "warn"
      : health === "ok"
        ? "ok"
        : "default";
}

export function severityTone(severity: Severity | VulnSeverity): RowTone {
  return severity === "critical"
    ? "destructive"
    : severity === "high" || severity === "medium"
      ? "warning"
      : "muted";
}

export function timeAgo(at: number | null, now = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

/** A short fingerprint for a list row. */
export function shortPrint(fingerprint: string): string {
  return fingerprint.length > 22
    ? `${fingerprint.slice(0, 14)}...${fingerprint.slice(-6)}`
    : fingerprint;
}
