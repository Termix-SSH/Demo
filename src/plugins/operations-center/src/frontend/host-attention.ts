import { useEffect, useSyncExternalStore } from "react";
import { getCatalog, getSignals } from "./api";

export interface HostAttention {
  tone: "warn" | "fail";
  /** Signal titles with their labels, for a tooltip. */
  lines: string[];
}

const POLL_MS = 60_000;

/** Hosts with a mounted badge, counted so rows can come and go. */
const watched = new Map<string, number>();
let state = new Map<string, HostAttention>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let loading = false;
let again = false;
let warmups = 0;

function notify() {
  for (const listener of listeners) listener();
}

/** Status tiles that are warn or fail, per host, for the watched hosts only. */
export async function refreshAttention(): Promise<void> {
  if (watched.size === 0) return;
  if (loading) {
    again = true;
    return;
  }
  if (typeof document !== "undefined" && document.hidden) return;
  loading = true;
  let warming = false;
  try {
    const ids = [...watched.keys()].map(Number).filter(Number.isFinite);
    const [catalog, signals] = await Promise.all([
      getCatalog(document.documentElement.lang || "en"),
      getSignals(ids),
    ]);
    const next = new Map<string, HostAttention>();
    for (const signal of signals) {
      const def = catalog.signals.find((entry) => entry.id === signal.id);
      if (!def) continue;
      for (const read of signal.hosts) {
        if (read.state === "loading") warming = true;
        const status = read.state === "ok" ? read.value?.status : undefined;
        if (status !== "warn" && status !== "fail") continue;
        const key = String(read.hostId);
        const entry = next.get(key) ?? { tone: "warn", lines: [] };
        if (status === "fail") entry.tone = "fail";
        const label = read.value?.label;
        entry.lines.push(label ? `${def.title}: ${label}` : def.title);
        next.set(key, entry);
      }
    }
    state = next;
    notify();
  } catch {
    // Keep the last answer; the next poll tries again.
  } finally {
    loading = false;
  }
  // The server reads cold hosts behind its answer, so look again soon.
  if (again || (warming && warmups < 5)) {
    if (!again) warmups += 1;
    again = false;
    setTimeout(() => void refreshAttention(), warming ? 3000 : 0);
  } else if (!warming) {
    warmups = 0;
  }
}

function schedule() {
  if (timer || watched.size === 0) return;
  timer = setTimeout(() => {
    timer = null;
    void refreshAttention().finally(schedule);
  }, POLL_MS);
}

function watch(hostId: string): () => void {
  const fresh = !watched.has(hostId);
  watched.set(hostId, (watched.get(hostId) ?? 0) + 1);
  // Rows mount together, so one read covers a whole list.
  if (fresh) queueMicrotask(() => void refreshAttention());
  schedule();
  return () => {
    const count = (watched.get(hostId) ?? 1) - 1;
    if (count > 0) watched.set(hostId, count);
    else watched.delete(hostId);
    if (watched.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Off reads nothing and shows nothing, so a hidden dot costs no requests. */
export function useHostAttention(
  hostId: string | number,
  enabled = true,
): HostAttention | undefined {
  const key = String(hostId);
  useEffect(() => (enabled ? watch(key) : undefined), [enabled, key]);
  const value = useSyncExternalStore(subscribe, () => state.get(key));
  return enabled ? value : undefined;
}

export function resetAttention(): void {
  watched.clear();
  state = new Map();
  if (timer) clearTimeout(timer);
  timer = null;
  loading = false;
  again = false;
  warmups = 0;
}
