import { LayoutDashboard, LibraryBig, Palette, Settings } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { OriginalLayout } from "./layout/OriginalLayout";
import { DashboardComponent, HostTreeComponent } from "./components";
import { AppearanceStep } from "./onboarding/AppearanceStep";
import { DashboardTabType, ManageTabType, SettingsTabType } from "./tabs";
import { setReportOpener } from "./report-bug";

export function activate(app: TermixApp): void {
  setReportOpener(app);
  // Plugin buttons fill the tab bar's height ("bar" is new in Termix 26.11.2).
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
    id: "original",
    label: "layout.name",
    component: OriginalLayout,
    defaultTheme: "original-dark",
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

  // Position 40 is where core's own step sat, and it replaces that one, so
  // people who already went through it are not asked again.
  app.registerOnboardingStep({
    id: "appearance",
    titleKey: "onboarding.appearanceTitle",
    icon: Palette,
    component: AppearanceStep,
    position: 40,
    replaces: ["appearance"],
  });

  app.registerComponent("original-layout.hostTree", HostTreeComponent);
  app.registerComponent("original-layout.dashboard", DashboardComponent);
}
