import { useSyncExternalStore } from "react";

/**
 * Which tool a host page should show next. The page is opened with no tab
 * data so an open page for the host is reused, and the section rides here.
 */
export interface SectionRequest {
  section: string;
  /** Bumped on every request, so asking for the same section twice still moves. */
  seq: number;
  at: number;
}

/** A page that mounts later only takes a request this fresh. */
export const FRESH_MS = 5000;

const requests = new Map<string, SectionRequest>();
const listeners = new Set<() => void>();
let seq = 0;

export function requestSection(hostId: string | number, section: string) {
  seq += 1;
  requests.set(String(hostId), { section, seq, at: Date.now() });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSectionRequest(
  hostId: string | number | undefined,
): SectionRequest | undefined {
  return useSyncExternalStore(subscribe, () =>
    hostId === undefined ? undefined : requests.get(String(hostId)),
  );
}

export function resetSectionRequests(): void {
  requests.clear();
}
