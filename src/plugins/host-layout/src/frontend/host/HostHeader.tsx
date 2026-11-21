import { useMemo, type ComponentType, type ReactNode } from "react";
import { ChevronDown, LayoutGrid, Pencil, Plus, Server, X } from "lucide-react";
import { useHostStatus, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  getTabType,
  runHostAction,
  StatusDot,
  tabIcon,
  useHostActions,
  useShellController,
  type Host,
  type HostActionDef,
  type Tab,
} from "@termix-ssh/plugin-sdk/ui";
import { hostTools, OVERVIEW_TAB, tabsOnHost } from "./host-tools";

type Icon = ComponentType<{ className?: string }>;

interface StripEntry {
  key: string;
  label: string;
  icon?: Icon;
  /** A ready icon, for tabs with no action. */
  iconNode?: ReactNode;
  tab?: Tab;
  action?: HostActionDef;
  /** A session that can open a second copy. */
  canAddMore?: boolean;
}

/** The label of a tab on the strip: its tool's name, not the host's. */
function toolLabel(
  tab: Tab,
  t: (key: string, options?: Record<string, unknown>) => string,
  index: number,
): string {
  if (tab.customLabel) return tab.customLabel;
  const titleKey = getTabType(tab.type)?.titleKey;
  const name = titleKey ? t(titleKey) : tab.type;
  return index > 0 ? `${name} ${index + 1}` : name;
}

/**
 * The top of the detail pane for one host: who it is, its status, and a tab
 * for every tool and session a plugin offers for it.
 */
export function HostHeader({
  host,
  onBack,
}: {
  host: Host;
  /** Phones: back to the tree. */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs } = shell;
  const all = useHostActions();
  const status = useHostStatus(Number(host.id))?.status;
  const tools = useMemo(() => hostTools(all, host), [all, host]);
  const open = useMemo(
    () => tabsOnHost(tabs.list, host.id),
    [tabs.list, host.id],
  );

  const entries = useMemo(() => {
    const list: StripEntry[] = [];
    const used = new Set<string>();
    const overview = open.find((tab) => tab.type === OVERVIEW_TAB);
    if (overview) used.add(overview.id);
    list.push({
      key: OVERVIEW_TAB,
      label: t("hostLayout.overview"),
      icon: LayoutGrid,
      tab: overview,
    });
    for (const action of tools.tabs) {
      const ofType = open.filter((tab) => tab.type === action.tabType);
      const label = action.label?.(host) ?? t(action.titleKey);
      const session = !!getTabType(action.tabType!)?.session;
      ofType.forEach((tab, index) => {
        used.add(tab.id);
        list.push({
          key: tab.id,
          label: index === 0 ? label : `${label} ${index + 1}`,
          icon: action.icon as Icon,
          tab,
          action,
          canAddMore: session && index === ofType.length - 1,
        });
      });
      if (ofType.length === 0) {
        list.push({
          key: `action:${action.id}`,
          label,
          icon: action.icon as Icon,
          action,
        });
      }
    }
    // Tabs on this host from elsewhere, like a plugin page opened for it.
    const rest = open.filter((tab) => !used.has(tab.id));
    const seenType = new Map<string, number>();
    for (const tab of rest) {
      const index = seenType.get(tab.type) ?? 0;
      seenType.set(tab.type, index + 1);
      list.push({
        key: tab.id,
        label: toolLabel(tab, t, index),
        iconNode: tabIcon(tab.type),
        tab,
      });
    }
    return list;
  }, [open, tools.tabs, host, t]);

  const activate = (entry: StripEntry) => {
    if (entry.tab) tabs.setActive(entry.tab.id);
    else if (entry.key === OVERVIEW_TAB) tabs.open(host, OVERVIEW_TAB);
    else if (entry.action) runHostAction(entry.action, host, shell.callbacks);
  };

  const address = [
    host.username ? `${host.username}@${host.ip}` : host.ip,
    host.port ? String(host.port) : "",
  ]
    .filter(Boolean)
    .join(":");

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="flex items-center gap-2 px-3 h-11">
        {onBack && (
          <BackButton
            onClick={onBack}
            label={t("hostLayout.back")}
            className="-ml-3 border-r border-border"
          />
        )}
        <Server className="size-4 shrink-0 text-accent-brand" />
        <h2 className="truncate text-sm font-semibold">
          {host.name || host.ip}
        </h2>
        <StatusDot
          state={status}
          title={t(`hostLayout.status.${status ?? "unknown"}`)}
        />
        <span className="hidden sm:block truncate text-xs text-muted-foreground">
          {address}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {tools.launchers.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
                >
                  {t("hostLayout.actions")}
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48 text-sm">
                {tools.launchers.map((action) => {
                  const Icon = action.icon as Icon;
                  return (
                    <DropdownMenuItem
                      key={action.id}
                      onSelect={() =>
                        runHostAction(action, host, shell.callbacks)
                      }
                    >
                      <Icon className="size-4" />
                      {action.label?.(host) ?? t(action.titleKey)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            onClick={() => shell.hosts.edit(host)}
            title={t("hostLayout.editHost")}
            aria-label={t("hostLayout.editHost")}
            className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        role="tablist"
        aria-label={t("hostLayout.tools")}
        className="flex items-end gap-0.5 px-2 overflow-x-auto [scrollbar-width:none]"
      >
        {entries.map((entry) => {
          const active = !!entry.tab && entry.tab.id === tabs.activeId;
          const Icon = entry.icon;
          return (
            <div
              key={entry.key}
              className={cn(
                "group relative flex items-center shrink-0 h-8 border-b-2",
                active
                  ? "border-accent-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => activate(entry)}
                className={cn(
                  "h-full flex items-center gap-1.5 px-2.5 text-sm",
                  !entry.tab && "opacity-70",
                )}
              >
                {Icon ? <Icon className="size-3.5" /> : entry.iconNode}
                <span className="whitespace-nowrap">{entry.label}</span>
                {entry.tab && entry.key !== OVERVIEW_TAB && !active && (
                  <span className="size-1.5 rounded-full bg-accent-brand/70" />
                )}
              </button>
              {entry.canAddMore && entry.action && (
                <button
                  type="button"
                  onClick={() =>
                    tabs.open(host, entry.action!.tabType!, undefined, {
                      forceNewTab: true,
                    })
                  }
                  title={t("hostLayout.newSession", { name: entry.label })}
                  aria-label={t("hostLayout.newSession", { name: entry.label })}
                  className="size-5 hidden group-hover:flex items-center justify-center hover:text-foreground"
                >
                  <Plus className="size-3" />
                </button>
              )}
              {entry.tab && entry.key !== OVERVIEW_TAB && (
                <button
                  type="button"
                  onClick={() => void tabs.close(entry.tab!.id)}
                  title={t("hostLayout.closeTab", { name: entry.label })}
                  aria-label={t("hostLayout.closeTab", { name: entry.label })}
                  className={cn(
                    "size-5 mr-0.5 items-center justify-center opacity-70 hover:text-foreground",
                    active ? "flex" : "hidden group-hover:flex",
                  )}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
