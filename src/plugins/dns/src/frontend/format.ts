import type { HealthLevel } from "../shared/types";

export function expiryTone(
  daysLeft: number | null,
): "ok" | "warn" | "bad" | "idle" {
  if (daysLeft === null) return "idle";
  if (daysLeft < 0) return "bad";
  if (daysLeft <= 14) return "bad";
  if (daysLeft <= 30) return "warn";
  return "ok";
}

export function levelTone(level: HealthLevel): "ok" | "warn" | "bad" | "idle" {
  if (level === "ok") return "ok";
  if (level === "info") return "idle";
  return level === "fail" ? "bad" : "warn";
}

/** The TTL as people write it: 300 is 5m, 3600 is 1h. */
export function formatTtl(ttl: number, auto: boolean): string {
  if (auto && ttl === 1) return "Auto";
  if (ttl % 86400 === 0) return `${ttl / 86400}d`;
  if (ttl % 3600 === 0) return `${ttl / 3600}h`;
  if (ttl % 60 === 0) return `${ttl / 60}m`;
  return `${ttl}s`;
}

export function displayName(name: string, zone: string): string {
  return name === "@" ? zone : `${name}.${zone}`;
}
