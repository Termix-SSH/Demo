import { useSyncExternalStore } from "react";

/**
 * Which host actions the user put in or took out of the row's connect bar.
 * The hosts panel owns the preference and mirrors it here, so every row can
 * read it without its own fetch.
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

/**
 * Whether an action shows in the bar: the user's choice, else its own. With a
 * host page, tools live on that page, so only ways to connect and the page
 * itself show unless the user put a tool back.
 */
export function showsInBar(
  barActions: Record<string, boolean>,
  action: { id: string; tray?: boolean; kind?: string; tabType?: string },
  hostPage = false,
): boolean {
  const chosen = barActions[action.id];
  if (chosen !== undefined) return chosen;
  if (hostPage && action.kind === "open" && action.tabType !== HOST_PAGE_TAB) {
    return false;
  }
  return action.tray !== false;
}
