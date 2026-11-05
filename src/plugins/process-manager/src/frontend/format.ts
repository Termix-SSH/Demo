import type { AppRow, ProcessRow } from "../shared/types";

export type Tone = "success" | "destructive" | "warning" | "muted" | "brand";

export function bytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size >= 10 || i === 0 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
}

/** A short span in seconds, like 3d 4h or 12m. */
export function span(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** running, sleeping, zombie, stopped or waiting, from a ps state. */
export function stateOf(stat: string): string {
  const c = stat.charAt(0);
  if (c === "R") return "running";
  if (c === "Z") return "zombie";
  if (c === "T" || c === "t") return "stopped";
  if (c === "D") return "waiting";
  return "sleeping";
}

export function processTone(p: ProcessRow): Tone {
  const state = stateOf(p.stat);
  if (state === "zombie") return "destructive";
  if (state === "stopped") return "warning";
  if (p.cpu >= 80) return "warning";
  return state === "running" ? "brand" : "muted";
}

export function appTone(app: AppRow): Tone {
  return app.health === "up"
    ? "success"
    : app.health === "wait"
      ? "warning"
      : "destructive";
}

export type SortKey = "cpu" | "mem" | "pid" | "age";

export function sortRows(rows: ProcessRow[], key: SortKey): ProcessRow[] {
  return [...rows].sort((a, b) =>
    key === "pid"
      ? a.pid - b.pid
      : key === "age"
        ? a.age - b.age
        : b[key] - a[key],
  );
}

export function filterRows(rows: ProcessRow[], text: string): ProcessRow[] {
  const q = text.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (p) =>
      p.args.toLowerCase().includes(q) ||
      p.command.toLowerCase().includes(q) ||
      p.user.toLowerCase().includes(q) ||
      String(p.pid) === q,
  );
}

/** Rows in tree order with their depth. Orphans become roots. */
export function treeRows(
  rows: ProcessRow[],
): Array<{ proc: ProcessRow; depth: number }> {
  const byPid = new Map(rows.map((p) => [p.pid, p]));
  const children = new Map<number, ProcessRow[]>();
  const roots: ProcessRow[] = [];
  for (const p of rows) {
    if (p.ppid && p.ppid !== p.pid && byPid.has(p.ppid)) {
      children.set(p.ppid, [...(children.get(p.ppid) ?? []), p]);
    } else {
      roots.push(p);
    }
  }
  const out: Array<{ proc: ProcessRow; depth: number }> = [];
  const seen = new Set<number>();
  const walk = (p: ProcessRow, depth: number) => {
    if (seen.has(p.pid)) return;
    seen.add(p.pid);
    out.push({ proc: p, depth });
    for (const c of children.get(p.pid) ?? []) walk(c, depth + 1);
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}
