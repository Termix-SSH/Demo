import { ScrollText } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { LogsCompanion, useLogsCompanionDefaults } from "./LogsCompanion";
import { LogsTab } from "./LogsTab";

const TAB_ID = "log-search";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerRailItem({
    id: TAB_ID,
    icon: ScrollText,
    titleKey: "tab.title",
    kind: "tab",
    permission: "use",
    promotable: true,
  });
  app.registerTab(TAB_ID, LogsTab, {
    icon: ScrollText,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerPaletteEntry({
    id: "open",
    titleKey: "tab.title",
    icon: ScrollText,
    keywords: ["logs", "search", "journal", "grep", "docker"],
    scope: "global",
    run: (shell) => shell.openSingletonTab(TAB_ID),
  });
  const panelOn = (host: object | null | undefined) => {
    const all = (
      host as {
        pluginSettings?: Record<string, Record<string, unknown>>;
      } | null
    )?.pluginSettings;
    const st = all?.[TAB_ID];
    return st?.enableLogSearch !== false && st?.showPanel !== false;
  };
  app.registerCompanion(TAB_ID, LogsCompanion, {
    icon: ScrollText,
    titleKey: "tab.title",
    order: 140,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && !!host?.enableSsh && panelOn(host),
    useDefaults: useLogsCompanionDefaults,
  });
  app.registerAction(`${TAB_ID}.togglePanel`, ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: `${TAB_ID}.togglePanel`,
    titleKey: "companion.toggle",
    icon: ScrollText,
    kind: "button",
    order: 17,
    when: (context) => {
      const tab = context.tab as {
        type?: string;
        host?: unknown;
        hostConfig?: unknown;
      } | null;
      return (
        tab?.type === "terminal" &&
        panelOn((tab.host ?? tab.hostConfig) as object)
      );
    },
  });
}
