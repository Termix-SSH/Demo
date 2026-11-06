import type { ComponentType } from "react";
import { Activity, ServerCog, Table2, Zap } from "lucide-react";
import type {
  CompanionProps,
  PluginHostRecord,
  PluginTabRecord,
  TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { getCatalog, initApi } from "./api";
import { AttentionCard } from "./AttentionCard";
import { HostPage } from "./HostPage";
import {
  AttentionBadge,
  HostCompanion,
  HostMenuActions,
  TabBarHostPageButton,
  openHostPage,
} from "./host-surfaces";
import { appliesTo } from "./hosts";
import { OperationsTab } from "./OperationsTab";
import { registerWidgets } from "./widgets";
import { HOST_TILES_SLOT } from "./tiles/HostGrid";
import {
  ACTION_CARD,
  ActionCard,
  SIGNAL_CARD,
  SignalCard,
  actionEntries,
  signalEntries,
} from "./tiles/DashboardTiles";

const TAB = "operations";
const HOST_TAB = "host";
/** Layouts call this to show a tool inside the host page. */
const OPEN_SECTION_ACTION = "host-page.open";
const FROM_TAB_ACTION = "host-page.fromTab";

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
    icon: ServerCog,
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
    icon: ServerCog,
    kind: "open",
    order: 1,
    tabType: HOST_TAB,
    overview: true,
    // Off host rows unless the user picks it in onboarding or Customize sidebar.
    tray: false,
    when: () => canUse,
  });

  // A layout's tool button: show that tool on the host's page.
  app.registerAction(OPEN_SECTION_ACTION, ((
    host: PluginHostRecord | undefined,
    section?: string,
  ) => {
    if (!canUse || !host) return false;
    openHostPage(app.tabs, host, section || "overview");
    return true;
  }) as never);

  app.registerAction(FROM_TAB_ACTION, ((
    _handle: unknown,
    tab?: PluginTabRecord,
  ) => {
    if (tab?.host) openHostPage(app.tabs, tab.host);
  }) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: FROM_TAB_ACTION,
    titleKey: "host.open",
    icon: ServerCog,
    kind: "button",
    when: ({ tab }) => {
      const target = tab as PluginTabRecord | undefined;
      return canUse && !!target?.host && target.type !== HOST_TAB;
    },
  });
  app.registerSlotContribution("tabbar.actions", {
    actionId: FROM_TAB_ACTION,
    titleKey: "host.open",
    kind: "component",
    order: 20,
    component: ((props: { targetTab?: PluginTabRecord; className?: string }) =>
      canUse ? (
        <TabBarHostPageButton {...props} shell={app.tabs} />
      ) : null) as unknown as ComponentType<Record<string, unknown>>,
  });

  app.registerCompanion(
    "operations",
    (props: CompanionProps) => <HostCompanion {...props} opener={app.tabs} />,
    {
      icon: ServerCog,
      titleKey: "companion.title",
      order: 5,
      tabTypes: ["terminal"],
      // Not on a terminal inside the host page: that page is already open.
      when: (tab, host) => canUse && !!host && !tab.id.startsWith("embed-"),
    },
  );

  app.registerHostBadge({
    id: "attention",
    when: () => canUse,
    order: 50,
    component: AttentionBadge,
  });

  // The host menu in a layout lists the host's actions.
  app.registerComponent("operations.hostMenu", ((props: {
    host: PluginHostRecord;
  }) =>
    canUse ? (
      <HostMenuActions host={props.host} shell={app.tabs} />
    ) : null) as unknown as ComponentType<Record<string, unknown>>);

  app.registerDashboardCard({
    id: "attention",
    titleKey: "attention.title",
    defaultPanel: "main",
    defaultHeight: 240,
    frame: "framed",
    component: AttentionCard,
  });

  // Any plugin's signals and actions as dashboard tiles, one per pick.
  app.registerDashboardCard({
    id: SIGNAL_CARD,
    titleKey: "tiles.signalCard",
    frame: "framed",
    defaultSize: { w: 4 },
    entries: (language) =>
      canUse ? signalEntries(language) : Promise.resolve([]),
    component: SignalCard,
  });
  app.registerDashboardCard({
    id: ACTION_CARD,
    titleKey: "tiles.actionCard",
    frame: "framed",
    defaultSize: { w: 3 },
    entries: (language) =>
      canUse ? actionEntries(language) : Promise.resolve([]),
    component: ActionCard,
  });

  // Other plugins add their own tiles to the host page here.
  app.declareActionSlot({ id: HOST_TILES_SLOT, accepts: ["component"] });

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
