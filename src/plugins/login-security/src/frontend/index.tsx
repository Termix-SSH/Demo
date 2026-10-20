import type { ComponentType } from "react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { createSecurityOverlay } from "./SecurityOverlay";
import { createFactorsStatus } from "./FactorsStatus";

export function activate(app: TermixApp): void {
  if (app.guest) return;
  app.registerSlotContribution("shell.overlay", {
    actionId: "login-security.overlay",
    titleKey: "name",
    kind: "component",
    component: createSecurityOverlay(app) as ComponentType<
      Record<string, unknown>
    >,
  });
  app.registerSettingsComponent("factors", createFactorsStatus(app));
}
