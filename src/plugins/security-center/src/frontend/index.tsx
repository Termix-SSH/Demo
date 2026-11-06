import { ShieldCheck } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { enabled, panelEnabled } from "./format";
import { SecurityHostsCard } from "./SecurityHostsCard";
import { SecurityTab } from "./SecurityTab";
import { securityWidget } from "./SecurityWidget";
import {
  SecurityCompanion,
  useSecurityCompanionDefaults,
} from "./SecurityCompanion";

const TAB_ID = "security-center";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, SecurityTab, {
    icon: ShieldCheck,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });

  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: ShieldCheck,
    kind: "open",
    order: 54,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && enabled(host),
  });

  app.registerDashboardCard({
    id: "security-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 240,
    frame: "framed",
    component: SecurityHostsCard,
  });
  app.registerExtension("homepage.widgets", securityWidget);

  app.registerCompanion(TAB_ID, SecurityCompanion, {
    icon: ShieldCheck,
    titleKey: "tab.title",
    order: 56,
    tabTypes: ["terminal"],
    when: (_tab, host) => canUse && !!host?.enableSsh && panelEnabled(host),
    useDefaults: useSecurityCompanionDefaults,
  });
  app.registerAction(`${TAB_ID}.togglePanel`, ((
    _handle: unknown,
    tab: unknown,
  ) => app.toggleCompanion(tab as never, TAB_ID)) as never);
  app.registerSlotContribution("tab.menu", {
    actionId: `${TAB_ID}.togglePanel`,
    titleKey: "companion.toggle",
    icon: ShieldCheck,
    kind: "button",
    order: 56,
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
}
