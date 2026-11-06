import type { Health, SensorKind } from "../shared/types";

export function healthTone(health: Health | undefined) {
  if (health === "ok") return "ok" as const;
  if (health === "warning") return "warn" as const;
  if (health === "critical") return "bad" as const;
  return "idle" as const;
}

export function statusTone(
  status: string,
  health: Health | undefined,
): "ok" | "warn" | "bad" | "idle" {
  if (status === "down") return "bad";
  if (status === "up")
    return healthTone(health) === "idle" ? "ok" : healthTone(health);
  return "idle";
}

export function formatValue(value: number | undefined, unit?: string): string {
  if (value === undefined) return "";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${text} ${unit === "C" ? "°C" : unit}` : text;
}

export const SENSOR_ORDER: SensorKind[] = [
  "temperature",
  "fan",
  "voltage",
  "power",
  "psu",
  "other",
];
