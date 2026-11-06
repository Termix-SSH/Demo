import { GitBranch } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { gitEnabled, panelEnabled } from "./enabled";
import { GitCard } from "./GitCard";
import { GitCompanion, useCompanionDefaults } from "./GitPanel";
import { GitTab } from "./GitTab";
import { gitWidget } from "./GitWidget";

const TAB_ID = "git";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, GitTab, {
    icon: GitBranch,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: GitBranch,
    kind: "open",
    order: 47,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && gitEnabled(host),
  });

  app.registerDashboardCard({
    id: "git-repos",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: GitCard,
  });

  app.registerCompanion(TAB_ID, GitCompanion, {
    icon: GitBranch,
    titleKey: "tab.title",
    order: 47,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && !!host?.enableSsh && panelEnabled(host),
    useDefaults: useCompanionDefaults,
  });

  app.registerAction("git.togglePanel", ((_handle: unknown, tab: unknown) =>
    app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: "git.togglePanel",
    titleKey: "companion.toggle",
    icon: GitBranch,
    kind: "button",
    order: 10,
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
  app.registerExtension("homepage.widgets", gitWidget);
}
