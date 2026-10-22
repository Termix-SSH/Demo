import { House, Server, Settings } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { SimpleLayout } from "./layout/SimpleLayout";
import { HomeTabType, HostsTabType, SettingsTabType } from "./tabs";

export function activate(app: TermixApp): void {
  app.registerLayout({
    id: "simple",
    label: "layout.name",
    component: SimpleLayout,
  });

  app.registerTab("dashboard", HomeTabType, {
    icon: House,
    titleKey: "tab.home",
    singleton: true,
    hostless: true,
  });
  app.registerTab("host-manager", HostsTabType, {
    icon: Server,
    titleKey: "tab.hosts",
    singleton: true,
  });
  app.registerTab("settings", SettingsTabType, {
    icon: Settings,
    titleKey: "tab.settings",
    singleton: true,
  });
}
