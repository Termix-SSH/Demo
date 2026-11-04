import type { ComponentType } from "react";
import { Network } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { wireguardEnabled } from "./enabled";
import { WireguardCard } from "./WireguardCard";
import { WireguardTab } from "./WireguardTab";

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
}
