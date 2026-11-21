import { useSyncExternalStore } from "react";
import { invokeAction } from "@termix-ssh/plugin-sdk/frontend";

/**
 * Which host actions the user put in or took out of the row's connect bar.
 * The hosts panel owns the preference and mirrors it here, so every row can
 * read and change it without its own fetch.
 */
let current: Record<string, boolean> = {};
const listeners = new Set<() => void>();

export function setBarActions(next: Record<string, boolean>): void {
  const same =
    Object.keys(next).length === Object.keys(current).length &&
    Object.entries(next).every(([id, value]) => current[id] === value);
  if (same) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBarActions(): Record<string, boolean> {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

/** The tab type of a host page, when a plugin offers one. */
export const HOST_PAGE_TAB = "host";

/** Action a host page plugin registers to open its page at one tool. */
export const HOST_PAGE_OPEN_ACTION = "host-page.open";

/**
 * Where a host tool opens: its own tab, inside the host page, or only through
 * the host page (no connect buttons on the row, a click opens the page).
 */
export type HostToolsMode = "tab" | "page" | "only";

export function hostToolsMode(value: unknown): HostToolsMode {
  return value === "page" || value === "only" ? value : "tab";
}

/**
 * Whether an action shows in the bar: this host's choice, then the user's
 * default, then the action's own.
 */
export function showsInBar(
  barActions: Record<string, boolean>,
  action: { id: string; tray?: boolean },
  hostBar?: Record<string, boolean>,
): boolean {
  const own = hostBar?.[action.id];
  if (own !== undefined) return own;
  const chosen = barActions[action.id];
  if (chosen !== undefined) return chosen;
  return action.tray !== false;
}

/** One host's own row choices. Anything left out uses the defaults. */
export interface HostRowPrefs {
  /** Action id a click on the row runs. */
  click?: string;
  /** Row buttons shown or hidden on this host only. */
  bar?: Record<string, boolean>;
}

/** Reads the saved per host choices, dropping anything malformed. */
export function parseHostRows(value: unknown): Record<string, HostRowPrefs> {
  const out: Record<string, HostRowPrefs> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [hostId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const next: HostRowPrefs = {};
    if (typeof entry.click === "string" && entry.click)
      next.click = entry.click;
    if (entry.bar && typeof entry.bar === "object") {
      const bar: Record<string, boolean> = {};
      for (const [id, shown] of Object.entries(entry.bar)) {
        if (typeof shown === "boolean") bar[id] = shown;
      }
      if (Object.keys(bar).length > 0) next.bar = bar;
    }
    if (next.click || next.bar) out[hostId] = next;
  }
  return out;
}

/**
 * Applies a change to one host. A field set to undefined goes back to the
 * default, and a host with nothing of its own left is dropped.
 */
export function withHostRow(
  all: Record<string, HostRowPrefs>,
  hostId: string,
  patch: Partial<HostRowPrefs>,
): Record<string, HostRowPrefs> {
  const merged: HostRowPrefs = { ...all[hostId], ...patch };
  if (!merged.click) delete merged.click;
  if (!merged.bar || Object.keys(merged.bar).length === 0) delete merged.bar;
  const next = { ...all };
  if (merged.click || merged.bar) next[hostId] = merged;
  else delete next[hostId];
  return next;
}

let hostRows: Record<string, HostRowPrefs> = {};
let hostRowSaver: ((next: Record<string, HostRowPrefs>) => void) | null = null;
const hostRowListeners = new Set<() => void>();

/** The hosts panel mirrors the saved choices here. */
export function setHostRows(next: Record<string, HostRowPrefs>): void {
  if (next === hostRows) return;
  hostRows = next;
  for (const listener of hostRowListeners) listener();
}

/** The hosts panel hands in how to save the choices. */
export function setHostRowSaver(
  next: ((all: Record<string, HostRowPrefs>) => void) | null,
): void {
  hostRowSaver = next;
}

export function canChangeHostRows(): boolean {
  return hostRowSaver !== null;
}

/** Changes one host's choices, shown right away and saved behind. */
export function changeHostRow(
  hostId: string,
  patch: Partial<HostRowPrefs>,
): void {
  if (!hostRowSaver) return;
  const next = withHostRow(hostRows, hostId, patch);
  setHostRows(next);
  hostRowSaver(next);
}

function subscribeHostRows(listener: () => void): () => void {
  hostRowListeners.add(listener);
  return () => hostRowListeners.delete(listener);
}

/** One host's own choices. Only rows whose host changed re-render. */
export function useHostRowPrefs(hostId: string): HostRowPrefs | undefined {
  return useSyncExternalStore(
    subscribeHostRows,
    () => hostRows[hostId],
    () => hostRows[hostId],
  );
}

/** A tool that can open as a section of the host page. */
export function opensInHostPage(action: {
  kind?: string;
  tabType?: string;
  run?: unknown;
}): boolean {
  return (
    action.kind === "open" &&
    !action.run &&
    !!action.tabType &&
    action.tabType !== HOST_PAGE_TAB
  );
}

/**
 * Asks the host page plugin to show `section` on the host's page, reusing an
 * open page. False when no plugin answered, so the caller opens a tab instead.
 */
export async function openInHostPage(
  host: unknown,
  section: string,
): Promise<boolean> {
  try {
    return (await invokeAction(HOST_PAGE_OPEN_ACTION, host, section)) === true;
  } catch {
    return false;
  }
}
