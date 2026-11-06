import type { ComponentType } from "react";
import { Package } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { packagesEnabled, packagesPanelEnabled } from "./enabled";
import { PackagesCard } from "./PackagesCard";
import {
  PackagesCompanion,
  usePackagesCompanionDefaults,
} from "./PackagesCompanion";
import { PackagesTab } from "./PackagesTab";
import { UpdatesCard } from "./UpdatesCard";
import { updatesWidget } from "./UpdatesWidget";

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

  app.registerExtension("homepage.widgets", updatesWidget);

  if (typeof app.registerCompanion === "function") {
    app.registerCompanion(TAB_ID, PackagesCompanion, {
      icon: Package,
      titleKey: "tab.title",
      order: 46,
      tabTypes: ["terminal"],
      when: (_tab, host) =>
        canUse && !!host?.enableSsh && packagesPanelEnabled(host),
      useDefaults: usePackagesCompanionDefaults,
    });
    app.registerAction("package-manager.togglePanel", ((
      _handle: unknown,
      tab: unknown,
    ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
    app.registerSlotContribution("tab.menu", {
      actionId: "package-manager.togglePanel",
      titleKey: "nav.togglePanel",
      icon: Package,
      kind: "button",
      order: 46,
      when: (context) =>
        (context.tab as { type?: string } | null)?.type === "terminal",
    });
  }

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
