import type { ComponentType } from "react";
import { HeartPulse } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { uptimeWidget } from "./HomepageWidget";
import {
  useHostDot,
  HostTile,
  UptimeCompanion,
  useUptimeCompanionDefaults,
} from "./HostPanels";
import { cardEntries, TAB_ID, UptimeCard } from "./UptimeCard";
import { UptimeTab } from "./UptimeTab";

export function activate(app: TermixApp): void {
  initApi(app.api);
  let canView = false;
  void app.hasPermission("view").then((allowed) => {
    canView = allowed;
  });

  app.registerRailItem({
    id: TAB_ID,
    icon: HeartPulse,
    titleKey: "tab.title",
    kind: "tab",
    permission: "view",
    promotable: true,
  });
  app.registerTab(TAB_ID, UptimeTab, {
    icon: HeartPulse,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerPaletteEntry({
    id: "open",
    titleKey: "tab.title",
    icon: HeartPulse,
    keywords: ["monitor", "status", "down", "ping", "kuma"],
    scope: "global",
    run: (shell) => shell.openSingletonTab(TAB_ID),
  });

  app.registerDashboardCard({
    id: "uptime-overview",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    defaultSize: { w: 4 },
    entries: () =>
      canView
        ? cardEntries(app.t as Parameters<typeof cardEntries>[0])
        : Promise.resolve([]),
    component: UptimeCard,
  });

  app.registerCompanion(TAB_ID, UptimeCompanion, {
    icon: HeartPulse,
    titleKey: "tab.title",
    order: 60,
    tabTypes: ["terminal"],
    when: () => canView,
    useDefaults: useUptimeCompanionDefaults,
  });

  app.registerHostBadge({
    id: "uptime-down",
    when: () => canView,
    useDot: useHostDot,
    order: 40,
  });

  // No row button: this is for the host page, which shows this host's monitors.
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: HeartPulse,
    kind: "open",
    tabType: TAB_ID,
    tray: false,
    order: 90,
    when: () => canView,
    run: (_host, shell) => shell.openSingletonTab(TAB_ID),
  });

  app.registerHostContextMenuItem({
    id: "add-monitor",
    titleKey: "host.add",
    icon: HeartPulse,
    when: () => canView,
    run: (host, shell) =>
      shell.openSingletonTab(TAB_ID, {
        data: { addForHost: Number(host.id) },
      }),
  });

  app.registerSlotContribution("host-page.tiles", {
    actionId: "uptime.hostTile",
    titleKey: "tab.title",
    icon: HeartPulse,
    kind: "component",
    component: HostTile as unknown as ComponentType<Record<string, unknown>>,
    when: () => canView,
  });

  app.registerExtension("homepage.widgets", uptimeWidget(app.t));
}
