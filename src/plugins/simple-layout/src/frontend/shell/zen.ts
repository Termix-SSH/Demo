import { useSyncExternalStore } from "react";

const KEY = "simple-layout.zen";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let zen = read();

export function isZen(): boolean {
  return zen;
}

/** Zen mode: a bare tab bar and nothing else. Kept for the next visit. */
export function setZen(next: boolean): void {
  zen = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // Storage can be blocked. It then lasts until the page reloads.
  }
  for (const listener of listeners) listener();
}

export function toggleZen(): void {
  setZen(!zen);
}

export function useZen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => zen,
  );
}

/** Ctrl+Alt+Z, or Cmd+Alt+Z on a Mac. */
export function isZenShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.altKey &&
    !event.shiftKey &&
    event.code === "KeyZ"
  );
}

/** Test seam. */
export function resetZen(): void {
  zen = read();
}
