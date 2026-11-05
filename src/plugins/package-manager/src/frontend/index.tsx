import type { ComponentType } from "react";
import { Package } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { packagesEnabled } from "./enabled";
import { PackagesCard } from "./PackagesCard";
import { PackagesTab } from "./PackagesTab";
import { UpdatesCard } from "./UpdatesCard";

const TAB_ID = "package-manager";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, PackagesTab, {
    icon: Package,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Package,
    kind: "open",
    order: 46,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && packagesEnabled(host),
  });

  app.registerDashboardCard({
    id: "package-updates",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: UpdatesCard,
  });

  // Fills the Packages card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "package_manager",
    titleKey: "manager.title",
    kind: "component",
    component: PackagesCard as unknown as ComponentType<
      Record<string, unknown>
    >,
  });
}
