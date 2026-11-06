import type { ComponentType } from "react";
import { Clock } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { CronCard } from "./CronCard";
import { CronHostsCard } from "./CronHostsCard";
import { CronTab } from "./CronTab";
import { cronEnabled } from "./enabled";

const TAB_ID = "cron";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, CronTab, {
    icon: Clock,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Clock,
    kind: "open",
    order: 48,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && cronEnabled(host),
  });

  app.registerDashboardCard({
    id: "cron-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: CronHostsCard,
  });

  // Fills the Cron card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "cron_manager",
    titleKey: "manager.title",
    kind: "component",
    component: CronCard as unknown as ComponentType<Record<string, unknown>>,
  });
}
