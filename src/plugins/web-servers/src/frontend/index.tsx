import type { ComponentType } from "react";
import { Earth } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { panelEnabled, webServersEnabled } from "./enabled";
import { HostsCard } from "./HostsCard";
import { ManagerCard } from "./ManagerCard";
import { WebServersCompanion, useCompanionDefaults } from "./WebServersPanel";
import { WebServersTab } from "./WebServersTab";
import { webServersWidget } from "./WebServersWidget";

const TAB_ID = "web-servers";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, WebServersTab, {
    icon: Earth,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Earth,
    kind: "open",
    order: 49,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && webServersEnabled(host),
  });

  app.registerDashboardCard({
    id: "web-servers-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: HostsCard,
  });

  app.registerCompanion(TAB_ID, WebServersCompanion, {
    icon: Earth,
    titleKey: "tab.title",
    order: 46,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && !!host?.enableSsh && panelEnabled(host),
    useDefaults: useCompanionDefaults,
  });

  app.registerAction("web-servers.togglePanel", ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: "web-servers.togglePanel",
    titleKey: "companion.toggle",
    icon: Earth,
    kind: "button",
    order: 9,
    when: (context) => {
      const tab = context.tab as {
        type?: string;
        host?: unknown;
        hostConfig?: unknown;
      } | null;
      return (
        tab?.type === "terminal" &&
        panelEnabled((tab.host ?? tab.hostConfig) as object)
      );
    },
  });

  // Fills the Web Servers card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "webserver_manager",
    titleKey: "manager.title",
    kind: "component",
    component: ManagerCard as unknown as ComponentType<Record<string, unknown>>,
  });
  app.registerExtension("homepage.widgets", webServersWidget);
}
