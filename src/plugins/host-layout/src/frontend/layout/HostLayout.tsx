import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  House,
  LayoutGrid,
  LibraryBig,
  LogOut,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  cn,
  ComponentSlot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  getTabType,
  ShellConfirmCapture,
  SurfaceScope,
  TabStage,
  tabIcon,
  useShellController,
  type Host,
  type HostTreeChild,
  type Tab,
} from "@termix-ssh/plugin-sdk/ui";
import { HostTree } from "../host/HostTree";
import { HostHeader } from "../host/HostHeader";
import { ancestorKeys } from "../host/tree-model";
import {
  lastHostTab,
  OVERVIEW_TAB,
  rememberHostTab,
  tabsOnHost,
} from "../host/host-tools";
import { DockPanel } from "../shell/DockPanel";
import { HostPalette } from "./HostPalette";
import { PanelDock, useToolItems } from "./panels";

const WIDTH_KEY = "host-layout.treeWidth";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

function readWidth(): number {
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH;
}

/** A tab's name for headers and the open pages list. */
export function pageTitle(tab: Tab, t: (key: string) => string): string {
  if (tab.customLabel) return tab.customLabel;
  if (tab.type === "dashboard") return t("hostLayout.home");
  if (tab.type === "host-manager") return t("hostLayout.manage");
  const titleKey = getTabType(tab.type)?.titleKey;
  return titleKey ? t(titleKey) : tab.label;
}

function NavButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex-1 h-10 flex items-center justify-center hover:bg-muted/40",
        active
          ? "text-accent-brand"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
    </button>
  );
}

/**
 * Host first: a tree of folders, hosts and what runs on them on the left,
 * and the selected host on the right with a tab for each of its tools.
 */
export function HostLayout() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs, hosts, regions } = shell;
  const mobile = shell.isMobile && !shell.isElectron;
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  // Phones show a panel only when it was opened here, not one left from another layout.
  const [mobilePanel, setMobilePanel] = useState<string | null>(null);
  const toolItems = useToolItems();

  const active = tabs.active;
  const activeHost = useMemo(() => {
    if (!active?.host) return null;
    return (
      hosts.list.find((host) => String(host.id) === String(active.host!.id)) ??
      active.host
    );
  }, [active, hosts.list]);
  const selectedHostId = activeHost ? String(activeHost.id) : null;
  const reveal = useMemo(
    () =>
      selectedHostId ? ancestorKeys(hosts.tree, selectedHostId) : undefined,
    [hosts.tree, selectedHostId],
  );

  useEffect(() => {
    if (active?.host) rememberHostTab(active.host.id, active.id);
  }, [active]);

  const selectHost = useCallback(
    (host: Host) => {
      const open = tabsOnHost(tabs.list, host.id);
      const last = lastHostTab(host.id);
      const target =
        open.find((tab) => tab.id === last) ??
        open.find((tab) => tab.type !== OVERVIEW_TAB) ??
        open[0];
      if (target) tabs.setActive(target.id);
      else tabs.open(host, OVERVIEW_TAB);
      if (mobile) setMobileDetail(true);
    },
    [tabs, mobile],
  );

  const openChild = useCallback(
    (host: Host, child: HostTreeChild) => {
      const existing = tabsOnHost(tabs.list, host.id).find(
        (tab) => tab.type === child.tabType,
      );
      if (existing) {
        // Point the tool's tab at this item instead of opening another one.
        if (child.data) {
          tabs.setList((list) =>
            list.map((tab) =>
              tab.id === existing.id
                ? { ...tab, data: { ...tab.data, ...child.data } }
                : tab,
            ),
          );
        }
        tabs.setActive(existing.id);
      } else {
        tabs.open(host, child.tabType, undefined, { data: child.data });
      }
      if (mobile) setMobileDetail(true);
    },
    [tabs, mobile],
  );

  const openPage = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      tabs.openSingleton(type, undefined, undefined, data);
      if (mobile) setMobileDetail(true);
    },
    [tabs, mobile],
  );

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    setDragging(true);
    const move = (e: MouseEvent) => {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + e.clientX - startX),
      );
      setWidth(next);
    };
    const up = (e: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDragging(false);
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + e.clientX - startX),
      );
      localStorage.setItem(WIDTH_KEY, String(next));
      shell.resizeAllTerminals();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const pages = tabs.topLevel.filter(
    (tab) => !tab.host && tab.type !== "dashboard",
  );

  const sidebar = (
    <aside
      className="flex flex-col min-h-0 bg-sidebar border-r border-border"
      style={mobile ? undefined : { width }}
    >
      <HostTree
        selectedHostId={selectedHostId}
        reveal={reveal}
        onSelectHost={selectHost}
        onOpenChild={openChild}
      />
      {pages.length > 0 && (
        <div className="border-t border-border py-1 max-h-[30%] overflow-y-auto">
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("hostLayout.openPages")}
          </p>
          {pages.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "group h-8 flex items-center gap-2 pl-3 pr-1 text-sm cursor-pointer",
                tab.id === tabs.activeId
                  ? "bg-accent-brand/15 text-foreground"
                  : "text-foreground/90 hover:bg-muted/40",
              )}
              onClick={() => {
                tabs.setActive(tab.id);
                if (mobile) setMobileDetail(true);
              }}
            >
              <span className="shrink-0 text-muted-foreground">
                {tabIcon(tab.type)}
              </span>
              <span className="truncate flex-1">{pageTitle(tab, t)}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void tabs.close(tab.id);
                }}
                aria-label={t("hostLayout.closeTab", {
                  name: pageTitle(tab, t),
                })}
                className="size-6 flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <nav className="flex border-t border-border shrink-0">
        <NavButton
          label={t("hostLayout.home")}
          icon={<House className="size-4" />}
          active={active?.type === "dashboard"}
          onClick={() => openPage("dashboard")}
        />
        <NavButton
          label={t("hostLayout.manage")}
          icon={<LibraryBig className="size-4" />}
          active={active?.type === "host-manager"}
          onClick={() => openPage("host-manager")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("hostLayout.toolsMenu")}
              aria-label={t("hostLayout.toolsMenu")}
              className="flex-1 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <LayoutGrid className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="min-w-56 overflow-y-auto text-sm"
          >
            {toolItems.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground">
                {t("hostLayout.noTools")}
              </p>
            ) : (
              toolItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onSelect={() => {
                      if (mobile && item.kind === "panel") {
                        setMobilePanel(item.id);
                        return;
                      }
                      item.open();
                      if (mobile && item.kind === "tab") setMobileDetail(true);
                    }}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <NavButton
          label={t("hostLayout.search")}
          icon={<Search className="size-4" />}
          onClick={shell.palette.open}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={shell.username}
              aria-label={t("hostLayout.account")}
              className={cn(
                "flex-1 h-10 flex items-center justify-center hover:bg-muted/40",
                active?.type === "settings"
                  ? "text-accent-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Settings className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            className="min-w-48 text-sm"
          >
            <p className="px-2 py-1.5 text-xs text-muted-foreground truncate">
              {shell.username}
            </p>
            <DropdownMenuItem onSelect={() => openPage("settings")}>
              <Settings className="size-4" />
              {t("hostLayout.settings")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => openPage("settings", { section: "account" })}
            >
              <User className="size-4" />
              {t("hostLayout.profile")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => shell.logout({ manual: true })}>
              <LogOut className="size-4" />
              {t("hostLayout.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </aside>
  );

  const back = mobile ? () => setMobileDetail(false) : undefined;
  const header = activeHost ? (
    <HostHeader host={activeHost} onBack={back} />
  ) : active && active.type !== "dashboard" ? (
    <div className="shrink-0 h-11 flex items-center gap-2 px-3 border-b border-border">
      {back && (
        <BackButton
          onClick={back}
          label={t("hostLayout.back")}
          className="-ml-3 border-r border-border"
        />
      )}
      <span className="text-muted-foreground">{tabIcon(active.type)}</span>
      <h2 className="truncate text-sm font-semibold">{pageTitle(active, t)}</h2>
      <button
        type="button"
        onClick={() => void tabs.close(active.id)}
        aria-label={t("hostLayout.closeTab", { name: pageTitle(active, t) })}
        className="ml-auto size-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
      >
        <X className="size-4" />
      </button>
    </div>
  ) : back ? (
    <div className="shrink-0 h-11 flex items-center px-3 border-b border-border">
      <BackButton
        onClick={back}
        label={t("hostLayout.back")}
        className="-ml-3 border-r border-border"
      />
    </div>
  ) : null;

  const showSidebar = !mobile || !mobileDetail;
  const showMain = !mobile || mobileDetail;

  return (
    <div
      className={cn(
        "flex flex-col w-screen bg-background",
        dragging && "select-none cursor-col-resize",
      )}
      style={{ height: "calc(100dvh - var(--termix-titlebar-height, 0px))" }}
    >
      <div className="isolate flex flex-1 min-h-0">
        {showSidebar && (
          <div className={cn("flex min-h-0", mobile && "flex-1")}>
            {sidebar}
            {!mobile && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("hostLayout.resize")}
                onMouseDown={startResize}
                onDoubleClick={() => {
                  setWidth(DEFAULT_WIDTH);
                  localStorage.removeItem(WIDTH_KEY);
                }}
                className="w-1 -ml-0.5 z-10 cursor-col-resize hover:bg-accent-brand/40"
              />
            )}
          </div>
        )}
        <div
          className={cn(
            "relative flex flex-col flex-1 min-w-0 overflow-hidden",
            !showMain && "hidden",
          )}
        >
          <SurfaceScope kind="tab" className="overflow-hidden">
            <ShellConfirmCapture />
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              {header}
              <TabStage />
            </div>
          </SurfaceScope>
        </div>
        {!mobile && regions.right.view && (
          <DockPanel
            side="right"
            title={t(
              toolItems.find((item) => item.id === regions.right.view)
                ?.labelKey ?? "hostLayout.panel",
            )}
            open
            width={regions.right.width}
            dragging={regions.right.dragging}
            onResizeStart={regions.right.startResize}
            onClose={() => regions.right.setView(null)}
            onResetWidth={regions.right.resetWidth}
          >
            <PanelDock view={regions.right.view} />
          </DockPanel>
        )}
        <ComponentSlot slotId="shell.rightEdge" />
      </div>
      {mobile && mobilePanel && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background">
          <div className="h-11 flex items-center gap-2 px-3 border-b border-border">
            <BackButton
              onClick={() => setMobilePanel(null)}
              label={t("hostLayout.back")}
              className="-ml-3 border-r border-border"
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <PanelDock view={mobilePanel} />
          </div>
        </div>
      )}
      <HostPalette onOpened={() => mobile && setMobileDetail(true)} />
    </div>
  );
}
