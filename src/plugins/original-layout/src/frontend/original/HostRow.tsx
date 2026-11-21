import {
  actionOrder,
  copyToClipboard,
  defaultConnectAction,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  getHostPassword,
  getStatusClasses,
  hostActionsFor,
  hostBadgesFor,
  HostDataItems,
  HostDotGroup,
  hostMenuItemsFor,
  hostStatusIndicatorsFor,
  markTabSurfaceUsed,
  preloadTabSurface,
  recordHostActionPreference,
  shell,
  useHostActions,
  useHostBadges,
  useHostContextMenuItems,
  useHostStatus,
  useHostStatusIndicators,
  type Host,
  type HostActionDef,
  type TabShellCallbacks,
  type TabType,
} from "@termix-ssh/plugin-sdk/ui";
import {
  usePluginUiPreferences,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Copy,
  EllipsisVertical,
  Key,
  KeyRound,
  Pencil,
  Pin,
  Share2,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  HOST_PAGE_TAB,
  hostToolsMode,
  openInHostPage,
  opensInHostPage,
  showsInBar,
  useBarActions,
  useHostRowPrefs,
} from "../sidebar/tree/host-bar-actions";
import { canOpenHostEditor, canShareHost } from "../sidebar/host-permissions";

/** How many tools fit in the row's button group before the rest go in the menu. */
export const MAX_ROW_BUTTONS = 3;

export interface OpenHostOptions {
  data?: Record<string, unknown>;
  label?: string;
  forceNewTab?: boolean;
}

interface RowEntry {
  key: string;
  order: number;
  icon: typeof Terminal;
  label: string;
  tabType?: TabType;
  tray: boolean;
  items?: { id: string; label: string; run: () => void }[];
  run: () => void;
}

const buttonClass =
  "inline-flex size-8 items-center justify-center border border-[color:var(--original-button-border,var(--input))] bg-[var(--original-elevated,var(--background))] text-foreground transition-colors hover:bg-[var(--original-button-hover,var(--accent))] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&:not(:first-child)]:-ml-px first:rounded-l-[0.5rem] last:rounded-r-[0.5rem]";

/** One host in a folder card, drawn the way v2.2.1 did. */
export function HostRow({
  host,
  depth = 0,
  showTags = true,
  focusExisting = false,
  onOpen,
  onEdit,
  onShare,
}: {
  host: Host;
  depth?: number;
  showTags?: boolean;
  /** A click switches to an open tab of the host instead of opening another. */
  focusExisting?: boolean;
  onOpen: (host: Host, type: TabType, options?: OpenHostOptions) => void;
  onEdit?: (host: Host) => void;
  onShare?: (host: Host) => void;
}) {
  const { t } = useTranslation();
  const allActions = useHostActions();
  const pluginActions = hostActionsFor(allActions, host);
  const barActions = useBarActions();
  const rowPrefs = useHostRowPrefs(String(host.id));
  const layoutPrefs = usePluginUiPreferences<{
    hostTools?: string;
    clickAction?: string;
  }>();
  const badges = hostBadgesFor(useHostBadges(), host);
  const indicators = hostStatusIndicatorsFor(useHostStatusIndicators(), host);
  const menuItems = hostMenuItemsFor(useHostContextMenuItems(), host);
  const statusOn = host.statusCheckEnabled !== false;
  const status = useHostStatus(Number(host.id), statusOn) ?? "offline";

  const hasHostPage = pluginActions.some(
    (action) => action.tabType === HOST_PAGE_TAB,
  );
  const toolsMode = hasHostPage
    ? hostToolsMode(layoutPrefs.values.hostTools)
    : "tab";
  const toolsInPage = toolsMode !== "tab";
  const pageOnly = toolsMode === "only";

  const openTab = (type: TabType, options?: OpenHostOptions) => {
    if (!type) return;
    markTabSurfaceUsed(type);
    recordHostActionPreference(host.id, type);
    onOpen(host, type, {
      ...options,
      forceNewTab: options?.forceNewTab ?? !focusExisting,
    });
  };

  // Plugin actions that open a tab go through the row, so they get the same
  // focus and preference handling.
  const rowShell: TabShellCallbacks = {
    ...shell,
    openTab: (_host, type, options) => openTab(type, options),
  };

  const openInPage = (type: TabType, section: string) => {
    markTabSurfaceUsed(HOST_PAGE_TAB);
    recordHostActionPreference(host.id, type);
    void openInHostPage(host, section).then((handled) => {
      if (!handled) openTab(type);
    });
  };

  const runAction = (action: HostActionDef) => {
    if (action.run) action.run(host, rowShell);
    else if (toolsInPage && action.tabType === HOST_PAGE_TAB)
      openInPage(HOST_PAGE_TAB, "overview");
    else if (toolsInPage && opensInHostPage(action))
      openInPage(action.tabType!, action.tabType!);
    else if (action.tabType) openTab(action.tabType);
  };

  const entries: RowEntry[] = pluginActions
    .map((action) => {
      const items = action.items?.(host);
      return {
        key: action.id,
        order: actionOrder(action),
        icon: action.icon as typeof Terminal,
        label: action.label?.(host) ?? t(action.titleKey),
        tabType: action.tabType,
        tray: showsInBar(barActions, action, rowPrefs?.bar),
        items:
          items && items.length > 1
            ? items.map((item) => ({
                id: item.id,
                label: item.label,
                run: () => item.run(host, rowShell),
              }))
            : undefined,
        run: () =>
          items && items.length === 1
            ? items[0].run(host, rowShell)
            : runAction(action),
      };
    })
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const rowButtons = pageOnly
    ? []
    : entries.filter((entry) => entry.tray).slice(0, MAX_ROW_BUTTONS);
  const menuEntries = entries.filter((entry) => !rowButtons.includes(entry));

  const connectAction: TabType = pageOnly
    ? HOST_PAGE_TAB
    : (defaultConnectAction(allActions, host)?.tabType ?? "");
  const clickable = entries.filter((entry) => !entry.items);
  const picked =
    clickable.find((entry) => entry.key === rowPrefs?.click) ??
    clickable.find((entry) => entry.key === layoutPrefs.values.clickAction);
  const openDefault = () => {
    if (pageOnly) openInPage(HOST_PAGE_TAB, "overview");
    else if (picked) picked.run();
    else openTab(connectAction);
  };

  const canCopyPassword =
    !host.isShared &&
    (host.authType === "password" ||
      host.authType === "credential" ||
      !!host.hasPassword);
  const canCopySudo = !host.isShared && !!host.hasSudoPassword;
  const copyPassword = async (field: "password" | "sudoPassword") => {
    try {
      const value = await getHostPassword(Number(host.id), field);
      if (!value || !(await copyToClipboard(value))) throw new Error();
      toast.success(t("nav.passwordCopied"));
    } catch {
      toast.error(t("nav.failedToCopyPassword"));
    }
  };
  const copyAddress = async () => {
    const address = `${host.username ? `${host.username}@` : ""}${host.ip}`;
    if (await copyToClipboard(address)) toast.success(t("original.copied"));
    else toast.error(t("original.copyFailed"));
  };

  const editable = onEdit && canOpenHostEditor(host);
  const shareable = onShare && canShareHost(host);
  const tags = showTags ? (host.tags ?? []) : [];
  const name = host.name || host.ip;

  return (
    <div
      className="flex flex-col gap-1"
      style={depth > 0 ? { paddingLeft: depth * 12 } : undefined}
      data-host-row={host.id}
    >
      <div className="flex items-center gap-2 min-w-0">
        {statusOn && (
          <span
            role="img"
            aria-label={t(`original.status.${status}`)}
            title={t(`original.status.${status}`)}
            className={`size-2 shrink-0 rounded-full ${getStatusClasses(status, "status", "dot")}`}
          />
        )}
        <button
          type="button"
          onClick={openDefault}
          onPointerEnter={() =>
            connectAction && preloadTabSurface(connectAction)
          }
          title={t("original.openHost", { name })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-semibold break-words hover:underline focus-visible:outline-none focus-visible:underline"
        >
          <span className="min-w-0 break-words">{name}</span>
          {host.pin && (
            <Pin
              aria-label={t("original.pinned")}
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
        </button>
        <HostDataItems host={host} items={indicators} className="gap-1" />
        <HostDataItems host={host} items={badges} className="gap-1" />
        <HostDotGroup host={host} badges={badges} />

        <div className="flex shrink-0 items-center">
          {rowButtons.map((entry) => {
            const Icon = entry.icon;
            if (entry.items) {
              return (
                <DropdownMenu key={entry.key} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={entry.label}
                      aria-label={entry.label}
                      className={buttonClass}
                    >
                      <Icon className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {entry.items.map((item) => (
                      <DropdownMenuItem key={item.id} onSelect={item.run}>
                        <Icon className="size-3.5" />
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }
            return (
              <button
                key={entry.key}
                type="button"
                title={entry.label}
                aria-label={entry.label}
                onPointerEnter={() =>
                  entry.tabType && preloadTabSurface(entry.tabType)
                }
                onClick={entry.run}
                className={buttonClass}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t("original.moreHostActions")}
                aria-label={t("original.moreHostActions")}
                className={buttonClass}
              >
                <EllipsisVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-56">
              {menuEntries.map((entry) => {
                const Icon = entry.icon;
                if (entry.items) {
                  return (
                    <DropdownMenuSub key={entry.key}>
                      <DropdownMenuSubTrigger>
                        <Icon className="size-3.5" />
                        {entry.label}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {entry.items.map((item) => (
                          <DropdownMenuItem key={item.id} onSelect={item.run}>
                            {item.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  );
                }
                return (
                  <DropdownMenuItem key={entry.key} onSelect={entry.run}>
                    <Icon className="size-3.5" />
                    {entry.label}
                  </DropdownMenuItem>
                );
              })}
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => item.run(host, rowShell)}
                  >
                    {Icon && <Icon className="size-3.5" />}
                    {t(item.titleKey)}
                  </DropdownMenuItem>
                );
              })}
              {(menuEntries.length > 0 || menuItems.length > 0) && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem onSelect={() => void copyAddress()}>
                <Copy className="size-3.5" />
                {t("original.copyAddress")}
              </DropdownMenuItem>
              {canCopyPassword && (
                <DropdownMenuItem
                  onSelect={() => void copyPassword("password")}
                >
                  <Key className="size-3.5" />
                  {t("nav.copyPassword")}
                </DropdownMenuItem>
              )}
              {canCopySudo && (
                <DropdownMenuItem
                  onSelect={() => void copyPassword("sudoPassword")}
                >
                  <KeyRound className="size-3.5" />
                  {t("nav.copySudoPassword")}
                </DropdownMenuItem>
              )}
              {(editable || shareable) && <DropdownMenuSeparator />}
              {shareable && (
                <DropdownMenuItem onSelect={() => onShare(host)}>
                  <Share2 className="size-3.5" />
                  {t("original.share")}
                </DropdownMenuItem>
              )}
              {editable && (
                <DropdownMenuItem onSelect={() => onEdit(host)}>
                  <Pencil className="size-3.5" />
                  {t("original.edit")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[10px] border border-border bg-background px-2 text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
