import type { ListRowTone } from "@termix-ssh/plugin-sdk/ui";
import type { FileChange, RepoInfo } from "../shared/types";

/** "3 min ago" style text from an ISO date, in the browser's language. */
export function ago(iso: string, language?: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return rtf.format(seconds, "second");
}

export function repoTone(repo: RepoInfo): ListRowTone {
  if (repo.error || repo.conflicts) return "destructive";
  if (repo.auto?.failing) return "destructive";
  if (repo.changed || repo.untracked || repo.behind) return "warning";
  return "success";
}

export const isStaged = (f: FileChange) =>
  !f.untracked && f.index !== "." && f.index !== "?";
export const isUnstaged = (f: FileChange) =>
  f.untracked === true || f.tree !== ".";

/** One letter for the change kind. */
export function letter(code: string): string {
  return code === "." ? "" : code === "?" ? "U" : code;
}

export function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---"))
    return "text-muted-foreground";
  if (line.startsWith("+")) return "bg-success/10 text-success";
  if (line.startsWith("-")) return "bg-destructive/10 text-destructive";
  if (line.startsWith("@@")) return "text-accent-brand";
  return "";
}
