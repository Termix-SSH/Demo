import type { Host } from "@/types/ui-types";
import { DEMO_HOSTS } from "@/demo/demo-data";

// Fixtures stay untouched so a refresh returns a known state. Edits made in the
// UI land here, and subscribers re-render.

let hosts: Host[] = DEMO_HOSTS.map((h) => ({ ...h }));
const listeners = new Set<() => void>();

export function getDemoHosts(): Host[] {
  return hosts;
}

export function addDemoHost(host: Host): void {
  hosts = [...hosts, host];
  listeners.forEach((fn) => fn());
}

export function updateDemoHost(id: string, updates: Partial<Host>): void {
  hosts = hosts.map((h) => (h.id === id ? { ...h, ...updates } : h));
  listeners.forEach((fn) => fn());
}

export function removeDemoHost(id: string): void {
  hosts = hosts.filter((h) => h.id !== id);
  listeners.forEach((fn) => fn());
}

export function subscribeDemoHosts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
