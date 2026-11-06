import type { Flag, PowerState, Reading } from "../shared/types";

export function enabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.["ups-manager"]?.enableUps === true;
}

/** "1h 20m", "45m" or "30s". */
export function formatRuntime(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatNumber(value: number | null, digits = 0): string {
  return value === null ? "-" : value.toFixed(digits);
}

export type Tone = "default" | "ok" | "warn" | "bad";

/** How a reading should look. Low battery and overload are bad, battery power is a warning. */
export function toneOf(reading: Reading | null): Tone {
  if (!reading) return "default";
  if (
    reading.flags.includes("low-battery") ||
    reading.flags.includes("overload")
  )
    return "bad";
  if (reading.state === "battery" || reading.flags.includes("replace-battery"))
    return "warn";
  if (reading.state === "online") return "ok";
  return "default";
}

export function stateKey(state: PowerState): string {
  return `state.${state}`;
}

export function flagKey(flag: Flag): string {
  return `flag.${flag}`;
}

export function timeAgo(at: number | null, now = Date.now()): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}
