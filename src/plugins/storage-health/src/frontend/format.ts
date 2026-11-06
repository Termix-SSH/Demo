import type { Health } from "../shared/types";

export function enabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.["storage-health"]?.enableStorage === true;
}

/** On for the host, and the terminal panel not switched off. */
export function panelEnabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return enabled(host) && all?.["storage-health"]?.showPanel !== false;
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

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** "2y 41d", "37d 4h" or "5h". */
export function formatHours(hours: number | null): string {
  if (hours === null) return "-";
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ${Math.round(hours % 24)}h`;
  return `${Math.floor(days / 365)}y ${days % 365}d`;
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null ? "-" : value.toFixed(digits);
}

export function timeAgo(at: number | null, now = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}
