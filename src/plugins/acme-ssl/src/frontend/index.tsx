import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { AcmeStatusSetting } from "./AcmeStatusSetting";

export function activate(app: TermixApp): void {
  app.registerSettingsComponent("status", AcmeStatusSetting);
}

export function deactivate(): void {
  // Registrations through app are disposed by core.
}
