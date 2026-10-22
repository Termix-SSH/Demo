import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { AcmeStatusSetting } from "./AcmeStatusSetting";
import { AcmeCard } from "./AcmeCard";

export function activate(app: TermixApp): void {
  app.registerSettingsComponent("status", AcmeStatusSetting);
  app.registerDashboardCard({
    id: "acme-certificate",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 160,
    frame: "framed",
    component: AcmeCard,
  });
}

export function deactivate(): void {
  // Registrations through app are disposed by core.
}
