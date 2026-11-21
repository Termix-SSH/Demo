import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  Monitor,
  Package,
  Pencil,
  Plus,
  Search,
  Server,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HostDataItems,
  HostDotGroup,
  HostTreeChildren,
  hostBadgesFor,
  hostMenuItemsFor,
  hostStatusIndicatorsFor,
  hostTreeChildrenFor,
  Input,
  LoadingState,
  requestManage,
  useHostBadges,
  useHostContextMenuItems,
  useHostStatusIndicators,
  useHostTreeChildrenProviders,
  useShellController,
  type Host,
  type HostTreeChild,
} from "@termix-ssh/plugin-sdk/ui";
import { visibleRows, type TreeRow } from "./tree-model";
import { openCountByHost } from "./host-tools";

const EXPANDED_KEY = "host-layout.expanded";
const INDENT = 14;

function readExpanded(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(keys: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...keys]));
  } catch {
    // Storage full or off: the tree still works for this visit.
  }
}

export interface HostTreeProps {
  selectedHostId: string | null;
  /** Ancestors of the selected host, opened from outside the tree. */
  reveal?: string[];
  onSelectHost: (host: Host) => void;
  onOpenChild: (host: Host, child: HostTreeChild) => void;
}

const CHILD_ICONS = {
  container: Box,
  vm: Monitor,
  lxc: Package,
  pod: Boxes,
  other: Box,
} as const;

const STATE_DOT: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-muted-foreground/40",
  paused: "bg-amber-500",
  unknown: "bg-muted-foreground/20",
};

export function HostTree({
  selectedHostId,
  reveal,
  onSelectHost,
  onOpenChild,
}: HostTreeProps) {
  const { t } = useTranslation();
  const shell = useShellController();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(readExpanded);
  const listRef = useRef<HTMLDivElement>(null);

  // Opening the tree to a host picked elsewhere, like the palette.
  const revealKey = reveal?.join("|") ?? "";
  const [revealed, setRevealed] = useState("");
  if (revealKey && revealKey !== revealed) {
    setRevealed(revealKey);
    if (reveal!.some((key) => !expanded.has(key))) {
      const next = new Set(expanded);
      reveal!.forEach((key) => next.add(key));
      setExpanded(next);
      saveExpanded(next);
    }
  }

  const toggle = useCallback((key: string, open?: boolean) => {
    setExpanded((current) => {
      const next = new Set(current);
      const want = open ?? !next.has(key);
      if (want) next.add(key);
      else next.delete(key);
      saveExpanded(next);
      return next;
    });
  }, []);

  const rows = useMemo(
    () => visibleRows(shell.hosts.tree, expanded, query),
    [shell.hosts.tree, expanded, query],
  );
  const openCounts = useMemo(
    () => openCountByHost(shell.tabs.list),
    [shell.tabs.list],
  );
  const providers = useHostTreeChildrenProviders();
  const badges = useHostBadges();
  const indicators = useHostStatusIndicators();
  const menuItems = useHostContextMenuItems();

  const focusRow = (index: number) => {
    const items =
      listRef.current?.querySelectorAll<HTMLElement>("[data-tree-row]");
    items?.[Math.max(0, Math.min(index, items.length - 1))]?.focus();
  };

  const onKey = (event: React.KeyboardEvent, row: TreeRow, index: number) => {
    const canOpen =
      row.kind === "folder" ||
      row.hasSubHosts ||
      hostTreeChildrenFor(providers, row.host).length > 0;
    if (event.key === "ArrowDown") focusRow(index + 1);
    else if (event.key === "ArrowUp") focusRow(index - 1);
    else if (event.key === "ArrowRight" && canOpen) toggle(row.key, true);
    else if (event.key === "ArrowLeft" && row.expanded) toggle(row.key, false);
    else if (event.key === "Enter" || event.key === " ") {
      if (row.kind === "host") onSelectHost(row.host);
      else toggle(row.key);
    } else return;
    event.preventDefault();
  };

  const renderChildren = (host: Host, depth: number): ReactNode => (
    <HostTreeChildren host={host}>
      {(groups) =>
        groups.map((group) => {
          const result = group.result;
          if (!result) return null;
          if (result.loading && result.items.length === 0) {
            return (
              <div
                key={group.providerId}
                style={{ paddingLeft: 8 + (depth + 1) * INDENT + 18 }}
              >
                <LoadingState compact label={t("hostLayout.tree.loading")} />
              </div>
            );
          }
          if (result.error && result.items.length === 0) {
            return (
              <div
                key={group.providerId}
                className="h-7 flex items-center text-xs text-destructive truncate"
                style={{ paddingLeft: 8 + (depth + 1) * INDENT + 18 }}
                title={result.error}
              >
                {result.error}
              </div>
            );
          }
          return result.items.map((child) => {
            const Icon = CHILD_ICONS[child.kind ?? "other"] ?? Box;
            return (
              <button
                key={`${group.providerId}:${child.id}`}
                type="button"
                data-tree-child
                onClick={() => onOpenChild(host, child)}
                title={child.detail ?? child.label}
                className="w-full h-7 flex items-center gap-2 pr-2 text-left text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/50"
                style={{ paddingLeft: 8 + (depth + 1) * INDENT + 18 }}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{child.label}</span>
                {child.state && (
                  <span
                    className={cn(
                      "ml-auto size-1.5 shrink-0 rounded-full",
                      STATE_DOT[child.state],
                    )}
                    title={t(`hostLayout.state.${child.state}`)}
                  />
                )}
              </button>
            );
          });
        })
      }
    </HostTreeChildren>
  );

  const hostRow = (
    row: Extract<TreeRow, { kind: "host" }>,
    index: number,
  ): ReactNode => {
    const { host } = row;
    const selected = String(host.id) === selectedHostId;
    const hasChildren = hostTreeChildrenFor(providers, host).length > 0;
    const canOpen = row.hasSubHosts || hasChildren;
    const open = openCounts.get(String(host.id)) ?? 0;
    const rowBadges = hostBadgesFor(badges, host);
    const plugins = hostMenuItemsFor(menuItems, host);
    return (
      <div key={row.key}>
        <DropdownMenu modal={false}>
          <div
            data-tree-row
            role="treeitem"
            aria-selected={selected}
            aria-expanded={canOpen ? row.expanded : undefined}
            tabIndex={selected || (!selectedHostId && index === 0) ? 0 : -1}
            onKeyDown={(event) => onKey(event, row, index)}
            onClick={() => onSelectHost(host)}
            className={cn(
              "group relative h-8 flex items-center gap-1.5 pr-1 cursor-pointer select-none text-sm focus-visible:outline-none focus-visible:bg-muted/50",
              selected
                ? "bg-accent-brand/15 text-foreground"
                : "text-foreground/90 hover:bg-muted/40",
            )}
            style={{ paddingLeft: 8 + row.depth * INDENT }}
          >
            {selected && (
              <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-brand" />
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-label={t(
                row.expanded
                  ? "hostLayout.tree.collapse"
                  : "hostLayout.tree.expand",
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (canOpen) toggle(row.key);
              }}
              className={cn(
                "size-4 shrink-0 flex items-center justify-center text-muted-foreground",
                !canOpen && "invisible",
              )}
            >
              {row.expanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
            <Server className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 min-w-0">
              {host.name || host.ip}
            </span>
            <HostDataItems
              host={host}
              items={hostStatusIndicatorsFor(indicators, host)}
              className="gap-1 shrink-0"
            />
            <HostDotGroup host={host} badges={rowBadges} />
            {open > 0 && (
              <span
                className="shrink-0 min-w-4 h-4 px-1 rounded-sm bg-muted text-[10px] leading-4 text-center text-muted-foreground"
                title={t("hostLayout.tree.openTabs", { count: open })}
              >
                {open}
              </span>
            )}
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                aria-label={t("hostLayout.tree.more")}
                className="size-6 shrink-0 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 hover:text-foreground"
              >
                <Ellipsis className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="start" className="min-w-44 text-sm">
            <DropdownMenuItem onSelect={() => shell.hosts.edit(host)}>
              <Pencil className="size-4" />
              {t("hostLayout.tree.edit")}
            </DropdownMenuItem>
            {plugins.length > 0 && <DropdownMenuSeparator />}
            {plugins.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => item.run(host, shell.callbacks)}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  {t(item.titleKey)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {row.expanded && hasChildren && renderChildren(host, row.depth)}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1 p-2 border-b border-border">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusRow(0);
              } else if (event.key === "Escape") setQuery("");
            }}
            placeholder={t("hostLayout.tree.search")}
            aria-label={t("hostLayout.tree.search")}
            className="h-7 pl-7 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => requestManage({ kind: "host", hostId: null })}
          title={t("hostLayout.tree.addHost")}
          aria-label={t("hostLayout.tree.addHost")}
          className="size-7 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <div
        ref={listRef}
        role="tree"
        aria-label={t("hostLayout.tree.label")}
        className="flex-1 min-h-0 overflow-y-auto py-1"
      >
        {!shell.hosts.loaded && shell.hosts.loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {query ? t("hostLayout.tree.noMatch") : t("hostLayout.tree.empty")}
          </p>
        ) : (
          rows.map((row, index) =>
            row.kind === "folder" ? (
              <div
                key={row.key}
                data-tree-row
                role="treeitem"
                aria-expanded={row.expanded}
                tabIndex={-1}
                onKeyDown={(event) => onKey(event, row, index)}
                onClick={() => toggle(row.key)}
                className="h-8 flex items-center gap-1.5 pr-2 cursor-pointer select-none text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:bg-muted/50"
                style={{ paddingLeft: 8 + row.depth * INDENT }}
              >
                <span className="size-4 shrink-0 flex items-center justify-center">
                  {row.expanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </span>
                <Folder
                  className="size-3.5 shrink-0"
                  style={
                    row.folder.color ? { color: row.folder.color } : undefined
                  }
                />
                <span className="truncate flex-1 min-w-0 font-medium">
                  {row.folder.name}
                </span>
                <span className="text-xs tabular-nums">{row.count}</span>
              </div>
            ) : (
              hostRow(row, index)
            ),
          )
        )}
      </div>
    </div>
  );
}
