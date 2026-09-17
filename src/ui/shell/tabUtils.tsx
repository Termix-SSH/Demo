import {
  Box,
  Boxes,
  Braces,
  FolderSearch,
  HardDrive,
  LibraryBig,
  LayoutDashboard,
  LayoutGrid,
  LayoutPanelLeft,
  MessagesSquare,
  Monitor,
  MousePointerClick,
  Network,
  Server,
  Settings,
  Terminal,
  Usb,
  User,
  TerminalSquare,
  Layers, // --- tmux-monitor ---
  Clock,
  Fingerprint,
  Hammer,
  Play,
  Plug,
  ScrollText,
  Sparkles,
  Workflow,
} from "lucide-react";
import type { TabType } from "@/types/ui-types";

export function tabIcon(type: TabType) {
  switch (type) {
    case "dashboard":
      return <LayoutDashboard className="size-3.5" />;
    case "terminal":
      return <Terminal className="size-3.5" />;
    case "local-terminal":
      return <TerminalSquare className="size-3.5" />;
    case "rdp":
      return <Monitor className="size-3.5" />;
    case "vnc":
      return <MousePointerClick className="size-3.5" />;
    case "telnet":
      return <MessagesSquare className="size-3.5" />;
    case "host-metrics":
      return <Server className="size-3.5" />;
    case "proxmox-stats":
      return <HardDrive className="size-3.5" />;
    case "files":
      return <FolderSearch className="size-3.5" />;
    case "host-manager":
      return <LibraryBig className="size-3.5" />;
    case "user-profile":
      return <User className="size-3.5" />;
    case "admin-settings":
    case "settings":
      return <Settings className="size-3.5" />;
    case "docker":
      return <Box className="size-3.5" />;
    case "tunnel":
      return <Network className="size-3.5" />;
    case "network_graph":
      return <Network className="size-3.5" />;
    case "tmux_monitor":
      return <Layers className="size-3.5" />;
    case "serial":
      return <Usb className="size-3.5" />;
    case "homepage":
      return <LayoutGrid className="size-3.5" />;
    case "fleet-inventory":
      return <Boxes className="size-3.5" />;
    case "termix-id":
      return <Fingerprint className="size-3.5" />;
    case "alerts":
      return <Plug className="size-3.5" />;
    case "session-logs":
      return <ScrollText className="size-3.5" />;
    case "snippets":
      return <Play className="size-3.5" />;
    case "macros":
      return <Braces className="size-3.5" />;
    case "history":
      return <Clock className="size-3.5" />;
    case "ssh-tools":
      return <Hammer className="size-3.5" />;
    case "automations":
      return <Workflow className="size-3.5" />;
    case "ai":
      return <Sparkles className="size-3.5" />;
    case "split-screen":
      return <LayoutPanelLeft className="size-3.5" />;
  }
}

/**
 * Tab surfaces load eagerly here, so the prefetch and usage-tracking hooks are
 * no-ops kept only to preserve the call sites.
 */
export function preloadTabSurface(_type: TabType): void {}

export function markTabSurfaceUsed(_type: TabType): void {}
