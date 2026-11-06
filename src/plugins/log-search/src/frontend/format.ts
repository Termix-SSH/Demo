import type { LogEntry } from "../shared/types";

export const RANGES = [
  { value: "15m", ms: 15 * 60_000 },
  { value: "1h", ms: 3_600_000 },
  { value: "6h", ms: 6 * 3_600_000 },
  { value: "24h", ms: 24 * 3_600_000 },
  { value: "7d", ms: 7 * 24 * 3_600_000 },
] as const;

export type RangeId = (typeof RANGES)[number]["value"];

export function rangeMs(id: RangeId): number {
  return RANGES.find((r) => r.value === id)?.ms ?? 3_600_000;
}

export function formatTime(time: number): string {
  return time ? new Date(time).toLocaleString() : "-";
}

/** Splits a line around its matches so the matches can be marked. */
export function highlight(
  text: string,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): Array<{ text: string; hit: boolean }> {
  if (!query) return [{ text, hit: false }];
  let re: RegExp;
  try {
    const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(source, caseSensitive ? "g" : "gi");
  } catch {
    return [{ text, hit: false }];
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    if (match[0] === "") break;
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), hit: false });
    parts.push({ text: match[0], hit: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

export function toPlainText(entries: LogEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.time ? new Date(e.time).toISOString() : "-"} ${e.host} ${e.source}:${e.origin} ${e.message}`,
    )
    .join("\n");
}
