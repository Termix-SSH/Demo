import { useState } from "react";
import {
  Clock,
  Hammer,
  KeyRound,
  LayoutPanelLeft,
  Play,
  Server,
  Settings,
  User,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SplitMode, ToolsTab } from "@/ui/utils/types";

export type RailView = "hosts" | "quick-connect" | ToolsTab | "user-profile" | "admin-settings";

type RailItem =
  | { kind?: undefined; view: RailView; icon: React.ReactNode; title: string; dot?: boolean }
  | { kind: "separator" };

function buildRailButtons(splitMode: SplitMode): RailItem[] {
  return [
    { view: "hosts",         icon: <Server className="size-4"/>,          title: "Hosts"        },
    { kind: "separator" },
    { view: "quick-connect", icon: <Zap className="size-4"/>,             title: "Quick Connect"},
    { kind: "separator" },
    { view: "ssh-tools",     icon: <Hammer className="size-4"/>,          title: "SSH Tools"    },
    { kind: "separator" },
    { view: "snippets",      icon: <Play className="size-4"/>,            title: "Snippets"     },
    { kind: "separator" },
    { view: "history",       icon: <Clock className="size-4"/>,           title: "History"      },
    { kind: "separator" },
    { view: "split-screen",  icon: <LayoutPanelLeft className="size-4"/>, title: "Split Screen", dot: splitMode !== "none" },
    { kind: "separator" },
  ];
}

export function AppRail({
  railView,
  sidebarOpen,
  splitMode,
  username,
  profileDropdownOpen,
  onProfileDropdownChange,
  onRailClick,
  onLogout,
}: {
  railView: RailView;
  sidebarOpen: boolean;
  splitMode: SplitMode;
  username: string;
  profileDropdownOpen: boolean;
  onProfileDropdownChange: (open: boolean) => void;
  onRailClick: (view: RailView) => void;
  onLogout: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const railExpanded = hovered || profileDropdownOpen;
  const railButtons = buildRailButtons(splitMode);

  return (
    <div
      className="hidden md:flex flex-col items-stretch bg-sidebar border-r border-border shrink-0 overflow-hidden pt-2 gap-1 transition-[width] duration-200"
      style={{ width: railExpanded ? 160 : 40 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col flex-1 gap-1">
        {railButtons.map((item, i) =>
          item.kind === "separator" ? (
            <div
              key={`sep-${i}`}
              className="mx-auto h-px bg-border my-0.5 shrink-0 transition-[width] duration-200"
              style={{ width: railExpanded ? "calc(100% - 16px)" : 20 }}
            />
          ) : (
            <button
              key={item.view}
              onClick={() => onRailClick(item.view)}
              className={`relative flex items-center gap-2.5 px-1.5 h-7 rounded mx-1 shrink-0 transition-colors ${
                sidebarOpen && railView === item.view
                  ? "text-accent-brand bg-accent-brand/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span className="shrink-0 flex items-center justify-center size-4">{item.icon}</span>
              <span
                className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-opacity duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0"
                }`}
              >
                {item.title}
              </span>
              {item.dot && (
                <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent-brand"/>
              )}
            </button>
          )
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1 border-t border-border pt-1 pb-1">
        {([
          { view: "user-profile"   as RailView, icon: <User className="size-4"/>,     title: "Profile" },
          { view: "admin-settings" as RailView, icon: <Settings className="size-4"/>, title: "Admin"   },
        ] as const).map(item => (
          <button
            key={item.view}
            onClick={() => onRailClick(item.view)}
            className={`relative flex items-center gap-2.5 px-1.5 h-7 rounded mx-1 shrink-0 transition-colors ${
              sidebarOpen && railView === item.view
                ? "text-accent-brand bg-accent-brand/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            <span className="shrink-0 flex items-center justify-center size-4">{item.icon}</span>
            <span className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-opacity duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0"}`}>
              {item.title}
            </span>
          </button>
        ))}
      </div>

      <div className="shrink-0 border-t border-border">
        <DropdownMenu open={profileDropdownOpen} onOpenChange={onProfileDropdownChange}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 w-full h-10 px-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              <div className="w-6 h-6 rounded-full bg-accent-brand/20 border border-accent-brand/30 flex items-center justify-center text-[11px] font-bold text-accent-brand shrink-0">
                {username.charAt(0).toUpperCase() || "U"}
              </div>
              <div
                className={`flex flex-col items-start overflow-hidden transition-opacity duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0"
                }`}
              >
                <span className="text-xs font-semibold leading-tight whitespace-nowrap">{username || "User"}</span>
                <span className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">Administrator</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" sideOffset={1} className="!w-auto min-w-max [clip-path:inset(-4px_-4px_-4px_0px)]">
            <DropdownMenuItem variant="destructive" onClick={onLogout}>
              <KeyRound className="size-3.5"/>Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
