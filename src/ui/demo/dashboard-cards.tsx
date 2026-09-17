import { useSyncExternalStore } from "react";
import type { LucideIcon } from "lucide-react";
import type { Host, TabType } from "@/types/ui-types";

/**
 * What the dashboard can show, and where each thing came from.
 *
 * The dashboard used to hardcode its five cards in one JSX tree, so there was
 * no way to reorder them, hide one, or let a plugin add another. Everything is
 * a registered section now, which is also what makes "Docker adds a dashboard
 * card" mean something real rather than a line of prose in the plugin list.
 *
 * A section is not necessarily a card: it declares how it wants to be framed.
 * "bare" sections (the stat strips) draw their own full-bleed row with no
 * header, which is what keeps the top of the dashboard tight instead of
 * boxing every number separately.
 */

export interface DashboardCardContext {
  hosts: Host[];
  credentialCount: number;
  activeTunnelCount: number;
  openTab: (host: Host, type: TabType) => void;
  openSingleton: (type: TabType) => void;
}

export type DashboardPanelId = "main" | "side";

export interface DashboardCardDef {
  id: string;
  label: string;
  icon: LucideIcon;
  /** "framed" gets a titled header; "bare" draws itself edge to edge. */
  frame: "framed" | "bare";
  /** Where it lands when first added, and how tall. null means it flexes. */
  defaultPanel: DashboardPanelId;
  defaultHeight: number | null;
  /** Off by default; the user adds it from the tray. */
  optional?: boolean;
  /** null for built-ins; the plugin id when a plugin contributed it. */
  pluginId?: string | null;
  render: (ctx: DashboardCardContext) => React.ReactNode;
}

const registry = new Map<string, DashboardCardDef>();
const listeners = new Set<() => void>();
let snapshot: DashboardCardDef[] = [];

function emit() {
  // A new array each time so useSyncExternalStore sees a changed reference.
  snapshot = Array.from(registry.values());
  listeners.forEach((fn) => fn());
}

export function registerDashboardCard(def: DashboardCardDef): void {
  registry.set(def.id, def);
  emit();
}

/** Withdraws a plugin's cards when it is uninstalled. */
export function unregisterDashboardCardsByPlugin(pluginId: string): void {
  let changed = false;
  for (const [id, def] of registry) {
    if (def.pluginId === pluginId) {
      registry.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

export function getDashboardCard(id: string): DashboardCardDef | undefined {
  return registry.get(id);
}

export function getDashboardCards(): DashboardCardDef[] {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Re-renders when a plugin adds or removes a card. Reading the registry
 * during render with no subscription is fine when everything registers at
 * import time, but not when plugins install while running.
 */
export function useDashboardCards(): DashboardCardDef[] {
  return useSyncExternalStore(subscribe, getDashboardCards, getDashboardCards);
}
