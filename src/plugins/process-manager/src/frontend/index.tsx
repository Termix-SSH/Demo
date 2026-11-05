import type { ComponentType } from "react";
import { Activity } from "lucide-react";
import {
  useSettings,
  type CompanionDefaults,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { HostTile, ProcessCard, ProcessesCompanion } from "./Compact";
import { processesEnabled, processesPanelEnabled } from "./enabled";
import { ProcessesTab } from "./ProcessesTab";
import { WatchesCard } from "./WatchesCard";

export { processesEnabled, processesPanelEnabled };

const TAB_ID = "process-manager";

/** Starting state of the panel, from the user's settings. */
export function useProcessesCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, ProcessesTab, {
    icon: Activity,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Activity,
    kind: "open",
    order: 46,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && processesEnabled(host),
  });

  app.registerDashboardCard({
    id: "process-watches",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: WatchesCard,
  });

  app.registerCompanion(TAB_ID, ProcessesCompanion, {
    icon: Activity,
    titleKey: "tab.title",
    order: 38,
    tabTypes: ["terminal"],
    when: (_tab, host) =>
      canUse && !!host?.enableSsh && processesPanelEnabled(host),
    useDefaults: useProcessesCompanionDefaults,
  });

  app.registerAction(`${TAB_ID}.togglePanel`, ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: `${TAB_ID}.togglePanel`,
    titleKey: "companion.toggle",
    icon: Activity,
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
        processesPanelEnabled((tab.host ?? tab.hostConfig) as object)
      );
    },
  });

  // Fills the Processes card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "process_inspector",
    titleKey: "card.metricsTitle",
    kind: "component",
    component: ProcessCard as unknown as ComponentType<Record<string, unknown>>,
  });

  // A tile on the Operations Center host page.
  app.registerSlotContribution("host-page.tiles", {
    actionId: `${TAB_ID}.hostTile`,
    titleKey: "tab.title",
    icon: Activity,
    kind: "component",
    component: HostTile as unknown as ComponentType<Record<string, unknown>>,
    when: (context: { host?: unknown }) =>
      canUse && processesEnabled(context.host as object),
  });
}
