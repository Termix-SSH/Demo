import type { ComponentType } from "react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { getUserInfo } from "@termix-ssh/plugin-sdk/ui";
import { createConnectVerifyTab } from "./ConnectVerifyTab";
import { createSecurityOverlay } from "./SecurityOverlay";
import { createFactorsStatus } from "./FactorsStatus";
import { SessionsKeysTab } from "./SessionsKeysTab";
import { AdminWaitsTab } from "./AdminWaitsTab";

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
  app.registerTab("connect-verify", createConnectVerifyTab(app), {
    titleKey: "verify.title",
    hostless: true,
  });
  app.registerTab("sessions", SessionsKeysTab, {
    titleKey: "sessions.title",
    hostless: true,
    singleton: true,
  });
  app.registerTab("admin-waits", AdminWaitsTab, {
    titleKey: "waits.title",
    hostless: true,
    singleton: true,
  });
  app.registerPaletteEntry({
    id: "sessions",
    titleKey: "sessions.title",
    keywords: ["sessions", "api keys", "sign out", "devices"],
    scope: "global",
    run: (shell) => shell.openSingletonTab("sessions"),
  });
  // Only admins can use the admin wait page.
  let isAdmin = false;
  void getUserInfo()
    .then((info) => {
      isAdmin = Boolean(info.is_admin);
    })
    .catch(() => {});
  app.registerPaletteEntry({
    id: "admin-waits",
    titleKey: "waits.title",
    keywords: ["admin", "wait", "hold", "two admins", "cooling off"],
    scope: "global",
    when: () => isAdmin,
    run: (shell) => shell.openSingletonTab("admin-waits"),
  });
}
