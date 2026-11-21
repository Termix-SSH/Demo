import { LayoutDashboard, LibraryBig, Palette, Settings } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { TerminalLayout } from "./layout/TerminalLayout";
import { AppearanceStep } from "./onboarding/AppearanceStep";
import { DashboardTabType, ManageTabType, SettingsTabType } from "./tabs";
import { setReportOpener } from "./report-bug";
import {
  defaultPrefixCombo,
  installPrefixKeys,
  prefix,
  PREFIX_ACTION,
} from "./shell/prefix-keys";
import { loadPrefixOverride, prefixOverridden } from "./shell/prefix-binding";

export function activate(app: TermixApp): void {
  setReportOpener(app);
  // Plugin buttons fill the status bar's height.
  app.declareActionSlot({
    id: "tabbar.actions",
    accepts: ["component"],
    fit: "bar" as "inline",
  });
  // Plain values per host row; components only from plugins not moved yet.
  app.declareActionSlot({
    id: "dashboard.hostRow",
    accepts: ["data", "component"],
    shapes: ["bars", "stat", "text"],
    rows: "host",
    fit: "inline",
  });
  // A view next to the dashboard (the homepage) takes the whole page.
  app.declareActionSlot({
    id: "dashboard.secondaryView",
    accepts: ["component"],
    fit: "fill",
  });
  app.declareActionSlot({
    id: "credentials.badges",
    accepts: ["data"],
    shapes: ["badge", "text"],
    rows: "credential",
  });
  app.declareActionSlot({
    id: "dashboard.hostRowBadge",
    accepts: ["data", "component"],
    shapes: ["badge"],
    rows: "host",
    fit: "inline",
  });
  app.registerLayout({
    id: "terminal",
    label: "layout.name",
    component: TerminalLayout,
  });

  app.registerTab("dashboard", DashboardTabType, {
    icon: LayoutDashboard,
    titleKey: "tab.dashboard",
    singleton: true,
    hostless: true,
  });
  app.registerTab("host-manager", ManageTabType, {
    icon: LibraryBig,
    titleKey: "tab.manage",
    singleton: true,
  });
  app.registerTab("settings", SettingsTabType, {
    icon: Settings,
    titleKey: "tab.settings",
    singleton: true,
  });

  // The prefix runs anywhere, and a terminal hands it on when it is bound.
  app.registerKeybindingAction({
    id: PREFIX_ACTION,
    titleKey: "terminalLayout.prefixAction",
    scope: "global",
    run: () => {
      prefix.arm();
    },
  });
  app.registerKeybindingDefault({
    id: PREFIX_ACTION,
    combo: defaultPrefixCombo(),
    descriptionKey: "terminalLayout.prefixAction",
  });
  const reload = () => void loadPrefixOverride().catch(() => undefined);
  reload();
  window.addEventListener("customKeybindingsChanged", reload);
  const removeKeys = installPrefixKeys(prefixOverridden);
  app.onDispose(() => {
    window.removeEventListener("customKeybindingsChanged", reload);
    removeKeys();
    prefix.setRunner(null);
  });

  // Position 40 is where core's own step sat. It replaces that one and the
  // other layouts' copies, so people who switch layouts are not asked again.
  app.registerOnboardingStep({
    id: "appearance",
    titleKey: "onboarding.appearanceTitle",
    icon: Palette,
    component: AppearanceStep,
    position: 40,
    replaces: [
      "appearance",
      "classic-layout:appearance",
      "host-layout:appearance",
      "original-layout:appearance",
    ],
  });
}
