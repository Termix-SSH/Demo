import { DatabaseBackup } from "lucide-react";
import type {
  DashboardCardEntry,
  TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { initApi, listJobs } from "./api";
import { BackupsTab } from "./BackupsTab";
import { backupsPanelEnabled } from "./enabled";
import { HostBackupsTab } from "./HostBackupsTab";
import { JobsCard } from "./JobsCard";
import {
  BackupsCompanion,
  useBackupsCompanionDefaults,
} from "./BackupsCompanion";

import { jobsWidget } from "./JobsWidget";

const TAB_ID = "backups";
const HOST_TAB_ID = "backups-host";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerRailItem({
    id: TAB_ID,
    icon: DatabaseBackup,
    titleKey: "tab.title",
    kind: "tab",
    permission: "use",
  });
  app.registerTab(TAB_ID, BackupsTab, {
    icon: DatabaseBackup,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerTab(HOST_TAB_ID, HostBackupsTab, {
    icon: DatabaseBackup,
    titleKey: "hostTab.title",
    requiresHost: true,
    noHostMessageKey: "hostTab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: HOST_TAB_ID,
    titleKey: "hostTab.title",
    icon: DatabaseBackup,
    kind: "open",
    order: 49,
    tabType: HOST_TAB_ID,
    tray: false,
    when: (host) => canUse && !!host.enableSsh,
  });

  app.registerDashboardCard({
    id: "backups-jobs",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    defaultSize: { w: 4 },
    entries: async (): Promise<DashboardCardEntry[]> => {
      if (!(await app.hasPermission("use"))) return [];
      const all: DashboardCardEntry = {
        key: "all",
        title: app.t("card.all"),
        group: app.t("tab.title"),
        kind: "card",
        config: {},
        defaultSize: { w: 4 },
      };
      const jobs = await listJobs().catch(() => []);
      return [
        all,
        ...jobs.map((job) => ({
          key: `job-${job.id}`,
          title: job.name,
          description: app.t("card.oneJob"),
          group: app.t("tab.title"),
          kind: "card" as const,
          config: { jobId: job.id },
          defaultSize: { w: 3 },
        })),
      ];
    },
    component: JobsCard,
  });

  app.registerExtension("homepage.widgets", jobsWidget);
  app.registerPaletteEntry({
    id: "backups.open",
    titleKey: "tab.title",
    icon: DatabaseBackup,
    keywords: ["backup", "restic", "snapshot", "restore"],
    scope: "global",
    run: (shell) => shell.openSingletonTab(TAB_ID),
  });
  app.registerPaletteEntry({
    id: "backups.host",
    titleKey: "hostTab.title",
    icon: DatabaseBackup,
    keywords: ["backup", "restic", "snapshot", "run job"],
    scope: "host",
    when: (host) => canUse && !!host?.enableSsh,
    run: (shell, host) => {
      if (host) shell.openTab(host, HOST_TAB_ID);
    },
  });

  if (typeof app.registerCompanion === "function") {
    app.registerCompanion(HOST_TAB_ID, BackupsCompanion, {
      icon: DatabaseBackup,
      titleKey: "hostTab.title",
      order: 49,
      tabTypes: ["terminal"],
      when: (_tab, host) =>
        canUse && !!host?.enableSsh && backupsPanelEnabled(host),
      useDefaults: useBackupsCompanionDefaults,
    });
    app.registerAction("backups.togglePanel", ((
      _handle: unknown,
      tab: unknown,
    ) => app.toggleCompanion(tab as never, HOST_TAB_ID)) as never);
    app.registerSlotContribution("tab.menu", {
      actionId: "backups.togglePanel",
      titleKey: "nav.togglePanel",
      icon: DatabaseBackup,
      kind: "button",
      order: 49,
      when: (context) =>
        (context.tab as { type?: string } | null)?.type === "terminal",
    });
  }
}
