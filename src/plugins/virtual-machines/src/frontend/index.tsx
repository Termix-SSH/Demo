import type { ComponentType } from "react";
import { MonitorCog } from "lucide-react";
import type { TabProps, TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { AllVmsTab } from "./AllVmsTab";
import { initApi } from "./api";
import { vmsEnabled, vmsPanelEnabled } from "./format";
import { VmCompanion, VmHostTile, useVmCompanionDefaults } from "./VmPanel";
import { VmHostTab } from "./VmHostTab";
import { VmHostsCard } from "./VmHostsCard";
import { vmSummaryWidget } from "./VmSummaryWidget";

const TAB_ID = "virtual-machines";
const ALL_ID = "virtual-machines-all";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, VmHostTab, {
    icon: MonitorCog,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerTab(ALL_ID, AllVmsTab as ComponentType<TabProps>, {
    icon: MonitorCog,
    titleKey: "all.title",
    singleton: true,
    hostless: true,
    panelFrame: true,
  });
  app.registerRailItem({
    id: ALL_ID,
    icon: MonitorCog,
    titleKey: "all.title",
    kind: "tab",
    group: "tools",
    promotable: true,
    permission: "use",
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: MonitorCog,
    kind: "open",
    order: 47,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && vmsEnabled(host),
  });
  app.registerPaletteEntry({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: MonitorCog,
    keywords: ["vm", "kvm", "libvirt", "qemu", "virsh"],
    scope: "host",
    when: (host) => canUse && !!host && vmsEnabled(host),
    run: (shell, host) => {
      if (host) shell.openTab(host, TAB_ID);
    },
  });
  app.registerPaletteEntry({
    id: ALL_ID,
    titleKey: "all.title",
    icon: MonitorCog,
    keywords: ["vm", "kvm", "libvirt", "qemu"],
    scope: "global",
    when: () => canUse,
    run: (shell) => shell.openSingletonTab(ALL_ID),
  });

  app.registerDashboardCard({
    id: "vm-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: VmHostsCard,
  });

  app.registerCompanion(TAB_ID, VmCompanion, {
    icon: MonitorCog,
    titleKey: "tab.title",
    order: 46,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && !!host?.enableSsh && vmsPanelEnabled(host),
    useDefaults: useVmCompanionDefaults,
  });
  app.registerAction("virtual-machines.togglePanel", ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: "virtual-machines.togglePanel",
    titleKey: "companion.toggle",
    icon: MonitorCog,
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
        vmsPanelEnabled((tab.host ?? tab.hostConfig) as object)
      );
    },
  });

  app.registerSlotContribution("host-page.tiles", {
    actionId: "virtual-machines.hostTile",
    titleKey: "tab.title",
    icon: MonitorCog,
    kind: "component",
    component: VmHostTile as unknown as ComponentType<Record<string, unknown>>,
    when: (context) => canUse && vmsEnabled(context.host as object),
  });

  app.registerExtension("homepage.widgets", vmSummaryWidget);
}
