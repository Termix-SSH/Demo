import { useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import type { RailGroup } from "@/sidebar/rail-items";

/**
 * Destinations the rail and the palette can offer, and where each came from.
 *
 * The rail was a hardcoded array, so "Docker adds a tab" was a line of prose in
 * the plugin list and nothing more. This is the same registry shape the
 * dashboard already uses for cards, which is what makes uninstalling a plugin
 * actually remove its destination instead of leaving it greyed out.
 */

export interface NavItemDef {
  id: string;
  label: string;
  icon: LucideIcon;
  group: RailGroup;
  /** null for built-ins; the plugin id when a plugin contributed it. */
  pluginId?: string | null;
  /** False while the owning plugin is installed but not running. */
  running?: boolean;
}

const registry = new Map<string, NavItemDef>();
const listeners = new Set<() => void>();
let snapshot: NavItemDef[] = [];

function emit() {
  // A new array each time so useSyncExternalStore sees a changed reference.
  snapshot = Array.from(registry.values());
  listeners.forEach((fn) => fn());
}

export function registerNavItem(def: NavItemDef): void {
  registry.set(def.id, def);
  emit();
}

/** Withdraws a plugin's destinations when it is uninstalled. */
export function unregisterNavItemsByPlugin(pluginId: string): void {
  let changed = false;
  for (const [id, def] of registry) {
    if (def.pluginId === pluginId) {
      registry.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

export function getNavItem(id: string): NavItemDef | undefined {
  return registry.get(id);
}

export function getNavItems(): NavItemDef[] {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavItems(): NavItemDef[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
