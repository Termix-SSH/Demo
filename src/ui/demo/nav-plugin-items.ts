import { getPlugins, subscribePlugins } from "@/demo/plugins/plugin-store";
import {
  registerNavItem,
  unregisterNavItemsByPlugin,
} from "@/demo/nav-registry";
import { pluginIcon } from "@/demo/plugins/plugin-icons";
import type { RailGroup } from "@/sidebar/rail-items";

/**
 * Turns a plugin's declared destinations into real ones.
 *
 * Same three rules the dashboard bridge follows, for the same reason:
 *
 *  - uninstalled: the destination is withdrawn, and the rail drops it
 *  - disabled: it stays but is marked not running, rather than vanishing
 *    silently while the plugin is still installed
 *  - no `ui:surface` capability: nothing is registered at all, which is what
 *    makes that capability mean something
 */

function sync() {
  for (const plugin of getPlugins()) {
    const items = plugin.contributions?.navItems;

    // Withdrawing runs before the empty check so a plugin that drops its
    // destinations on update, or loses ui:surface, leaves none registered.
    const allowed = plugin.capabilities.includes("ui:surface");
    if (!items?.length || !plugin.installed || !allowed) {
      unregisterNavItemsByPlugin(plugin.id);
      continue;
    }

    const running = plugin.state === "enabled";
    for (const item of items) {
      registerNavItem({
        id: item.id,
        label: item.label,
        icon: pluginIcon(item.icon),
        group: item.group as RailGroup,
        pluginId: plugin.id,
        running,
      });
    }
  }
}

let started = false;

/** Follows the plugin store for the life of the app. */
export function startNavPluginItems(): void {
  if (started) return;
  started = true;
  sync();
  subscribePlugins(sync);
}
