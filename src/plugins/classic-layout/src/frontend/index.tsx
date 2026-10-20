import {
  LayoutDashboard,
  LayoutTemplate,
  LibraryBig,
  Palette,
  Settings,
} from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { ClassicLayout } from "./layout/ClassicLayout";
import { DashboardComponent, HostTreeComponent } from "./components";
import { PresetStep } from "./onboarding/PresetStep";
import { AppearanceStep } from "./onboarding/AppearanceStep";
import { DashboardTabType, ManageTabType, SettingsTabType } from "./tabs";

export function activate(app: TermixApp): void {
  app.registerLayout({
    id: "classic",
    label: "layout.name",
    component: ClassicLayout,
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

  // Positions 30 and 40 are where core's own steps sat, and they replace
  // those, so people who already went through them are not asked again.
  app.registerOnboardingStep({
    id: "preset",
    titleKey: "onboarding.presetTitle",
    icon: LayoutTemplate,
    component: PresetStep,
    position: 30,
    replaces: ["preset"],
  });
  app.registerOnboardingStep({
    id: "appearance",
    titleKey: "onboarding.appearanceTitle",
    icon: Palette,
    component: AppearanceStep,
    position: 40,
    replaces: ["appearance"],
  });

  app.registerComponent("classic-layout.hostTree", HostTreeComponent);
  app.registerComponent("classic-layout.dashboard", DashboardComponent);
}
