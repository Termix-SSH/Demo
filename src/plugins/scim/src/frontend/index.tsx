import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { ConnectionsSetting } from "./ConnectionsSetting";

export function activate(app: TermixApp): void {
  app.registerSettingsComponent("connections", ConnectionsSetting);
}
