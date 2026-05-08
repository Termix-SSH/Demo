import {
  Box,
  FolderSearch,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  Terminal,
  User,
} from "lucide-react";
import { FileManager } from "@/ui/tabs/FileManagerTab";
import { DashboardTab } from "@/ui/tabs/DashboardTab";
import { TerminalTab } from "@/ui/tabs/TerminalTab";
import { RdpTab } from "@/ui/tabs/RdpTab";
import { VncTab } from "@/ui/tabs/VncTab";
import { TelnetTab } from "@/ui/tabs/TelnetTab";
import { StatsTab } from "@/ui/tabs/StatsTab";
import { DockerTab } from "@/ui/tabs/DockerTab";
import { TunnelTab } from "@/ui/tabs/TunnelTab";
import type { Tab, TabType, Host } from "@/ui/utils/types";

export function tabIcon(type: TabType) {
  switch (type) {
    case "dashboard":      return <LayoutDashboard className="size-3.5"/>;
    case "terminal":       return <Terminal className="size-3.5"/>;
    case "rdp":            return <Terminal className="size-3.5"/>;
    case "vnc":            return <Terminal className="size-3.5"/>;
    case "telnet":         return <Terminal className="size-3.5"/>;
    case "stats":          return <Server className="size-3.5"/>;
    case "files":          return <FolderSearch className="size-3.5"/>;
    case "host-manager":   return <Server className="size-3.5"/>;
    case "user-profile":   return <User className="size-3.5"/>;
    case "admin-settings": return <Settings className="size-3.5"/>;
    case "docker":         return <Box className="size-3.5"/>;
    case "tunnel":         return <Network className="size-3.5"/>;
  }
}

export function renderTabContent(
  tab: Tab,
  onOpenSingletonTab?: (type: TabType) => void,
  onOpenTab?: (host: Host, type: TabType) => void,
) {
  switch (tab.type) {
    case "dashboard":      return <DashboardTab onOpenSingletonTab={onOpenSingletonTab!} onOpenTab={onOpenTab!}/>;
    case "terminal":       return <TerminalTab label={tab.label}/>;
    case "rdp":            return <RdpTab label={tab.label}/>;
    case "vnc":            return <VncTab label={tab.label}/>;
    case "telnet":         return <TelnetTab label={tab.label}/>;
    case "stats":          return <StatsTab label={tab.label}/>;
    case "files":          return <FileManager label={tab.label}/>;
    case "host-manager":   return null;
    case "user-profile":   return null;
    case "admin-settings": return null;
    case "docker":         return <DockerTab label={tab.label}/>;
    case "tunnel":         return <TunnelTab label={tab.label}/>;
  }
}
