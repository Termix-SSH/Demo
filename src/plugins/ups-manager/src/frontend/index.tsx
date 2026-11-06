import type { ComponentType } from "react";
import { BatteryCharging } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { enabled } from "./format";
import { UpsHostsCard } from "./UpsHostsCard";
import { UpsManagerCard } from "./UpsManagerCard";
import { UpsTab } from "./UpsTab";
import { upsWidget } from "./UpsWidget";

const TAB_ID = "ups-manager";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, UpsTab, {
    icon: BatteryCharging,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });

  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: BatteryCharging,
    kind: "open",
    order: 52,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && enabled(host),
  });

  app.registerDashboardCard({
    id: "ups-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: UpsHostsCard,
  });

  // Fills the UPS card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "ups_manager",
    titleKey: "manager.title",
    kind: "component",
    component: UpsManagerCard as unknown as ComponentType<
      Record<string, unknown>
    >,
  });
  app.registerExtension("homepage.widgets", upsWidget);
}
