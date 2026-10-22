import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Server } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  actionOrder,
  cn,
  defaultConnectAction,
  hostActionsFor,
  requestManage,
  runHostAction,
  useHostActions,
  useHostStatus,
  useShellController,
  type Host,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { groupHosts } from "./group-hosts";

// Past this many hosts a search box is worth the space.
const SEARCH_FROM = 8;

/** Home: one card per host, grouped by folder. */
export function HomeTab() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { hosts } = shell;
  const [query, setQuery] = useState("");

  const groups = useMemo(
    () => groupHosts(hosts.list, query),
    [hosts.list, query],
  );

  const addHost = () => requestManage({ kind: "host", hostId: null });

  if (hosts.loaded && hosts.list.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Server}
          title={t("home.emptyTitle")}
          hint={t("home.emptyHint")}
          action={
            <Button size="sm" onClick={addHost}>
              <Plus className="size-3.5" />
              {t("home.addHost")}
            </Button>
          }
        />
      </div>
    );
  }

  // Radix tooltips need a provider above them, and no layout gives one.
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">{t("home.title")}</h1>
            <div className="ml-auto flex items-center gap-2">
              {hosts.list.length >= SEARCH_FROM && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("home.filter")}
                    className="h-8 w-48 pl-7 text-xs"
                  />
                </div>
              )}
              <Button size="sm" variant="outline" onClick={addHost}>
                <Plus className="size-3.5" />
                {t("home.addHost")}
              </Button>
            </div>
          </div>

          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("home.noMatches")}
            </p>
          )}

          {groups.map((group) => (
            <section
              key={group.folder || "__none__"}
              className="flex flex-col gap-2"
            >
              {groups.length > 1 && (
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.folder || t("home.noFolder")}
                </h2>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.hosts.map((host) => (
                  <HostCard key={host.id} host={host} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

function HostCard({ host }: { host: Host }) {
  const { t } = useTranslation();
  const shell = useShellController();
  const actions = useHostActions();
  const status = useHostStatus(Number(host.id), host.statusCheckEnabled);

  const connect = defaultConnectAction(actions, host);
  // Every other way in: host tools first, then the other protocols, like
  // the classic host list. Actions that hide from the tray stay hidden.
  const tools = hostActionsFor(actions, host)
    .filter((action) => action !== connect && action.tray !== false)
    .sort(
      (a, b) => actionOrder(a) - actionOrder(b) || a.id.localeCompare(b.id),
    );

  const open = () => {
    if (connect) runHostAction(connect, host, shell.callbacks);
    else shell.tabs.connectHost(host);
  };

  return (
    <div className="flex flex-col gap-3 border border-border bg-card p-3">
      <div className="flex items-start gap-2 min-w-0">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            status === "online" && "bg-success",
            status === "offline" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground/40",
          )}
          title={t(`home.status.${status}`)}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {host.name || host.ip}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {host.username ? `${host.username}@` : ""}
            {host.ip}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("home.edit")}
              onClick={() => shell.hosts.edit(host)}
            >
              <Pencil className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("home.edit")}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 min-w-24 flex-1 text-xs"
          onClick={open}
        >
          {t("home.connect")}
        </Button>
        {tools.map((action) => {
          const Icon = action.icon;
          const label = action.label?.(host) ?? t(action.titleKey);
          const items = action.items?.(host) ?? [];
          const trigger = (
            <Button
              size="icon-sm"
              variant="outline"
              className="size-7"
              aria-label={label}
              onClick={
                items.length > 1
                  ? undefined
                  : () =>
                      items.length === 1
                        ? items[0].run(host, shell.callbacks)
                        : runHostAction(action, host, shell.callbacks)
              }
            >
              <Icon className="size-3.5" />
            </Button>
          );
          if (items.length > 1) {
            return (
              <DropdownMenu key={action.id}>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {items.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => item.run(host, shell.callbacks)}
                    >
                      <Icon className="mr-2 size-3.5" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }
          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
