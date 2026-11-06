import { Workflow } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { AnsibleHostsCard } from "./AnsibleHostsCard";
import { AnsibleTab } from "./AnsibleTab";
import { initApi } from "./api";
import { ansibleEnabled } from "./enabled";

const TAB_ID = "ansible";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, AnsibleTab, {
    icon: Workflow,
    titleKey: "tab.title",
    requiresHost: true,
    noHostMessageKey: "tab.noHost",
    persistent: true,
  });
  app.registerHostAction({
    id: TAB_ID,
    titleKey: "tab.title",
    icon: Workflow,
    kind: "open",
    order: 49,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && ansibleEnabled(host),
  });
  app.registerDashboardCard({
    id: "ansible-hosts",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: AnsibleHostsCard,
  });
}
