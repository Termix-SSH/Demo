import { useRef, useEffect, useState } from "react";
import {
  Button,
  Separator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  tabIcon,
  isSessionTabType,
  isElectron,
  type Host,
  type Tab,
  type TabType,
  ActionSlot,
  ComponentSlot,
  useTabHandlesVersion,
  canJoinSplit,
  isSplitTab,
  type SplitSummary,
  type TabSplitAction,
  MAX_PANES,
  SplitLayoutMenu,
  beginSplitDrag,
  endSplitDrag,
  isSplitDragging,
  moveSplitDrag,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { canOpenHostEditor } from "../sidebar/host-permissions";
import { TabBarActions } from "./TabBarActions";
import { outlineButton } from "../original/styles";

/** Plugins add buttons to the right of the tab bar here, beside split view. */
export const TAB_BAR_ACTIONS_SLOT = "tabbar.actions";
// Plugin buttons may draw in a frame, which only has core's classes.
// The box around it comes from TabBarActions.
const TAB_BAR_BUTTON = "h-full w-8 text-foreground hover:bg-muted";
const BAR_BUTTON = `${outlineButton} size-[30px]`;
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  Plus,
  Pencil,
  SquarePen,
  Columns2,
  Rows2,
  Ungroup,
  Maximize2,
  Minimize2,
  PanelRight,
  MoreHorizontal,
  Hammer,
  Home,
  Zap,
} from "lucide-react";

/** How far below the bar a dragged tab has to go before it drags into the view. */
const DRAG_OUT_DISTANCE = 16;

/**
 * Caps a tab's width on narrow screens so one long hostname can't make the
 * strip pan just to read it or reach its buttons. 100cqw is the scroll strip's
 * visible width (it is the @container), not its scrolled content, so a percent
 * width would not work here. Desktop tabs keep their natural width.
 */
const TAB_MAX_WIDTH = "max-w-[min(16rem,100cqw)] md:max-w-none";

// The old tabs: the open one is darker and underlined in the text color.
const ACTIVE_TAB =
  "z-10 bg-[var(--original-deepest,var(--background))] shadow-[inset_0_-2px_0_var(--foreground)]";
const IDLE_TAB =
  "bg-[color-mix(in_oklab,var(--original-deepest,var(--background))_80%,transparent)] hover:bg-[color-mix(in_oklab,var(--original-deepest,var(--background))_90%,transparent)]";

/** The home tab shows a house, like the old bar. */
function barIcon(type: TabType) {
  return type === "dashboard" ? <Home className="size-4" /> : tabIcon(type);
}

/**
 * Tabs holding a live connection that can be refreshed: the registered
 * session tabs.
 */
function isConnectionTab(type: TabType): boolean {
  return isSessionTabType(type);
}

export function TabBar({
  tabs,
  activeTabId,
  splits,
  activeSplitFull,
  onSetActiveTab,
  onCloseTab,
  onRefreshTab,
  onReconnectDisconnected,
  onReorderTabs,
  onSplitAction,
  onRenameTab,
  hosts,
  onEditHost,
  isAppFullscreen,
  onToggleAppFullscreen,
  rightDockOpen,
  onToggleRightDock,
  showTabNumbers,
  targetTab,
  toolsOpen,
  onToggleTools,
  onQuickConnect,
}: {
  tabs: Tab[];
  activeTabId: string;
  /** Every split tab and its panes, for the "Add to split" entries. */
  splits: SplitSummary[];
  /** The active tab is a split with no room for another pane. */
  activeSplitFull: boolean;
  onSetActiveTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRefreshTab: (id: string) => void;
  onReconnectDisconnected?: () => void;
  onReorderTabs: (tabs: Tab[]) => void;
  onSplitAction: (action: TabSplitAction) => void;
  onRenameTab?: (tabId: string, newLabel: string) => void;
  /** Saved hosts, so a tab offers Edit host only while its host still exists. */
  hosts?: Host[];
  onEditHost?: (host: Host) => void;
  isAppFullscreen: boolean;
  onToggleAppFullscreen: () => void;
  rightDockOpen?: boolean;
  onToggleRightDock?: () => void;
  showTabNumbers?: boolean;
  /** The terminal the user worked in last, handed to tab bar buttons. */
  targetTab?: Tab;
  toolsOpen?: boolean;
  onToggleTools?: () => void;
  onQuickConnect?: () => void;
}) {
  const { t } = useTranslation();
  // Re-renders when a tab's handle attaches, for buttons whose when reads it.
  useTabHandlesVersion();
  const [open, setOpen] = useState(true);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [draggingOut, setDraggingOut] = useState(false);
  const [contextTabId, setContextTabId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragData = useRef<{
    id: string;
    index: number;
    startX: number;
    startY: number;
    offsetX: number;
    width: number;
    barTop: number;
    barHeight: number;
    x: number;
    y: number;
  } | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const didDrag = useRef(false);

  const activeIsSplit = isSplitTab(tabs.find((tab) => tab.id === activeTabId));

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!dragTabId) return;

    function onPointerMove(e: PointerEvent) {
      if (!dragData.current || !tabBarRef.current) return;
      const d = dragData.current;
      if (Math.abs(e.clientX - d.startX) > 5) didDrag.current = true;

      const barRect = tabBarRef.current.getBoundingClientRect();

      // Dragged down out of the bar: the tab heads for the view to be split.
      const dragged = tabs.find((t) => t.id === d.id);
      if (
        canJoinSplit(dragged) &&
        e.clientY > barRect.bottom + DRAG_OUT_DISTANCE
      ) {
        didDrag.current = true;
        if (isSplitDragging()) moveSplitDrag(e.clientX, e.clientY);
        else
          beginSplitDrag(
            {
              kind: "tab",
              tabId: d.id,
              label: dragged!.customLabel || dragged!.label,
            },
            e.clientX,
            e.clientY,
          );
        setDraggingOut(true);
        dragTargetRef.current = d.index;
        setDragTargetIndex(d.index);
        return;
      }
      if (isSplitDragging()) {
        endSplitDrag(false);
        setDraggingOut(false);
      }

      const x = Math.max(
        barRect.left + 2,
        Math.min(barRect.right - d.width - 6, e.clientX - d.offsetX),
      );
      const y = d.barTop;
      setDragPos({ x, y });

      const centerX = e.clientX - d.offsetX + d.width / 2;
      let newTarget = d.index;
      tabEls.current.forEach((el, id) => {
        if (id === d.id) return;
        const rect = el.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < d.index && centerX < mid)
          newTarget = Math.min(newTarget, idx);
        if (idx > d.index && centerX > mid)
          newTarget = Math.max(newTarget, idx);
      });

      if (tabs[0].type === "dashboard") newTarget = Math.max(1, newTarget);
      dragTargetRef.current = newTarget;
      setDragTargetIndex(newTarget);
    }

    function endDrag(commit: boolean) {
      if (!dragData.current) return;
      const { id, index } = dragData.current;
      const to = dragTargetRef.current ?? index;
      const droppedOut = isSplitDragging();
      if (droppedOut) endSplitDrag(commit);
      setDraggingOut(false);
      if (commit && !droppedOut && to !== index) {
        const next = [...tabs];
        if (next[0].id !== id) next.splice(to, 0, next.splice(index, 1)[0]);
        onReorderTabs(next);
      }
      dragData.current = null;
      dragTargetRef.current = null;
      setDragTabId(null);
      setDragTargetIndex(null);
      setDragPos(null);
      setTimeout(() => {
        didDrag.current = false;
      }, 0);
    }

    function onPointerUp() {
      endDrag(true);
    }

    // The browser can abort a pointer gesture without ever firing pointerup
    // (OS/browser cancels it, focus leaves the window, capture is lost some
    // other way). Without this, dragTabId stays stuck non-null forever and
    // every tab keeps rendering with a stale translateX from the aborted
    // drag, which can visually butt two tabs together with no seam between
    // them until something else forces a re-render.
    function onPointerCancel() {
      endDrag(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("lostpointercapture", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("lostpointercapture", onPointerCancel);
    };
  }, [dragTabId, tabs, onReorderTabs]);

  useEffect(() => {
    if (!contextTabId) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-context-menu]")) {
        setContextTabId(null);
        setContextPos(null);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [contextTabId]);

  useEffect(() => {
    if (renamingTabId) {
      setTimeout(() => renameInputRef.current?.focus(), 0);
    }
  }, [renamingTabId]);

  function commitRename() {
    if (!renamingTabId) return;
    const trimmed = renameValue.trim();
    if (trimmed) onRenameTab?.(renamingTabId, trimmed);
    setRenamingTabId(null);
  }

  const dragIdx = tabs.findIndex((t) => t.id === dragTabId);
  const target = dragTargetIndex ?? dragIdx;

  return (
    <div className="flex flex-col shrink-0 min-w-0">
      <div
        className={`min-w-0 rounded-[0.625rem] border-2 border-border bg-background ${open ? "flex h-[50px] items-stretch" : "hidden"}`}
      >
        <div
          ref={tabBarRef}
          className="@container relative flex h-full flex-1 min-w-0 items-end gap-1 overflow-x-auto overflow-y-hidden scrollbar-none border-r-2 border-border px-1"
        >
          {tabs.map((tab, index) => {
            const active = tab.id === activeTabId;
            const isDragging = dragTabId === tab.id;
            let translateX = 0;
            if (
              dragTabId &&
              !isDragging &&
              dragIdx !== -1 &&
              target !== null &&
              target !== dragIdx
            ) {
              const draggedWidth =
                tabEls.current.get(dragTabId)?.offsetWidth ?? 0;
              if (dragIdx < target && index > dragIdx && index <= target)
                translateX = -draggedWidth;
              else if (dragIdx > target && index < dragIdx && index >= target)
                translateX = draggedWidth;
            }

            return (
              <div
                key={tab.id}
                ref={(el) => {
                  if (el) tabEls.current.set(tab.id, el);
                  else tabEls.current.delete(tab.id);
                }}
                onClick={() =>
                  !dragTabId && !didDrag.current && onSetActiveTab(tab.id)
                }
                onMouseDown={(e) => {
                  if (e.button === 1 && tab.type !== "dashboard") {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
                onContextMenu={(e) => {
                  if (tab.type === "dashboard") return;
                  e.preventDefault();
                  setContextTabId(tab.id);
                  setContextPos({ x: e.clientX, y: e.clientY });
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0 || tab.type === "dashboard") return;
                  e.preventDefault();
                  const el = tabEls.current.get(tab.id);
                  if (!el || !tabBarRef.current) return;
                  const rect = el.getBoundingClientRect();
                  const barRect = tabBarRef.current.getBoundingClientRect();
                  dragData.current = {
                    id: tab.id,
                    index,
                    startX: e.clientX,
                    startY: e.clientY,
                    offsetX: e.clientX - rect.left,
                    width: rect.width,
                    barTop: barRect.top,
                    barHeight: barRect.height,
                    x: rect.left,
                    y: barRect.top,
                  };
                  setDragTabId(tab.id);
                  setDragTargetIndex(index);
                  setDragPos({ x: rect.left, y: barRect.top });
                  (e.currentTarget as HTMLElement).setPointerCapture(
                    e.pointerId,
                  );
                }}
                style={{
                  // Only set a transform while a drag is actually shifting
                  // tabs around. Leaving a permanent translateX(0) on every
                  // tab gives each one its own transform node, which opts it
                  // out of the pixel snapping a plain box gets when painted.
                  // The 1px seam then lands on a fractional device pixel at
                  // non-100% zoom and anti-aliases down to nothing, so two
                  // tabs look merged into one.
                  transform:
                    dragTabId && !isDragging
                      ? `translateX(${translateX}px)`
                      : undefined,
                  transition:
                    dragTabId && !isDragging ? "transform 200ms ease" : "none",
                  opacity: isDragging ? 0 : 1,
                  cursor:
                    tab.type === "dashboard"
                      ? "pointer"
                      : isDragging
                        ? "grabbing"
                        : "grab",
                  userSelect: "none",
                }}
                className={`group/tab relative -mb-0.5 flex h-[42px] items-center gap-1.5 rounded-t-[0.625rem] border-x-2 border-t-2 border-border px-3 text-sm transition-colors
                ${
                  tab.type === "dashboard"
                    ? "shrink-0"
                    : `${TAB_MAX_WIDTH} min-w-24 md:min-w-[150px] md:max-w-[450px] md:flex-[1_1_150px]`
                }
                ${active ? `${ACTIVE_TAB} text-foreground` : `${IDLE_TAB} text-muted-foreground hover:text-foreground`}`}
              >
                {showTabNumbers && tab.type !== "dashboard" && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                    {tabs.slice(0, index).filter((t) => t.type !== "dashboard")
                      .length + 1}
                  </span>
                )}
                {barIcon(tab.type)}
                {tab.type !== "dashboard" && renamingTabId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenamingTabId(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent border-b border-accent-brand outline-none text-sm w-28 min-w-0"
                    style={{ fontWeight: "inherit" }}
                  />
                ) : (
                  tab.type !== "dashboard" && (
                    <span className="min-w-0 flex-1 truncate" title={tab.label}>
                      {tab.label}
                    </span>
                  )
                )}
                {tab.type !== "dashboard" && renamingTabId !== tab.id && (
                  <div
                    // Every tab keeps the room, so tabs never change width.
                    className="ml-1 flex shrink-0 items-center gap-0.5"
                  >
                    {isConnectionTab(tab.type) && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRefreshTab(tab.id);
                        }}
                        type="button"
                        title={t("nav.refreshTab")}
                        aria-label={t("nav.refreshTab")}
                        className="flex items-center justify-center size-5 md:size-4 rounded-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                    )}
                    {/* Plugins add small buttons here, invoked with the tab's surface handle. */}
                    <ActionSlot
                      slotId="tab.inline"
                      when={{ tab, handle: tab.terminalRef?.current }}
                      context={() => [tab.terminalRef?.current, tab]}
                      renderItem={(contribution, invoke) => (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            invoke();
                          }}
                          type="button"
                          title={t(contribution.titleKey)}
                          aria-label={t(contribution.titleKey)}
                          className="flex items-center justify-center size-5 md:size-4 rounded-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          {contribution.icon && (
                            <contribution.icon className="size-3" />
                          )}
                        </button>
                      )}
                    />
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      title={t("nav.close")}
                      aria-label={t("nav.close")}
                      // A small mark with a bigger hover box, and a click area
                      // that reaches into the tab's padding.
                      className="relative flex items-center justify-center size-5 rounded-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted before:absolute before:-inset-y-2 before:-left-0.5 before:-right-3 before:content-['']"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {dragTabId &&
            dragPos &&
            !draggingOut &&
            (() => {
              const tab = tabs.find((t) => t.id === dragTabId)!;
              const active = tab.id === activeTabId;
              const dragTabWidth = tabEls.current.get(dragTabId)?.offsetWidth;
              const dragTabHeight = tabEls.current.get(dragTabId)?.offsetHeight;
              return (
                <div
                  style={{
                    position: "fixed",
                    left: dragPos.x,
                    top: dragPos.y,
                    width:
                      dragTabWidth !== undefined ? dragTabWidth + 2 : undefined,
                    height:
                      dragTabHeight !== undefined
                        ? dragTabHeight + 1
                        : undefined,
                    pointerEvents: "none",
                    zIndex: 9999,
                    opacity: 0.85,
                  }}
                  className={`flex items-center gap-1.5 shrink-0 rounded-t-[0.625rem] border-x-2 border-t-2 border-border px-3 text-sm shadow-lg ${active ? `${ACTIVE_TAB} text-foreground` : "bg-background text-muted-foreground"}`}
                >
                  {barIcon(tab.type)}
                  {tab.type !== "dashboard" && (
                    <span className="min-w-0 truncate">{tab.label}</span>
                  )}
                </div>
              );
            })()}
        </div>

        <div
          className={`flex shrink-0 items-center gap-2 px-2 ${open ? "" : "invisible"}`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={BAR_BUTTON}
                title={t("nav.allTabs")}
                aria-label={t("nav.allTabs")}
              >
                <ChevronDown className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-0">
              {tabs.map((tab, index) => (
                <div
                  key={tab.id}
                  onClick={() => onSetActiveTab(tab.id)}
                  className={`flex items-center justify-between px-2 py-2 text-xs cursor-default hover:bg-accent hover:text-accent-foreground ${tab.id === activeTabId ? "text-foreground" : "text-muted-foreground"}`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {showTabNumbers && tab.type !== "dashboard" && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                        {tabs
                          .slice(0, index)
                          .filter((t) => t.type !== "dashboard").length + 1}
                      </span>
                    )}
                    {tabIcon(tab.type)}
                    <span className="truncate">
                      {tab.type === "dashboard"
                        ? t("nav.dashboard")
                        : tab.label}
                    </span>
                  </div>
                  {tab.type !== "dashboard" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      title={t("nav.close")}
                      aria-label={t("nav.close")}
                      className="shrink-0 ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <TabBarActions>
            <ComponentSlot
              slotId={TAB_BAR_ACTIONS_SLOT}
              props={{ targetTab, className: TAB_BAR_BUTTON }}
            />
          </TabBarActions>
          <div
            className={`${BAR_BUTTON} overflow-hidden max-md:hidden [&>button]:!size-full [&>button]:!rounded-none [&>button]:!bg-transparent`}
          >
            <SplitLayoutMenu
              activeIsSplit={activeIsSplit}
              canAddPane={!activeSplitFull}
              onSplit={(edge) => onSplitAction({ kind: "splitActive", edge })}
              onPreset={(presetId) =>
                onSplitAction({ kind: "preset", presetId })
              }
            />
          </div>
          {onToggleTools && (
            <button
              type="button"
              onClick={onToggleTools}
              aria-pressed={toolsOpen}
              className={`${BAR_BUTTON} ${toolsOpen ? "bg-muted" : ""}`}
              title={t("original.tools")}
              aria-label={t("original.tools")}
            >
              <Hammer className="size-4" />
            </button>
          )}
          {onQuickConnect && (
            <button
              type="button"
              onClick={onQuickConnect}
              className={`${BAR_BUTTON} max-md:hidden`}
              title={t("original.quickConnect")}
              aria-label={t("original.quickConnect")}
            >
              <Zap className="size-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${BAR_BUTTON} ${rightDockOpen && !onToggleTools ? "bg-muted" : ""}`}
                title={t("nav.viewMenu")}
                aria-label={t("nav.viewMenu")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs min-w-48">
              {onToggleRightDock && !onToggleTools && (
                <DropdownMenuItem onClick={onToggleRightDock}>
                  <PanelRight className="size-3.5 mr-2" />
                  {t("nav.toggleRightDock")}
                </DropdownMenuItem>
              )}
              {!isElectron() && (
                <DropdownMenuItem onClick={onToggleAppFullscreen}>
                  {isAppFullscreen ? (
                    <Minimize2 className="size-3.5 mr-2" />
                  ) : (
                    <Maximize2 className="size-3.5 mr-2" />
                  )}
                  {isAppFullscreen
                    ? t("nav.exitFullscreen")
                    : t("nav.enterFullscreen")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setOpen((o) => !o)}>
                <ChevronUp className="size-3.5 mr-2" />
                {t("nav.hideTabBar")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`${BAR_BUTTON} max-md:hidden`}
            title={t("nav.hideTabBar")}
            aria-label={t("nav.hideTabBar")}
          >
            <ChevronUp className="size-4" />
          </button>
        </div>
      </div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={t("nav.showTabBar")}
          aria-label={t("nav.showTabBar")}
          className="mx-auto -mt-2 flex h-3 w-full shrink-0 items-center justify-center rounded-b-[0.5rem] border-2 border-t-0 border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="size-2.5" />
        </button>
      )}

      {/* Right-click context menu */}
      {contextTabId &&
        contextPos &&
        (() => {
          const ctxTab = tabs.find((t) => t.id === contextTabId);
          if (!ctxTab) return null;
          const joinable = canJoinSplit(ctxTab);
          const savedHost = hosts?.find((h) => h.id === ctxTab.host?.id);
          const editableHost =
            savedHost && canOpenHostEditor(savedHost) ? savedHost : undefined;
          const itemClass =
            "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none";
          const runSplit = (action: TabSplitAction) => {
            onSplitAction(action);
            setContextTabId(null);
          };
          const menuTop = Math.min(contextPos.y, window.innerHeight - 160);
          const menuLeft = Math.min(contextPos.x, window.innerWidth - 240);
          return (
            <div
              data-context-menu
              style={{
                position: "fixed",
                left: Math.max(4, menuLeft),
                top: Math.max(4, menuTop),
                maxHeight: window.innerHeight - Math.max(4, menuTop) - 8,
                zIndex: 10000,
              }}
              className="bg-popover border border-border rounded-[0.5rem] shadow-lg py-1 min-w-[200px] max-w-[260px] overflow-y-auto"
            >
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground truncate max-w-[200px]">
                {ctxTab.label}
              </div>
              <div className="h-px bg-border my-1" />
              {isConnectionTab(ctxTab.type) && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onRefreshTab(contextTabId);
                    setContextTabId(null);
                  }}
                >
                  <RefreshCw className="size-3" />
                  {t("nav.refreshTab")}
                </button>
              )}
              {onReconnectDisconnected && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onReconnectDisconnected();
                    setContextTabId(null);
                  }}
                >
                  <RefreshCw className="size-3" />
                  {t("nav.reconnectDisconnectedTerminals")}
                </button>
              )}
              {editableHost && onEditHost && (
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onEditHost(editableHost);
                    setContextTabId(null);
                  }}
                >
                  <SquarePen className="size-3" />
                  {t("hosts.editHostAction")}
                </button>
              )}
              {/* Plugins add entries here, invoked with the tab's surface handle. */}
              <ActionSlot
                slotId="tab.menu"
                when={{ tab: ctxTab, handle: ctxTab.terminalRef?.current }}
                context={() => [ctxTab.terminalRef?.current, ctxTab]}
                renderItem={(contribution, invoke) => (
                  <button
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      invoke();
                      setContextTabId(null);
                    }}
                  >
                    {contribution.icon && (
                      <contribution.icon className="size-3" />
                    )}
                    {t(contribution.titleKey)}
                  </button>
                )}
              />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setRenameValue(ctxTab.label);
                  setRenamingTabId(contextTabId);
                  setContextTabId(null);
                  setContextPos(null);
                }}
              >
                <Pencil className="size-3" />
                {t("nav.renameTab")}
              </button>
              {isSplitTab(ctxTab) && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button
                    className={itemClass}
                    onClick={() =>
                      runSplit({ kind: "unsplit", splitTabId: ctxTab.id })
                    }
                  >
                    <Ungroup className="size-3" />
                    {t("splitScreen.unsplit")}
                  </button>
                </>
              )}
              {joinable && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button
                    className={itemClass}
                    onClick={() =>
                      runSplit({
                        kind: "split",
                        tabId: ctxTab.id,
                        edge: "right",
                      })
                    }
                  >
                    <Columns2 className="size-3" />
                    {t("splitScreen.splitRight")}
                  </button>
                  <button
                    className={itemClass}
                    onClick={() =>
                      runSplit({
                        kind: "split",
                        tabId: ctxTab.id,
                        edge: "bottom",
                      })
                    }
                  >
                    <Rows2 className="size-3" />
                    {t("splitScreen.splitDown")}
                  </button>
                  {splits.map((split) => (
                    <div key={split.id} className="flex flex-col">
                      <div className="h-px bg-border my-1" />
                      <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                        {t("splitScreen.addToSplit", { split: split.label })}
                      </div>
                      {split.panes.map((pane) => (
                        <button
                          key={pane.id}
                          className={`${itemClass} pl-5`}
                          onClick={() =>
                            runSplit({
                              kind: "addToPane",
                              tabId: ctxTab.id,
                              splitTabId: split.id,
                              paneId: pane.id,
                            })
                          }
                        >
                          <span
                            className={`truncate ${pane.label ? "" : "text-muted-foreground"}`}
                          >
                            {pane.label
                              ? t("splitScreen.paneItem", {
                                  index: pane.index,
                                  label: pane.label,
                                })
                              : t("splitScreen.paneEmptyItem", {
                                  index: pane.index,
                                })}
                          </span>
                        </button>
                      ))}
                      {(["right", "bottom"] as const).map((edge) => (
                        <button
                          key={edge}
                          className={`${itemClass} pl-5`}
                          disabled={split.full}
                          title={
                            split.full
                              ? t("splitScreen.maxPanes", { count: MAX_PANES })
                              : undefined
                          }
                          onClick={() =>
                            runSplit({
                              kind: "addPane",
                              tabId: ctxTab.id,
                              splitTabId: split.id,
                              edge,
                            })
                          }
                        >
                          <Plus className="size-3" />
                          {edge === "right"
                            ? t("splitScreen.newPaneRight")
                            : t("splitScreen.newPaneBelow")}
                        </button>
                      ))}
                    </div>
                  ))}
                </>
              )}
              <div className="h-px bg-border my-1" />
              <button
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground text-destructive"
                onClick={() => {
                  onCloseTab(contextTabId);
                  setContextTabId(null);
                }}
              >
                <X className="size-3" />
                {t("nav.close")}
              </button>
            </div>
          );
        })()}
    </div>
  );
}
