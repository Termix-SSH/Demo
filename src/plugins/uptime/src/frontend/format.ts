import type { MonitorStatus, MonitorView } from "../shared/types";

export const POLL_MS = 15_000;

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

export function toneOf(status: MonitorStatus): Tone {
  switch (status) {
    case "up":
      return "ok";
    case "down":
      return "bad";
    case "pending":
      return "warn";
    case "maintenance":
      return "info";
    default:
      return "idle";
  }
}

/** The address or thing a monitor looks at, for a row. */
export function targetOf(monitor: MonitorView, hostName?: string): string {
  const { config, type } = monitor;
  switch (type) {
    case "http":
      return config.url ?? "";
    case "tcp":
      return `${config.target}:${config.port}`;
    case "tls":
      return `${config.target}:${config.port ?? 443}`;
    case "ping":
      return config.target ?? "";
    case "dns":
      return `${config.target} ${config.recordType ?? "A"}`;
    case "docker":
      return `${config.container} | ${hostName ?? ""}`;
    case "systemd":
      return `${config.unit} | ${hostName ?? ""}`;
    case "host":
    case "command":
      return hostName ?? "";
    default:
      return "";
  }
}

export function percentText(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

export function latencyText(value: number | null): string {
  return value === null ? "-" : `${value} ms`;
}

export function whenText(ms: number | null, locale?: string): string {
  return ms === null ? "-" : new Date(ms).toLocaleString(locale);
}

export function lengthText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d`;
}

export function uptimeTone(
  value: number | null,
): "default" | "ok" | "warn" | "bad" {
  if (value === null) return "default";
  if (value >= 99.9) return "ok";
  return value >= 95 ? "warn" : "bad";
}

/** Row stripe for a monitor status. */
export function rowToneOf(
  status: MonitorStatus,
): "brand" | "warning" | "destructive" | "muted" {
  switch (status) {
    case "up":
    case "maintenance":
      return "brand";
    case "down":
      return "destructive";
    case "pending":
      return "warning";
    default:
      return "muted";
  }
}
