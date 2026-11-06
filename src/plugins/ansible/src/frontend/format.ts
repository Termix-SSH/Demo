import type { RunState } from "../shared/types";

export type Tone = "ok" | "warn" | "bad" | "info" | "idle";

export const stateTone = (state: RunState): Tone =>
  state === "ok"
    ? "ok"
    : state === "running"
      ? "info"
      : state === "failed"
        ? "bad"
        : "idle";

export function formatTime(ms: number, language: string): string {
  return new Date(ms).toLocaleString(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDuration(from: number, to: number | null): string {
  const seconds = Math.max(0, Math.round(((to ?? Date.now()) - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m < 60
    ? `${m}m ${seconds % 60}s`
    : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
