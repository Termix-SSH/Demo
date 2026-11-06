import { ShieldCheck } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { enabled } from "./format";
import { SecurityHostsCard } from "./SecurityHostsCard";
import { SecurityTab } from "./SecurityTab";

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
}
