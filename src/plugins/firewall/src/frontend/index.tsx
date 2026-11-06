import type { ComponentType } from "react";
import { BrickWall, ListChecks } from "lucide-react";
import type { TabProps, TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import {
  FirewallCompanion,
  useFirewallCompanionDefaults,
} from "./FirewallCompanion";
import { FirewallHostsCard } from "./FirewallHostsCard";
import { FirewallManagerCard } from "./FirewallManagerCard";
import { FirewallTab } from "./FirewallTab";
import { RuleSetsTab } from "./RuleSetsTab";
import { firewallWidget } from "./FirewallWidget";

const TAB_ID = "firewall";
const RULESETS_ID = "firewall-rulesets";

function settingsOf(host: object | null | undefined) {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.[TAB_ID];
}

export function firewallEnabled(host: object | null | undefined): boolean {
  return settingsOf(host)?.enableFirewall === true;
}

export function firewallPanelEnabled(host: object | null | undefined): boolean {
  return firewallEnabled(host) && settingsOf(host)?.showPanel !== false;
}

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, FirewallTab, {
    icon: BrickWall,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerTab(RULESETS_ID, RuleSetsTab as ComponentType<TabProps>, {
    icon: ListChecks,
    titleKey: "rulesets.title",
    singleton: true,
    hostless: true,
    panelFrame: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: BrickWall,
    kind: "open",
    order: 48,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && firewallEnabled(host),
  });

  app.registerDashboardCard({
    id: "firewall-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: FirewallHostsCard,
  });

  app.registerCompanion(TAB_ID, FirewallCompanion, {
    icon: BrickWall,
    titleKey: "tab.title",
    order: 45,
    tabTypes: ["terminal"],
    when: (_tab, host) =>
      canUse && !!host?.enableSsh && firewallPanelEnabled(host),
    useDefaults: useFirewallCompanionDefaults,
  });

  app.registerAction("firewall.togglePanel", ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: "firewall.togglePanel",
    titleKey: "companion.toggle",
    icon: BrickWall,
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
        firewallPanelEnabled((tab.host ?? tab.hostConfig) as object)
      );
    },
  });

  // Fills the firewall card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "firewall_manager",
    titleKey: "manager.title",
    kind: "component",
    component: FirewallManagerCard as unknown as ComponentType<
      Record<string, unknown>
    >,
  });
  app.registerExtension("homepage.widgets", firewallWidget);
}
