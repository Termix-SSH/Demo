import { Activity, LayoutDashboard, Table2, Zap } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { getCatalog, initApi } from "./api";
import { AttentionCard } from "./AttentionCard";
import { HostPage } from "./HostPage";
import { appliesTo } from "./hosts";
import { OperationsTab } from "./OperationsTab";
import { registerWidgets } from "./widgets";

const TAB = "operations";
const HOST_TAB = "host";

export function activate(app: TermixApp): void {
  initApi(app.api);
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB, OperationsTab, {
    icon: Activity,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
    persistent: true,
  });

  app.registerTab(HOST_TAB, HostPage, {
    icon: LayoutDashboard,
    titleKey: "host.title",
    requiresHost: true,
    noHostMessageKey: "host.noHost",
    persistent: true,
    ownBackground: true,
  });

  app.registerRailItem({
    id: TAB,
    icon: Activity,
    titleKey: "tab.title",
    kind: "tab",
    group: "tools",
    promotable: true,
    order: 5,
  });

  app.registerHostAction({
    id: "host-page",
    titleKey: "host.open",
    icon: LayoutDashboard,
    kind: "open",
    order: 1,
    tabType: HOST_TAB,
    overview: true,
    when: () => canUse,
  });

  app.registerDashboardCard({
    id: "attention",
    titleKey: "attention.title",
    defaultPanel: "main",
    defaultHeight: 240,
    frame: "framed",
    component: AttentionCard,
  });

  app.registerPaletteEntry({
    id: "open",
    titleKey: "tab.title",
    icon: Activity,
    keywords: ["actions", "run", "history", "approvals", "rollouts"],
    scope: "global",
    run: (shell) => shell.openSingletonTab(TAB),
  });

  app.registerPaletteEntry({
    id: "all-hosts",
    titleKey: "palette.allHosts",
    icon: Table2,
    keywords: ["containers", "services", "every host"],
    scope: "global",
    run: (shell) => shell.openSingletonTab(TAB, { data: { view: "allHosts" } }),
  });

  // Every declared action, so any plugin's actions are one search away.
  app.registerPaletteGroup({
    id: "actions",
    titleKey: "palette.actions",
    order: 40,
    load: async () => {
      if (!canUse) return [];
      const catalog = await getCatalog(
        document.documentElement.lang || "en",
      ).catch(() => null);
      const hosts = await app.listHosts().catch(() => []);
      return (catalog?.actions ?? [])
        .filter(
          (action) => action.available && action.surfaces?.palette !== false,
        )
        .filter((action) => action.scope !== "resource")
        .map((action) => ({
          id: action.id,
          title: action.title,
          description: action.pluginName,
          icon: Zap,
          keywords: [action.id, action.pluginName],
          hint: app.t("palette.run"),
          run: ({ shell, targetTab }) => {
            const host =
              (targetTab?.host as { id?: number } | undefined) ??
              hosts.find((entry) => appliesTo(action, entry));
            shell.openSingletonTab(TAB, {
              data: { view: "run", actionId: action.id, hostId: host?.id },
            });
          },
        }));
    },
  });

  registerWidgets(app);
}
