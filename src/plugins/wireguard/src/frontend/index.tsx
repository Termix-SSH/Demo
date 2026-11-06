import type { ComponentType } from "react";
import { Network } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { wireguardEnabled, wireguardPanelEnabled } from "./enabled";
import { WireguardCard } from "./WireguardCard";
import { WireguardTab } from "./WireguardTab";
import {
  WireguardCompanion,
  useWireguardCompanionDefaults,
} from "./WireguardCompanion";
import { WireguardHostsCard } from "./WireguardHostsCard";

const TAB_ID = "wireguard";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, WireguardTab, {
    icon: Network,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Network,
    kind: "open",
    order: 47,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && wireguardEnabled(host),
  });

  // Fills the WireGuard card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "wireguard_manager",
    titleKey: "manager.title",
    kind: "component",
    component: WireguardCard as unknown as ComponentType<
      Record<string, unknown>
    >,
  });

  app.registerDashboardCard({
    id: "wireguard-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: WireguardHostsCard,
  });

  if (typeof app.registerCompanion === "function") {
    app.registerCompanion(TAB_ID, WireguardCompanion, {
      icon: Network,
      titleKey: "tab.title",
      order: 47,
      tabTypes: ["terminal"],
      when: (_tab, host) =>
        canUse && !!host?.enableSsh && wireguardPanelEnabled(host),
      useDefaults: useWireguardCompanionDefaults,
    });
    app.registerAction("wireguard.togglePanel", ((
      _handle: unknown,
      tab: unknown,
    ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
    app.registerSlotContribution("tab.menu", {
      actionId: "wireguard.togglePanel",
      titleKey: "nav.togglePanel",
      icon: Network,
      kind: "button",
      order: 47,
      when: (context) =>
        (context.tab as { type?: string } | null)?.type === "terminal",
    });
  }
}
