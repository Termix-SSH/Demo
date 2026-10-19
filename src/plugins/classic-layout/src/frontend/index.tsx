import { LayoutDashboard, LibraryBig, Settings } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { ClassicLayout } from "./layout/ClassicLayout";
import { DashboardComponent, HostTreeComponent } from "./components";
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

  app.registerComponent("classic-layout.hostTree", HostTreeComponent);
  app.registerComponent("classic-layout.dashboard", DashboardComponent);
}
