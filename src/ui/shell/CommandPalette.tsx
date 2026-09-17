import { useEffect, useMemo, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Box,
  Clock,
  FolderSearch,
  HardDrive,
  Layers,
  Network,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Server,
  Settings,
  Terminal,
  User,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/command";
import { Kbd } from "@/components/kbd";
import { railItemLabel, visibleRailItems } from "@/sidebar/rail-items";
import { DEMO_ACTIVITY, DEMO_SNIPPETS } from "@/demo/demo-data";
import { resetDemo } from "@/demo/reset-demo";
import { resolveHostTabType } from "@/lib/host-connection-tabs";
import { timeAgo } from "@/lib/relative-time";
import { useNavItems } from "@/demo/nav-registry";
import type { Host, TabType } from "@/types/ui-types";

/**
 * Type-to-reach-anything, ported from the real app.
 *
 * The rail cannot hold every destination, so this is the surface that does.
 * Everything reachable by clicking is reachable by typing here, which is what
 * lets the rail stay short enough to read.
 */

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  terminal: Terminal,
  file_manager: FolderSearch,
  server_stats: Activity,
  tunnel: Network,
  docker: Box,
  telnet: Terminal,
  vnc: Terminal,
  rdp: Terminal,
};

const ACTIVITY_TAB_TYPE: Record<string, TabType> = {
  terminal: "terminal",
  file_manager: "files",
  server_stats: "host-metrics",
  tunnel: "tunnel",
  docker: "docker",
  telnet: "telnet",
  vnc: "vnc",
  rdp: "rdp",
};

/** The tabs a host actually offers, from its own capability flags. */
function hostActions(
  host: Host,
): { type: TabType; icon: React.ElementType; label: string }[] {
  return [
    host.enableTerminal !== false && {
      type: "terminal" as TabType,
      icon: Terminal,
      label: "Terminal",
    },
    host.enableFileManager && {
      type: "files" as TabType,
      icon: FolderSearch,
      label: "Files",
    },
    host.enableDocker && {
      type: "docker" as TabType,
      icon: Box,
      label: "Docker",
    },
    host.enableTmuxMonitor && {
      type: "tmux_monitor" as TabType,
      icon: Layers,
      label: "Tmux",
    },
    host.enableTunnel && {
      type: "tunnel" as TabType,
      icon: Network,
      label: "Tunnels",
    },
    {
      type: "host-metrics" as TabType,
      icon: Activity,
      label: "Metrics",
    },
    host.enableProxmoxStats && {
      type: "proxmox-stats" as TabType,
      icon: HardDrive,
      label: "Proxmox",
    },
  ].filter(Boolean) as {
    type: TabType;
    icon: React.ElementType;
    label: string;
  }[];
}

export function CommandPalette({
  isOpen,
  setIsOpen,
  hosts,
  onOpenHostTab,
  onOpenTab,
  onOpenPanel,
  onOpenSettings,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  hosts: Host[];
  onOpenHostTab: (host: Host, type: TabType) => void;
  onOpenTab: (type: TabType) => void;
  onOpenPanel: (view: string) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Captured so the terminal never sees the Escape that closes the palette.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, setIsOpen]);

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  const filteredHosts = useMemo(() => {
    if (!searching) return hosts.slice(0, 6);
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(query) ||
        h.ip.toLowerCase().includes(query) ||
        h.username.toLowerCase().includes(query) ||
        h.folder?.toLowerCase().includes(query) ||
        h.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [hosts, query, searching]);

  const filteredSnippets = useMemo(() => {
    if (!searching) return [];
    return DEMO_SNIPPETS.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.content.toLowerCase().includes(query),
    );
  }, [query, searching]);

  const navItems = useNavItems();
  // Destinations whose plugin is gone should not be typeable either.
  const missing = useMemo(() => {
    const owned = new Set(navItems.map((n) => n.id));
    return new Set(
      ["snippets", "session-logs", "history", "serial"].filter(
        (id) => !owned.has(id),
      ),
    );
  }, [navItems]);

  const destinations = useMemo(() => {
    const items = visibleRailItems()
      .filter((item) => !missing.has(item.id))
      .map((item) => ({
        id: item.id,
        label: railItemLabel(item.id, t),
        icon: item.icon as React.ElementType,
        isTab: item.kind === "tab",
      }));
    if (!searching) return items.slice(0, 5);
    return items.filter((item) => item.label.toLowerCase().includes(query));
  }, [query, searching, t, missing]);

  const recent = useMemo(() => {
    if (searching) return [];
    return DEMO_ACTIVITY.slice(0, 4)
      .map((item) => ({
        item,
        host: hosts.find((h) => h.id === item.hostId),
      }))
      .filter((row) => row.host);
  }, [hosts, searching]);

  const actions = useMemo(() => {
    const all = [
      {
        id: "action-add-host",
        label: t("commandPalette.addNewHost"),
        icon: Plus as React.ElementType,
        // Opening the hosts panel was as far as this went, so the one command
        // named "add" did not add anything.
        run: () =>
          window.dispatchEvent(new CustomEvent("host-manager:add-host")),
      },
      {
        id: "action-plugins",
        label: t("nav.plugins"),
        icon: Puzzle as React.ElementType,
        run: () => onOpenTab("plugins"),
      },
      {
        id: "action-settings",
        label: t("settings.title"),
        icon: Settings as React.ElementType,
        run: onOpenSettings,
      },
      {
        id: "action-profile",
        label: t("nav.userProfile"),
        icon: User as React.ElementType,
        run: onOpenSettings,
      },
      {
        id: "action-reset-demo",
        label: "Reset the demo",
        icon: RotateCcw as React.ElementType,
        run: resetDemo,
      },
    ];
    if (!searching) return all;
    return all.filter((a) => a.label.toLowerCase().includes(query));
  }, [query, searching, t, onOpenTab, onOpenSettings]);

  if (!isOpen) return null;

  const run = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  const nothingFound =
    searching &&
    filteredHosts.length === 0 &&
    filteredSnippets.length === 0 &&
    destinations.length === 0 &&
    actions.length === 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-background/40 pt-[15vh] backdrop-blur-sm"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="mx-4 w-full max-w-2xl overflow-hidden border border-border bg-card shadow-2xl motion-context-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={t("commandPalette.searchPlaceholder")}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="ml-2">ESC</Kbd>
          </div>

          <CommandList className="thin-scrollbar max-h-[60vh]">
            {nothingFound && (
              <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
                {t("commandPalette.noResults")}
              </CommandEmpty>
            )}

            {recent.length > 0 && (
              <CommandGroup heading={t("commandPalette.recentActivity")}>
                {recent.map(({ item, host }) => {
                  const Icon = ACTIVITY_ICONS[item.type] ?? Terminal;
                  const type = ACTIVITY_TAB_TYPE[item.type] ?? "terminal";
                  return (
                    <CommandItem
                      key={item.id}
                      value={`recent-${item.id}`}
                      onSelect={() => run(() => onOpenHostTab(host!, type))}
                      className="gap-2"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.hostName}</span>
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        {timeAgo(item.timestamp, t("dashboard.justNow"))}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {filteredHosts.length > 0 && (
              <CommandGroup heading={t("commandPalette.serversAndHosts")}>
                {filteredHosts.map((host) => (
                  <CommandItem
                    key={host.id}
                    value={`host-${host.id}`}
                    onSelect={() =>
                      run(() => onOpenHostTab(host, resolveHostTabType(host)))
                    }
                    className="gap-2"
                  >
                    <Server className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{host.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {host.username}@{host.ip}
                    </span>
                    {searching && (
                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        {hostActions(host)
                          .slice(0, 4)
                          .map((action) => {
                            const Icon = action.icon;
                            return (
                              <button
                                key={action.type}
                                title={action.label}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  run(() => onOpenHostTab(host, action.type));
                                }}
                                className="flex size-6 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-accent-brand hover:text-accent-brand"
                              >
                                <Icon className="size-3" />
                              </button>
                            );
                          })}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {filteredSnippets.length > 0 && (
              <CommandGroup heading={t("commandPalette.snippets")}>
                {filteredSnippets.map((snippet) => (
                  <CommandItem
                    key={snippet.id}
                    value={`snippet-${snippet.id}`}
                    onSelect={() => run(() => onOpenPanel("snippets"))}
                    className="gap-2"
                  >
                    <Play className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{snippet.name}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {snippet.content}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {destinations.length > 0 && (
              <CommandGroup heading={t("commandPalette.navigation")}>
                {destinations.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`go-${item.id}`}
                      onSelect={() =>
                        run(() =>
                          item.isTab
                            ? onOpenTab(item.id as TabType)
                            : onOpenPanel(item.id),
                        )
                      }
                      className="gap-2"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {actions.length > 0 && (
              <CommandGroup heading={t("commandPalette.quickActions")}>
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => run(action.run)}
                      className="gap-2"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      {action.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>

          <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd className="h-4">↑↓</Kbd>
              {t("commandPalette.navigate")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="h-4">↵</Kbd>
              {t("commandPalette.select")}
            </span>
            {/* Double-shift is the gesture nobody finds on their own, so the
                footer names it rather than leaving it to be discovered. */}
            <span className="ml-auto flex items-center gap-1">
              <Kbd className="h-4">Ctrl</Kbd>
              <span className="opacity-50">+</span>
              <Kbd className="h-4">K</Kbd>
              <span className="px-1 opacity-50">
                {t("commandPalette.orShortcut")}
              </span>
              <Kbd className="h-4">⇧⇧</Kbd>
              {t("commandPalette.doubleShift")}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
