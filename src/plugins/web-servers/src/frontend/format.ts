import type { ListRowTone } from "@termix-ssh/plugin-sdk/ui";
import type { ServerKind } from "../shared/types";

export const SERVER_LABEL: Record<ServerKind, string> = {
  nginx: "nginx",
  apache: "Apache",
  caddy: "Caddy",
};

export const isUp = (state: string) =>
  state === "active" || state === "reloading";

export function stateTone(state: string): ListRowTone {
  if (isUp(state)) return "success";
  if (state === "failed") return "destructive";
  return "warning";
}

export function badgeTone(
  state: string,
): "success" | "warning" | "destructive" {
  const tone = stateTone(state);
  return tone === "success" || tone === "destructive" ? tone : "warning";
}

export function expiryTone(days: number | null): ListRowTone {
  if (days === null) return "brand";
  if (days < 0) return "destructive";
  if (days <= 14) return "warning";
  return "success";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
