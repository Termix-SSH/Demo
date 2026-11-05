import type { ComponentType } from "react";
import { ShieldCheck } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { initApi } from "./api";
import { CertificatesCard } from "./CertificatesCard";
import { CertificatesTab } from "./CertificatesTab";
import { certificatesEnabled } from "./enabled";
import { ExpiringCard } from "./ExpiringCard";

const TAB_ID = "certificates";

export function activate(app: TermixApp): void {
  initApi(app.api);
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab(TAB_ID, CertificatesTab, {
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
    order: 50,
    tabType: TAB_ID,
    when: (host) => canUse && !!host.enableSsh && certificatesEnabled(host),
  });

  app.registerDashboardCard({
    id: "certificates-expiring",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: ExpiringCard,
  });

  // Fills the SSL card in Host Metrics, when that plugin runs.
  app.registerSlotContribution("host-metrics.managers", {
    actionId: "ssl_manager",
    titleKey: "manager.title",
    kind: "component",
    component: CertificatesCard as unknown as ComponentType<
      Record<string, unknown>
    >,
  });
}
