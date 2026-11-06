import type { StatusTone } from "@termix-ssh/plugin-sdk/ui";
import type { VmState } from "../shared/types";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const power = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** power;
  return `${value >= 100 || power === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[power]}`;
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
}

export function stateTone(state: VmState): StatusTone {
  if (state === "running") return "ok";
  if (state === "crashed") return "bad";
  if (state === "paused" || state === "pmsuspended" || state === "shutdown") {
    return "warn";
  }
  return "idle";
}

export function statusText(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" | ");
}

export function settingsOf(host: object | null | undefined) {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.["virtual-machines"];
}

export function vmsEnabled(host: object | null | undefined): boolean {
  return settingsOf(host)?.enableVirtualMachines === true;
}

export function vmsPanelEnabled(host: object | null | undefined): boolean {
  return vmsEnabled(host) && settingsOf(host)?.showPanel !== false;
}
