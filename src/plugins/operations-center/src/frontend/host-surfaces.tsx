import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  useHostStatus,
  useSettings,
  useShell,
  useToast,
  useTranslation,
  type CompanionProps,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  StatusDot,
} from "@termix-ssh/plugin-sdk/ui";
import { LayoutDashboard, Zap } from "lucide-react";
import {
  errorText,
  getCatalog,
  runAction,
  type Catalog,
  type CatalogAction,
} from "./api";
import { useHostAttention } from "./host-attention";
import { requestSection } from "./host-page-nav";
import { HostOverview } from "./HostOverview";
import { appliesTo, hostLabel } from "./hosts";

export const OPS_TAB = "operations";
export const HOST_TAB = "host";

type Opener = Pick<ShellApi, "openTab" | "openSingletonTab">;

/** Opens the host's page at a section, reusing a page already open. */
export function openHostPage(
  shell: Opener,
  host: PluginHostRecord,
  section = "overview",
): void {
  requestSection(host.id, section);
  shell.openTab(host, HOST_TAB);
}

function useCatalog(): Catalog | null {
  const { language } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    let live = true;
    void getCatalog(language)
      .then((value) => live && setCatalog(value))
      .catch(() => live && setCatalog(null));
    return () => {
      live = false;
    };
  }, [language]);
  return catalog;
}

function hostActionsOf(
  catalog: Catalog | null,
  host: PluginHostRecord | undefined,
): CatalogAction[] {
  if (!catalog || !host) return [];
  return catalog.actions.filter(
    (action) =>
      action.available &&
      action.scope !== "server" &&
      action.surfaces?.palette !== false &&
      appliesTo(action, host),
  );
}

/** A dot next to a host's name while one of its status tiles is not OK. */
export function AttentionBadge({ host }: { host: PluginHostRecord }) {
  const { values } = useSettings("user");
  const attention = useHostAttention(host.id, values.attentionDot !== false);
  if (!attention) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="ops-attention"
            className={`size-1.5 shrink-0 rounded-full ${attention.tone === "fail" ? "bg-destructive" : "bg-warning"}`}
          />
        </TooltipTrigger>
        <TooltipContent side="right" className="whitespace-pre-line">
          {attention.lines.join("\n")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Actions that need a form or a target open in Operations instead. */
function needsForm(action: CatalogAction): boolean {
  return (
    action.inputs.length > 0 ||
    action.risk === "destructive" ||
    action.scope === "resource"
  );
}

/** Actions grouped by plugin, in name order. */
export function byPlugin(
  actions: CatalogAction[],
): { plugin: string; actions: CatalogAction[] }[] {
  const groups = new Map<string, CatalogAction[]>();
  for (const action of actions) {
    const list = groups.get(action.pluginName) ?? [];
    list.push(action);
    groups.set(action.pluginName, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([plugin, list]) => ({
      plugin,
      actions: list.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

/**
 * The host's actions as a submenu, for a layout's host menu, one submenu per
 * plugin. Actions with nothing to fill in run right here; the rest open in
 * Operations with their form.
 */
export function HostMenuActions({
  host,
  shell,
}: {
  host: PluginHostRecord;
  shell: Opener;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const catalog = useCatalog();
  const actions = useMemo(() => hostActionsOf(catalog, host), [catalog, host]);
  const groups = useMemo(() => byPlugin(actions), [actions]);
  if (actions.length === 0) return null;

  const openForm = (action: CatalogAction) =>
    shell.openSingletonTab(OPS_TAB, {
      data: { view: "run", actionId: action.id, hostId: Number(host.id) },
    });

  const run = async (action: CatalogAction) => {
    if (needsForm(action)) {
      openForm(action);
      return;
    }
    try {
      const outcome = await runAction(action.id, {
        hostId: Number(host.id),
        confirmed: true,
      });
      if (outcome.status === "success")
        toast.success(outcome.summary ?? t("state.success"));
      else if (outcome.status === "pending_approval")
        toast.info(t("run.waiting"));
      else toast.error(outcome.error ?? t(`state.${outcome.status}`));
    } catch (error) {
      toast.error(errorText(error, t("run.failed")));
    }
  };

  const item = (action: CatalogAction) => (
    <DropdownMenuItem
      key={action.id}
      onClick={(event) => {
        event.stopPropagation();
        void run(action);
      }}
    >
      <span className="truncate">{action.title}</span>
      {needsForm(action) && (
        <span className="ml-auto pl-2 text-muted-foreground">...</span>
      )}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Zap className="size-3.5 mr-2" />
        {t("host.actions")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 max-w-72 overflow-auto">
        {groups.length === 1
          ? groups[0].actions.map(item)
          : groups.map((group) => (
              <DropdownMenuSub key={group.plugin}>
                <DropdownMenuSubTrigger>
                  <span className="truncate">{group.plugin}</span>
                  <span className="ml-auto pl-2 text-muted-foreground">
                    {group.actions.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 max-w-72 overflow-auto">
                  {group.actions.map(item)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Tab bar button: the host page of the host you are working on. */
export function TabBarHostPageButton({
  targetTab,
  className,
  shell,
}: {
  targetTab?: { host?: PluginHostRecord; type?: string };
  className?: string;
  shell: Opener;
}) {
  const { t } = useTranslation();
  const live = useShell();
  const active = live?.tabs.list.find((tab) => tab.id === live.tabs.activeId);
  const host =
    active?.host && active.type !== HOST_TAB ? active.host : targetTab?.host;
  const label = host
    ? t("host.openFor", { name: hostLabel(host) })
    : t("host.open");
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!host}
      title={label}
      aria-label={label}
      className={`text-muted-foreground hover:text-foreground ${className ?? ""}`}
      onClick={() => host && openHostPage(shell, host)}
    >
      <LayoutDashboard className="size-4" />
    </Button>
  );
}

/** The host page's overview, small, beside a terminal. */
export function HostCompanion({
  host,
  isVisible,
  opener,
}: CompanionProps & {
  opener: Opener;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const status = useHostStatus(Number(host?.id))?.status;
  // The same list the host page's overview gets.
  const actions = useMemo(
    () =>
      catalog && host
        ? catalog.actions.filter((action) => appliesTo(action, host))
        : [],
    [catalog, host],
  );
  if (!host) return null;
  const Icon = LayoutDashboard as ComponentType<{ className?: string }>;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <StatusDot state={status} title={t(`state.${status ?? "unknown"}`)} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {hostLabel(host)}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openHostPage(opener, host)}
        >
          <Icon className="mr-1 size-3.5" />
          {t("host.open")}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <HostOverview
          host={host}
          shell={opener as ShellApi}
          catalog={catalog}
          actions={actions}
          cards={[]}
          isVisible={isVisible}
          compact
          onOpenTool={(type) => openHostPage(opener, host, type)}
        />
      </div>
    </div>
  );
}
