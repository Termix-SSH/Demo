import { useMemo } from "react";
import { Search, Server, Settings, House, type LucideIcon } from "lucide-react";
import {
  getTabType,
  useRailItems,
  type RailItemDef,
} from "@termix-ssh/plugin-sdk/ui";

// Destinations the layout draws itself.
const OWN_ITEMS = new Set([
  "hosts",
  "credentials",
  "connections",
  "quick-connect",
  "plugins",
]);

/**
 * Plugin pages for the Tools menu. Only a page that stands on its own: a single
 * tab that needs no host. Panels, per host tools and sessions are left out,
 * since they need a host or terminal picked first (those open from a host card).
 */
export function useMoreItems(): RailItemDef[] {
  const items = useRailItems();
  return useMemo(
    () =>
      items.filter((item) => {
        if (item.hidden || OWN_ITEMS.has(item.id)) return false;
        const tab = getTabType(item.id);
        return (
          !!tab &&
          !!tab.singleton &&
          !!tab.hostless &&
          !tab.multiInstance &&
          !tab.session &&
          !tab.requiresHost
        );
      }),
    [items],
  );
}

export interface NavButton {
  id: "home" | "hosts" | "search" | "settings";
  labelKey: string;
  icon: LucideIcon;
}

export const NAV_BUTTONS: NavButton[] = [
  { id: "home", labelKey: "nav.home", icon: House },
  { id: "hosts", labelKey: "nav.hosts", icon: Server },
  { id: "search", labelKey: "nav.search", icon: Search },
  { id: "settings", labelKey: "nav.settings", icon: Settings },
];

/** The name a tab shows. Core names the Hosts tab "Manage", so it is renamed here. */
export function tabTitle(
  tab: { type: string; label: string; customLabel?: string },
  t: (key: string) => string,
): string {
  if (tab.type === "dashboard") return t("nav.home");
  if (tab.type === "host-manager") return t("nav.hosts");
  return tab.customLabel || tab.label;
}
