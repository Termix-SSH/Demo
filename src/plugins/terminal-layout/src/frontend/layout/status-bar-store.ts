import { useSyncExternalStore } from "react";

const KEY = "terminal-layout.statusBar";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "hidden";
  } catch {
    return true;
  }
}

let shown = read();

export function statusBarShown(): boolean {
  return shown;
}

export function setStatusBarShown(next: boolean) {
  shown = next;
  try {
    if (next) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "hidden");
  } catch {
    // Kept for this page only.
  }
  for (const listener of listeners) listener();
}

export function toggleStatusBar() {
  setStatusBarShown(!shown);
}

export function useStatusBarShown(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => shown,
    () => true,
  );
}
