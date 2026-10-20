const STORAGE_KEY = "termix.loginSecurity.lastActive";

// Shared across tabs, so a busy tab keeps the quiet ones signed in too.
export function readLastActive(fallback: number): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > fallback ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function writeLastActive(at: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // Private windows can refuse storage; this tab still tracks itself.
  }
}

export const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;
