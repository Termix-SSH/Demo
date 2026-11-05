import type { ComponentType } from "react";
import { Users } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { usersEnabled } from "./enabled";
import { UsersCard } from "./UsersCard";
import { UsersTab } from "./UsersTab";

const TAB_ID = "user-manager";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, UsersTab, {
    icon: Users,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Users,
    kind: "open",
    order: 49,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && usersEnabled(host),
  });

  // Fills the Users card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "user_manager",
    titleKey: "manager.title",
    kind: "component",
    component: UsersCard as unknown as ComponentType<Record<string, unknown>>,
  });
}
