import type { TabType } from "@/types/ui-types";
import { getPlugins } from "./plugin-store";

/**
 * Which plugin owns which destination.
 *
 * The three registries make a destination appear and disappear, but the tab
 * router is a static switch over a closed TabType union, so a tab that was
 * already open kept rendering its feature after the plugin behind it was
 * removed. This is the missing half: the router asks who owns a view before
 * drawing it, and refuses to draw one whose plugin is gone.
 *
 * Views with no entry here belong to Termix itself and always render.
 */
const OWNERS: Partial<Record<TabType, string>> = {
  terminal: "terminal",
  "local-terminal": "local-terminal",
  dashboard: "dashboard",
  files: "file-manager",
  "host-metrics": "host-metrics",
  tunnel: "tunnels",
  docker: "docker",
  "proxmox-stats": "proxmox",
  tmux_monitor: "tmux-monitor",
  snippets: "snippets",
  history: "command-history",
  "session-logs": "session-logs",
  "ssh-tools": "ssh-tools",
  macros: "macros",
  automations: "automations",
  alerts: "alerting",
  ai: "assistant",
  "termix-id": "termix-id",
  serial: "serial",
  rdp: "guacamole",
  vnc: "guacamole",
  telnet: "guacamole",
  network_graph: "network-topology",
  homepage: "homepage",
  "fleet-inventory": "fleet-inventory",
  "split-screen": "split-screen",
};

/** Rail destinations that are panels only, so they never reach TabType. */
const PANEL_OWNERS: Record<string, string> = {
  connections: "connections",
  "quick-connect": "quick-connect",
  fleets: "fleets",
  workspaces: "workspaces",
};

export type ViewOwnership =
  | { kind: "core" }
  | { kind: "ready"; pluginId: string; name: string }
  | { kind: "missing"; pluginId: string; name: string }
  | { kind: "stopped"; pluginId: string; name: string };

/** Who owns this view, and whether it is in a state that can be drawn. */
export function viewOwnership(view: string): ViewOwnership {
  const pluginId = OWNERS[view as TabType] ?? PANEL_OWNERS[view];
  if (!pluginId) return { kind: "core" };

  const plugin = getPlugins().find((p) => p.id === pluginId);
  // A view whose plugin is not in any registry is treated as core rather than
  // broken, so a missing fixture never blanks the app.
  if (!plugin) return { kind: "core" };

  const name = plugin.name;
  if (!plugin.installed) return { kind: "missing", pluginId, name };
  if (plugin.state !== "enabled") return { kind: "stopped", pluginId, name };
  return { kind: "ready", pluginId, name };
}

/** Tab types whose owning plugin is no longer installed. */
export function isViewWithdrawn(view: string): boolean {
  return viewOwnership(view).kind === "missing";
}
