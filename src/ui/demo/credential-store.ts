import type { Credential } from "@/types/ui-types";
import { DEMO_CREDENTIALS } from "@/demo/demo-data";

// Same shape as demo-store: fixtures stay untouched so a refresh returns a
// known state, and edits made in the UI land here.

let credentials: Credential[] = DEMO_CREDENTIALS.map((c) => ({ ...c }));
const listeners = new Set<() => void>();

export function getDemoCredentials(): Credential[] {
  return credentials;
}

export function addDemoCredential(credential: Credential): void {
  credentials = [...credentials, credential];
  listeners.forEach((fn) => fn());
}

export function updateDemoCredential(
  id: string,
  updates: Partial<Credential>,
): void {
  credentials = credentials.map((c) =>
    c.id === id ? { ...c, ...updates } : c,
  );
  listeners.forEach((fn) => fn());
}

export function removeDemoCredential(id: string): void {
  credentials = credentials.filter((c) => c.id !== id);
  listeners.forEach((fn) => fn());
}

export function subscribeDemoCredentials(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
