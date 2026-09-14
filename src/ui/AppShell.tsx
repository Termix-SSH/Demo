import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  PanelRight,
  RotateCcw,
  SquareArrowOutUpRight,
} from "lucide-react";
import { AppRail, type RailView } from "@/sidebar/AppRail";
import {
  PROMOTABLE_IDS,
  RIGHT_DOCKABLE_IDS,
  railItemLabel,
} from "@/sidebar/rail-items";
import { MultiPanelHint } from "@/sidebar/MultiPanelHint";
import { HostsPanel } from "@/sidebar/HostsPanel";
import { CredentialsPanel } from "@/sidebar/CredentialsPanel";
import { TabBar } from "@/shell/TabBar";
import { SplitView, defaultSizes, type RowColSizes } from "@/shell/SplitView";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { Sheet, SheetContent } from "@/components/sheet";
import { ServerStatusProvider } from "@/lib/ServerStatusContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { PANE_COUNTS } from "@/lib/theme";
import { buildHostTree } from "@/sidebar/build-host-tree";
import { getDemoHosts, subscribeDemoHosts } from "@/demo/demo-store";
import { DemoPanel } from "@/demo/DemoPanel";
import {
  renderDemoPanelBody,
  renderDemoTabContent,
} from "@/demo/demo-tab-content";
import type {
  Host,
  HostFolder,
  SplitMode,
  Tab,
  TabType,
} from "@/types/ui-types";

// Each tab's content is portalled into a stable per-tab DOM node that is moved
// between the normal view and a split pane with appendChild. Changing a portal
// target remounts the subtree, which would tear down a terminal on every split
// or tab switch, so the node has to outlive the layout change.

const SIDEBAR_DEFAULT_WIDTH = 291;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 560;
const PANE_SLOTS = 6;

function newInstanceId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function AppShell({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [railView, setRailView] = useState<RailView>("hosts");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [sidebarEditing, setSidebarEditing] = useState(false);
  const [rightRailView, setRightRailView] = useState<RailView | null>(null);

  const [tabs, setTabs] = useState<Tab[]>(() => [
    {
      id: "dashboard",
      instanceId: newInstanceId(),
      type: "dashboard",
      label: t("nav.dashboard"),
      openedAt: Date.now(),
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("dashboard");
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);

  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [paneTabIds, setPaneTabIds] = useState<(string | null)[]>(
    Array(PANE_SLOTS).fill(null),
  );
  const [focusedPaneIndex, setFocusedPaneIndex] = useState<number | null>(null);
  const [rowSizes, setRowSizes] = useState<number[]>([100]);
  const [rowColSizes, setRowColSizes] = useState<RowColSizes>([[100]]);
  const [paneContentEls, setPaneContentEls] = useState<
    (HTMLDivElement | null)[]
  >(Array(PANE_SLOTS).fill(null));

  const isSplit = splitMode !== "none" && !isMobile;

  const [hostTree, setHostTree] = useState<HostFolder | null>(null);
  const [hostsLoading, setHostsLoading] = useState(true);

  const [hosts, setHosts] = useState(getDemoHosts);

  useEffect(() => {
    // One short delay on first load so the real loading skeletons show, then
    // follow the store for anything added through the add-host form.
    const timer = setTimeout(() => {
      setHostTree(buildHostTree(getDemoHosts()));
      setHostsLoading(false);
    }, 180);
    const unsubscribe = subscribeDemoHosts(() => {
      setHosts(getDemoHosts());
      setHostTree(buildHostTree(getDemoHosts()));
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Stable per-tab DOM nodes, see the note at the top of this file.
  const tabNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const normalViewRef = useRef<HTMLDivElement>(null);

  const getTabNode = useCallback((tabId: string, isTerminal: boolean) => {
    if (!tabNodesRef.current.has(tabId)) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.inset = "0";
      el.style.overflow = "hidden";
      if (!isTerminal) el.classList.add("bg-background");
      tabNodesRef.current.set(tabId, el);
    }
    return tabNodesRef.current.get(tabId)!;
  }, []);

  const onPaneContentRef = useCallback(
    (paneIndex: number, el: HTMLDivElement | null) => {
      setPaneContentEls((prev) => {
        if (prev[paneIndex] === el) return prev;
        const next = [...prev];
        next[paneIndex] = el;
        return next;
      });
    },
    [],
  );

  // Move each tab's node into the right container. Vanilla DOM on purpose.
  useEffect(() => {
    const normalView = normalViewRef.current;
    if (!normalView) return;

    const tabIds = new Set(tabs.map((tb) => tb.id));
    for (const [id, node] of tabNodesRef.current) {
      if (!tabIds.has(id)) {
        node.remove();
        tabNodesRef.current.delete(id);
      }
    }

    for (const tab of tabs) {
      const isTerminal =
        tab.type === "terminal" || tab.type === "local-terminal";
      const node = getTabNode(tab.id, isTerminal);
      const paneIdx = isSplit ? paneTabIds.indexOf(tab.id) : -1;
      const inPane = paneIdx !== -1;
      const paneEl = inPane ? paneContentEls[paneIdx] : null;
      const activeInline = !inPane && tab.id === activeTabId;

      if (inPane && paneEl) {
        if (node.parentElement !== paneEl) paneEl.appendChild(node);
        node.style.visibility = "visible";
        node.style.pointerEvents = "auto";
        node.style.display = "";
        node.style.zIndex = "";
      } else {
        if (node.parentElement !== normalView) normalView.appendChild(node);
        if (isTerminal) {
          // Terminals stay mounted and are only hidden, so scrollback and the
          // xterm instance survive tab switches.
          node.style.display = "";
          node.style.visibility = activeInline ? "visible" : "hidden";
          node.style.pointerEvents = activeInline ? "auto" : "none";
          node.style.zIndex = activeInline ? "1" : "0";
        } else {
          node.classList.toggle("motion-workspace-enter", activeInline);
          node.style.visibility = "";
          node.style.pointerEvents = "";
          node.style.zIndex = activeInline ? "2" : "";
          node.style.display = activeInline ? "" : "none";
        }
      }
    }
  });


  const topLevelTabs = useMemo(
    () => tabs.filter((tb) => !tb.parentSplitTabId),
    [tabs],
  );

  function openTab(host: Host, type: TabType, extra?: Partial<Tab>) {
    const id = `${type}-${host.id}-${Date.now().toString(36)}`;
    const label =
      type === "terminal" || type === "local-terminal"
        ? host.name
        : `${host.name} (${railItemLabel(type, t) || type})`;
    const tab: Tab = {
      id,
      instanceId: newInstanceId(),
      type,
      label,
      host,
      openedAt: Date.now(),
      ...extra,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    if (isMobile) setSidebarOpen(false);
  }

  function openSingletonTab(type: TabType) {
    const existing = tabs.find((tb) => tb.type === type && !tb.host);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: Tab = {
      id: `${type}`,
      instanceId: newInstanceId(),
      type,
      label: railItemLabel(type, t) || type,
      openedAt: Date.now(),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((tb) => tb.id !== id);
      if (next.length === 0) {
        const fallback: Tab = {
          id: "dashboard",
          instanceId: newInstanceId(),
          type: "dashboard",
          label: t("nav.dashboard"),
          openedAt: Date.now(),
        };
        setActiveTabId(fallback.id);
        return [fallback];
      }
      if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
      return next;
    });
    setPaneTabIds((prev) => prev.map((p) => (p === id ? null : p)));
  }

  function refreshTab(id: string) {
    // Remounting the content is enough here: swapping instanceId gives
    // the portalled subtree a new key.
    setTabs((prev) =>
      prev.map((tb) =>
        tb.id === id ? { ...tb, instanceId: newInstanceId() } : tb,
      ),
    );
  }

  function renameTab(tabId: string, newLabel: string) {
    setTabs((prev) =>
      prev.map((tb) =>
        tb.id === tabId
          ? { ...tb, customLabel: newLabel, label: newLabel }
          : tb,
      ),
    );
  }

  function reorderTopLevelTabs(next: Tab[]) {
    setTabs((prev) => [...next, ...prev.filter((tb) => tb.parentSplitTabId)]);
  }

  function changeSplitMode(mode: SplitMode) {
    const sizes = defaultSizes(mode);
    setSplitMode(mode);
    setRowSizes(sizes.rowSizes);
    setRowColSizes(sizes.rowColSizes);
    if (mode === "none") {
      setPaneTabIds(Array(PANE_SLOTS).fill(null));
      setFocusedPaneIndex(null);
      return;
    }
    // Seed the panes with the active tab, then whatever else is open.
    const count = PANE_COUNTS[mode];
    const ordered = [
      activeTabId,
      ...topLevelTabs.map((tb) => tb.id).filter((id) => id !== activeTabId),
    ];
    setPaneTabIds(
      Array.from({ length: PANE_SLOTS }, (_, i) =>
        i < count ? (ordered[i] ?? null) : null,
      ),
    );
    setFocusedPaneIndex(0);
  }

  function splitTabQuick(tabId: string, mode: SplitMode) {
    setActiveTabId(tabId);
    changeSplitMode(mode);
  }

  function addTabToSplit(tabId: string) {
    setPaneTabIds((prev) => {
      if (prev.includes(tabId)) return prev;
      const count = PANE_COUNTS[splitMode] || 0;
      const slot = prev.findIndex((p, i) => i < count && p === null);
      if (slot === -1) return prev;
      const next = [...prev];
      next[slot] = tabId;
      return next;
    });
  }

  function removeTabFromSplit(tabId: string) {
    setPaneTabIds((prev) => prev.map((p) => (p === tabId ? null : p)));
  }

  function assignPane(paneIndex: number, tabId: string) {
    setPaneTabIds((prev) => {
      const next = prev.map((p) => (p === tabId ? null : p));
      next[paneIndex] = tabId;
      return next;
    });
  }


  function onSidebarMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setSidebarDragging(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMove = (ev: MouseEvent) => {
      const next = startWidth + (ev.clientX - startX);
      setSidebarWidth(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)),
      );
    };
    const onUp = () => {
      setSidebarDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleRailClick(view: RailView) {
    if (railView === view && sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    setRailView(view);
    setSidebarOpen(true);
  }

  function openInRightDock(view: RailView) {
    setRightRailView(view);
    if (railView === view) setSidebarOpen(false);
  }

  function toggleRightDock() {
    setRightRailView((prev) =>
      prev ? null : ((RIGHT_DOCKABLE_IDS[0] as RailView) ?? null),
    );
  }


  const renderSidebarPanels = (view: RailView, owned = true) => (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {owned && (
        <>
          {/* Hosts and credentials stay mounted so switching rail views keeps
              scroll position and expanded folders, as in the real app. */}
          <div
            className={`flex flex-col flex-1 min-h-0 ${view === "hosts" ? "" : "hidden"}`}
          >
            <HostsPanel
              onOpenTab={(host, type) => openTab(host, type)}
              onEditHost={() => {}}
              hostTree={hostTree ?? undefined}
              loading={hostsLoading}
              onEditingChange={setSidebarEditing}
              active={view === "hosts"}
            />
          </div>

          <div
            className={`flex flex-col flex-1 min-h-0 ${view === "credentials" ? "" : "hidden"}`}
          >
            <CredentialsPanel
              onEditingChange={setSidebarEditing}
              active={view === "credentials"}
            />
          </div>
        </>
      )}

      {view !== "hosts" && view !== "credentials" && (
        <SecondaryPanel view={view} />
      )}
    </div>
  );

  const sidebarTitle = (view: RailView): string => railItemLabel(view, t);

  const sidebarHeader = (view: RailView) => (
    <div className="flex flex-row items-center border-b border-border h-12.5 shrink-0">
      <span className="flex-1 min-w-0 whitespace-nowrap text-base font-bold tracking-tight text-foreground px-3">
        {sidebarTitle(view)}
      </span>
      {!isMobile && PROMOTABLE_IDS.includes(view) && (
        <>
          <Separator orientation="vertical" />
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
            title={t("nav.openAsTab")}
            aria-label={t("nav.openAsTab")}
            onClick={() => openSingletonTab(view as TabType)}
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </Button>
        </>
      )}
      {!isMobile && RIGHT_DOCKABLE_IDS.includes(view) && (
        <>
          <Separator orientation="vertical" />
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
            title={t("nav.openInRightDock")}
            aria-label={t("nav.openInRightDock")}
            onClick={() => openInRightDock(view)}
          >
            <PanelRight className="size-3.5" />
          </Button>
        </>
      )}
      {!isMobile && (
        <>
          <Separator orientation="vertical" />
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12.5 border-y-0 border-border rounded-none text-muted-foreground hover:text-foreground"
            title="Reset width"
            onClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </>
      )}
      {!isMobile && (
        <>
          <Separator orientation="vertical" />
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
            title="Collapse sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );

  const sidebarHint = !isMobile && (
    <MultiPanelHint
      canPromote={PROMOTABLE_IDS.includes(railView)}
      canRightDock={RIGHT_DOCKABLE_IDS.includes(railView)}
      onOpenAsTab={() => openSingletonTab(railView as TabType)}
      onOpenInRightDock={() => openInRightDock(railView)}
    />
  );

  return (
    <ServerStatusProvider isAuthenticated={!!username}>
      <div
        className="flex flex-col w-screen bg-background"
        style={{ height: "100dvh" }}
      >
        <div className="flex flex-1 min-h-0">
          {/* Skinny icon rail - desktop only */}
          <AppRail
            railView={railView}
            sidebarOpen={sidebarOpen}
            splitMode={splitMode}
            username={username}
            isAdmin
            onRailClick={handleRailClick}
            onOpenTab={openSingletonTab}
            onOpenInRightDock={openInRightDock}
            onOpenPlugins={() => openSingletonTab("plugins")}
            onLogout={onLogout}
          />

          {/* Desktop: inline resizable sidebar */}
          {!isMobile && (
            <div
              className={`relative flex flex-col min-h-0 bg-sidebar shrink-0 overflow-hidden ${
                sidebarOpen
                  ? `border-r transition-colors ${sidebarDragging ? "border-accent-brand/60" : "border-border"}`
                  : ""
              }`}
              style={{
                width: sidebarOpen ? (sidebarEditing ? 560 : sidebarWidth) : 0,
                transition: sidebarDragging ? "none" : "width 0.2s",
              }}
            >
              {sidebarHeader(railView)}
              {sidebarHint}
              {renderSidebarPanels(railView)}

              {sidebarOpen && !sidebarEditing && (
                <div
                  onMouseDown={onSidebarMouseDown}
                  className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${
                    sidebarDragging
                      ? "bg-accent-brand/60"
                      : "hover:bg-accent-brand/40"
                  }`}
                />
              )}
            </div>
          )}

          {/* Mobile: sidebar as an overlay sheet */}
          {isMobile && (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="p-0 flex flex-col min-h-0 max-w-full bg-sidebar border-r border-border gap-0 w-[min(85vw,360px)]"
                style={{ height: "100dvh" }}
              >
                {sidebarHeader(railView)}
                {renderSidebarPanels(railView)}
              </SheetContent>
            </Sheet>
          )}

          {/* Main content area */}
          <div
            className={`relative flex flex-col flex-1 min-w-0 overflow-hidden transition-[padding] duration-200 ${
              !isMobile && !sidebarOpen ? "pl-6" : ""
            }`}
          >
            {!isMobile && !sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Open Sidebar"
                className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-sidebar border-r border-border text-muted-foreground hover:text-accent-brand hover:bg-accent-brand/5 transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
            )}

            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              <TabBar
                tabs={topLevelTabs}
                activeTabId={activeTabId}
                splitMode={splitMode}
                paneTabIds={paneTabIds}
                focusedPaneIndex={focusedPaneIndex}
                onSetActiveTab={setActiveTabId}
                onCloseTab={closeTab}
                onRefreshTab={refreshTab}
                onReorderTabs={reorderTopLevelTabs}
                onSplitTab={splitTabQuick}
                onAddToSplit={addTabToSplit}
                onRemoveFromSplit={removeTabFromSplit}
                onRenameTab={renameTab}
                onOpenFileManager={(tabId) => {
                  const target = tabs.find((tb) => tb.id === tabId);
                  if (target?.host) openTab(target.host, "files");
                }}
                isAppFullscreen={isAppFullscreen}
                onToggleAppFullscreen={() => setIsAppFullscreen((v) => !v)}
                rightDockOpen={rightRailView !== null}
                onToggleRightDock={isMobile ? undefined : toggleRightDock}
              />

              <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
                {!isMobile && (
                  <div
                    className="motion-workspace-layout absolute inset-0"
                    style={{
                      display: isSplit ? "flex" : "none",
                      flexDirection: "column",
                    }}
                  >
                    <SplitView
                      tabs={tabs}
                      paneTabIds={paneTabIds}
                      splitMode={splitMode}
                      rowSizes={rowSizes}
                      rowColSizes={rowColSizes}
                      onRowSizesChange={setRowSizes}
                      onRowColSizesChange={setRowColSizes}
                      onReset={() => changeSplitMode(splitMode)}
                      focusedPaneIndex={focusedPaneIndex}
                      onPaneContentRef={onPaneContentRef}
                      onPaneClick={setFocusedPaneIndex}
                      onAssignPane={assignPane}
                    />
                  </div>
                )}

                {/* Tab nodes are appended here (or into a pane) by the effect
                    above; each tab's content is portalled into its own node. */}
                <div
                  ref={normalViewRef}
                  className="absolute inset-0"
                  style={{ display: isSplit ? "none" : undefined }}
                >
                  {tabs.map((tab) => {
                    const node = getTabNode(
                      tab.id,
                      tab.type === "terminal" || tab.type === "local-terminal",
                    );
                    return createPortal(
                      renderDemoTabContent(tab, {
                        hosts,
                        onOpenTab: openTab,
                        onOpenSingletonTab: openSingletonTab,
                      }),
                      node,
                      `${tab.id}-${tab.instanceId}`,
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right dock */}
          {!isMobile && rightRailView && (
            <div className="relative flex flex-col min-h-0 bg-sidebar shrink-0 overflow-hidden border-l border-border w-[291px]">
              <div className="flex flex-row items-center border-b border-border h-12.5 shrink-0">
                <span className="flex-1 min-w-0 whitespace-nowrap text-base font-bold tracking-tight text-foreground px-3">
                  {sidebarTitle(rightRailView)}
                </span>
                <Separator orientation="vertical" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
                  title="Close dock"
                  onClick={() => setRightRailView(null)}
                >
                  <PanelRight className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-col flex-1 min-h-0" />
            </div>
          )}
        </div>
      </div>
    </ServerStatusProvider>
  );
}

function SecondaryPanel({ view }: { view: RailView }) {
  const content = renderDemoPanelBody({
    id: `panel-${view}`,
    instanceId: view,
    type: view as TabType,
    label: view,
    openedAt: 0,
  });

  if (content) {
    // The tab renderer wraps panels in their own header; inside the sidebar the
    // header is already drawn, so only the body is wanted here.
    return <div className="flex flex-col flex-1 min-h-0">{content}</div>;
  }

  return <DemoPanel emptyTitle="Nothing to show" />;
}
