import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  LogOut,
  PanelRight,
  Puzzle,
  Search,
  SlidersHorizontal,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { SplitMode, TabType, ToolsTab } from "@/types/ui-types";
import { getAlertFirings } from "@/api/alerts-api";
import { isElectron } from "@/lib/electron";
import { readRailPreference, setRailPreference } from "./rail-preferences";
import {
  RAIL_GROUP_ORDER,
  readHiddenIds,
  toggleHidden,
  visibleRailDestinations,
  visibleRailItems,
  type RailGroup,
  type RailItemDef,
} from "./rail-items";
import { useAiAvailability } from "@/hooks/use-ai-availability";
import { useAreaPreferences } from "@/contexts/UiPreferencesContext";
import { useNavItems } from "@/demo/nav-registry";

export type RailView =
  | "hosts"
  | "credentials"
  | "termix-id"
  | "quick-connect"
  | "serial"
  | ToolsTab
  | "connections"
  | "session-logs"
  | "user-profile"
  | "admin-settings"
  | "alerts"
  | "automations"
  | "ai"
  | "fleets"
  | "workspaces"
  | "collab";

export type HideableRailView =
  | Exclude<RailView, "user-profile" | "admin-settings">
  | "network_graph"
  | "homepage";

const btnBase =
  "relative flex items-center h-7 rounded shrink-0 transition-colors gap-2.5";
const btnStyle = { margin: "0 4px", padding: "0 8px" };

export function AppRail({
  railView,
  sidebarOpen,
  splitMode,
  username,
  isAdmin,
  onRailClick,
  onOpenTab,
  onOpenInRightDock,
  onOpenPlugins,
  onOpenSettings,
  onOpenPalette,
  onLogout,
}: {
  railView: RailView;
  sidebarOpen: boolean;
  splitMode: SplitMode;
  username: string;
  isAdmin: boolean;
  onRailClick: (view: RailView) => void;
  onOpenTab?: (type: TabType) => void;
  onOpenInRightDock?: (view: RailView) => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  onOpenPalette?: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(() => readRailPreference("pinAppRail"));
  const [expandOnHover, setExpandOnHover] = useState(() =>
    readRailPreference("expandAppRailOnHover"),
  );
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [menuTarget, setMenuTarget] = useState<{
    view: RailView;
    title: string;
    promotable?: boolean;
    rightDockable?: boolean;
  } | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<string[]>(readHiddenIds);
  const [managing, setManaging] = useState(false);

  // The preset still speaks in terms of what it hides, so a preset change is
  // applied by subtracting its hidden list from the pinned one. A user who has
  // pinned something the preset hides keeps it: presets seed, they do not
  // overrule.
  const railPrefs = useAreaPreferences("rail");
  const presetHidden = useMemo(
    () => new Set(railPrefs.hiddenTabs ?? []),
    [railPrefs.hiddenTabs],
  );

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (document.visibilityState === "hidden") return;
      getAlertFirings({ acknowledged: false, limit: 50 })
        .then((firings) => {
          if (!cancelled) setUnreadAlerts(firings.length);
        })
        .catch(() => {});
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(poll, 30000);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      poll();
      start();
    };

    poll();
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const pinHandler = () => setPinned(readRailPreference("pinAppRail"));
    const hoverHandler = () =>
      setExpandOnHover(readRailPreference("expandAppRailOnHover"));
    const hiddenHandler = () => setHiddenIds(readHiddenIds());
    window.addEventListener("pinAppRailChanged", pinHandler);
    window.addEventListener("expandAppRailOnHoverChanged", hoverHandler);
    window.addEventListener("hiddenRailChanged", hiddenHandler);
    return () => {
      window.removeEventListener("pinAppRailChanged", pinHandler);
      window.removeEventListener("expandAppRailOnHoverChanged", hoverHandler);
      window.removeEventListener("hiddenRailChanged", hiddenHandler);
    };
  }, []);

  useEffect(() => {
    if (!menuPos) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-rail-context-menu]")) {
        setMenuPos(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPos(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuPos]);

  const { userEnabled: aiEnabled } = useAiAvailability();

  // Termix ID publishes SSH public keys under a claimed public handle for
  // other servers to fetch -- meaningless for a standalone desktop install
  // with no synced multi-device account, so it stays hidden until a remote
  // server is actually connected.
  const [isRemoteSyncConnected] = useState(() => !isElectron());

  const navItems = useNavItems();

  // A destination owned by an uninstalled plugin is gone; one owned by a
  // stopped plugin stays and says so.
  const pluginOwned = useMemo(
    () => new Map(navItems.filter((n) => n.pluginId).map((n) => [n.id, n])),
    [navItems],
  );
  const pluginBacked = useMemo(
    () => new Set(["snippets", "session-logs", "history", "serial"]),
    [],
  );

  const unavailable = useMemo(() => {
    const out = new Set<string>();
    if (!isRemoteSyncConnected) out.add("termix-id");
    if (!aiEnabled) out.add("ai");
    for (const id of pluginBacked) {
      if (!pluginOwned.has(id)) out.add(id);
    }
    return out;
  }, [isRemoteSyncConnected, aiEnabled, pluginBacked, pluginOwned]);

  const railExpanded = pinned || (expandOnHover && hovered) || managing;

  // Grouped, and only what the user has pinned. A rule sits between groups
  // rather than between every pair of icons.
  const groups = useMemo(() => {
    const items = visibleRailDestinations(hiddenIds).filter(
      (item) => !unavailable.has(item.id) && !presetHidden.has(item.id),
    );
    return RAIL_GROUP_ORDER.map((group) => ({
      group,
      items: items.filter((item) => (item.group ?? "tools") === group),
    })).filter((band) => band.items.length > 0);
  }, [hiddenIds, unavailable, presetHidden]);

  // Only things the user chose to hide. A destination the preset hides, or one
  // whose plugin is gone, is not theirs to bring back here.
  const hiddenItems = useMemo(
    () =>
      visibleRailItems().filter(
        (item) =>
          hiddenIds.includes(item.id) &&
          !unavailable.has(item.id) &&
          !presetHidden.has(item.id),
      ),
    [hiddenIds, unavailable, presetHidden],
  );

  const togglePinned2 = () => {
    setRailPreference("pinAppRail", !pinned);
    setMenuPos(null);
  };

  const toggleExpandOnHover = () => {
    setRailPreference("expandAppRailOnHover", !expandOnHover);
    setMenuPos(null);
  };

  const renderItem = (item: RailItemDef) => {
    const Icon = item.icon;
    const isTab = item.kind === "tab";
    const active = !isTab && sidebarOpen && railView === item.id;
    return (
      <button
        key={item.id}
        onClick={(e) => {
          if (isTab) {
            onOpenTab?.(item.id as TabType);
            return;
          }
          if (item.promotable && (e.ctrlKey || e.metaKey)) {
            onOpenTab?.(item.id as TabType);
            return;
          }
          onRailClick(item.id as RailView);
        }}
        onAuxClick={(e) => {
          if (e.button !== 1 || !item.promotable) return;
          e.preventDefault();
          onOpenTab?.(item.id as TabType);
        }}
        onContextMenu={() =>
          setMenuTarget({
            view: item.id as RailView,
            title: t(item.labelKey),
            promotable: item.promotable,
            rightDockable: item.rightDockable,
          })
        }
        data-rail-promotable=""
        title={
          pluginOwned.get(item.id)?.running === false
            ? `${t(item.labelKey)} - ${t("nav.pluginStopped")}`
            : t(item.labelKey)
        }
        style={btnStyle}
        className={`${btnBase} ${
          active
            ? "text-accent-brand bg-accent-brand/10"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        } ${pluginOwned.get(item.id)?.running === false ? "opacity-50" : ""}`}
      >
        <span
          className="shrink-0 flex items-center justify-center"
          style={{ width: 16, height: 16 }}
        >
          <Icon size={16} />
        </span>
        <span
          className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
            railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
          }`}
        >
          {t(item.labelKey)}
        </span>
        {item.id === "split-screen" && splitMode !== "none" && (
          <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent-brand" />
        )}
      </button>
    );
  };

  return (
    <div
      className="hidden md:flex flex-col items-stretch bg-sidebar border-r border-border shrink-0 overflow-hidden pt-2 gap-1 transition-[width] duration-200 min-h-0"
      style={{ width: railExpanded ? 172 : 40 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        const MENU_W = 190;
        const MENU_H = 96;
        setMenuPos({
          x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
          y: Math.min(e.clientY, window.innerHeight - MENU_H - 8),
        });
        if (!(e.target as HTMLElement).closest("[data-rail-promotable]")) {
          setMenuTarget(null);
        }
      }}
    >
      {onOpenPalette && (
        <>
          <button
            onClick={onOpenPalette}
            title={`${t("commandPalette.searchPlaceholder")} (Ctrl+K)`}
            style={btnStyle}
            className={`${btnBase} text-muted-foreground hover:text-foreground hover:bg-muted/60`}
          >
            <span
              className="shrink-0 flex items-center justify-center"
              style={{ width: 16, height: 16 }}
            >
              <Search size={16} />
            </span>
            <span
              className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
              }`}
            >
              {t("commandPalette.search")}
            </span>
          </button>
          <div className="mx-auto h-px bg-border my-0.5 shrink-0 w-[calc(100%-16px)]" />
        </>
      )}

      <div className="flex flex-col flex-1 gap-1 overflow-y-auto scrollbar-none min-h-0">
        {groups.map((band, i) => (
          <div key={band.group} className="flex flex-col gap-1">
            {i > 0 && (
              <GroupDivider group={band.group} expanded={railExpanded} />
            )}
            {band.items.map(renderItem)}
          </div>
        ))}

        {/* Hidden destinations are listed here so they can be brought back.
            There is no "add": the rail shows what is installed, and a plugin's
            entry appears when the plugin does. */}
        {hiddenItems.length > 0 && (
          <>
            <div
              className="mx-auto h-px bg-border my-0.5 shrink-0 transition-[width] duration-200"
              style={{ width: railExpanded ? "calc(100% - 16px)" : 20 }}
            />
            <button
              onClick={() => setManaging((v) => !v)}
              title={t("nav.hiddenCount", { count: hiddenItems.length })}
              style={btnStyle}
              className={`${btnBase} ${
                managing
                  ? "text-accent-brand bg-accent-brand/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              <span
                className="shrink-0 flex items-center justify-center"
                style={{ width: 16, height: 16 }}
              >
                <EyeOff size={16} />
              </span>
              <span
                className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
                  railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"
                }`}
              >
                {t("nav.hiddenCount", { count: hiddenItems.length })}
              </span>
            </button>
            {managing &&
              railExpanded &&
              hiddenItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={`hidden-${item.id}`}
                    onClick={() => setHiddenIds(toggleHidden(item.id))}
                    title={t("nav.showInRail")}
                    style={btnStyle}
                    className={`${btnBase} text-muted-foreground/70 hover:text-foreground hover:bg-muted/60`}
                  >
                    <span
                      className="shrink-0 flex items-center justify-center"
                      style={{ width: 16, height: 16 }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="text-xs font-medium whitespace-nowrap overflow-hidden">
                      {t(item.labelKey)}
                    </span>
                    <Eye size={12} className="ml-auto shrink-0 opacity-60" />
                  </button>
                );
              })}
          </>
        )}
      </div>

      <div className="shrink-0 flex flex-col gap-1 border-t border-border pt-1 pb-1">
        <button
          onClick={onOpenPlugins}
          title={t("nav.plugins")}
          style={btnStyle}
          className={`${btnBase} text-muted-foreground hover:text-foreground hover:bg-muted/60`}
        >
          <span
            className="shrink-0 flex items-center justify-center"
            style={{ width: 16, height: 16 }}
          >
            <Puzzle size={16} />
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"}`}
          >
            {t("nav.plugins")}
          </span>
        </button>

        <button
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey) {
              onOpenTab?.("alerts" as TabType);
              return;
            }
            onRailClick("alerts");
          }}
          onAuxClick={(e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            onOpenTab?.("alerts" as TabType);
          }}
          onContextMenu={() =>
            setMenuTarget({
              view: "alerts",
              title: t("nav.alerts"),
              promotable: true,
              rightDockable: true,
            })
          }
          data-rail-promotable=""
          title={t("nav.alerts")}
          style={btnStyle}
          className={`${btnBase} ${
            sidebarOpen && railView === "alerts"
              ? "text-accent-brand bg-accent-brand/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <span
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: 16, height: 16 }}
          >
            <Bell size={16} />
            {unreadAlerts > 0 && (
              <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white leading-none">
                {unreadAlerts > 9 ? "9+" : unreadAlerts}
              </span>
            )}
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"}`}
          >
            {t("nav.alerts")}
          </span>
        </button>

        <div className="mx-2 my-1 border-t border-border" />
        <button
          onClick={onLogout}
          title={t("common.logout")}
          style={btnStyle}
          className={`${btnBase} text-muted-foreground hover:text-foreground hover:bg-muted/60`}
        >
          <span
            className="shrink-0 flex items-center justify-center"
            style={{ width: 16, height: 16 }}
          >
            <LogOut size={16} />
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${railExpanded ? "opacity-100 delay-75" : "opacity-0 w-0"}`}
          >
            {t("common.logout")}
          </span>
        </button>
      </div>

      {/* The account button is the way into settings. Profile and admin are
          sections in there now, not rail destinations. */}
      <div className="shrink-0 border-t border-border">
        <button
          onClick={onOpenSettings}
          title={t("settings.openSettings")}
          className={`${btnBase} w-full h-10 text-muted-foreground hover:text-foreground hover:bg-muted/60`}
          style={{ padding: "0 8px" }}
        >
          <div
            className="rounded-full bg-accent-brand/20 border border-accent-brand/30 flex items-center justify-center font-bold text-accent-brand shrink-0"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {username.charAt(0).toUpperCase() || "U"}
          </div>
          <div
            className={`flex flex-col items-start overflow-hidden transition-opacity duration-150 ${
              railExpanded ? "opacity-100 delay-75" : "opacity-0"
            }`}
          >
            <span className="text-xs font-semibold leading-tight whitespace-nowrap">
              {username || "User"}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
              {isAdmin ? t("nav.roleAdministrator") : t("nav.roleUser")}
            </span>
          </div>
        </button>
      </div>

      {menuPos && (
        <div
          data-rail-context-menu
          style={{ position: "fixed", left: menuPos.x, top: menuPos.y }}
          className="z-[10000] bg-popover border border-border shadow-lg py-1 min-w-[190px]"
        >
          {menuTarget && (
            <>
              {menuTarget.promotable && (
                <button
                  onClick={() => {
                    onOpenTab?.(menuTarget.view as TabType);
                    setMenuPos(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="shrink-0 w-3 flex items-center justify-center">
                    <SquareArrowOutUpRight className="size-3" />
                  </span>
                  {t("nav.openAsTab")}
                </button>
              )}
              {menuTarget.rightDockable && (
                <button
                  onClick={() => {
                    onOpenInRightDock?.(menuTarget.view);
                    setMenuPos(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="shrink-0 w-3 flex items-center justify-center">
                    <PanelRight className="size-3" />
                  </span>
                  {t("nav.openInRightDock")}
                </button>
              )}
              <button
                onClick={() => {
                  setHiddenIds(toggleHidden(menuTarget.view));
                  setMenuPos(null);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
              >
                <span className="shrink-0 w-3 flex items-center justify-center">
                  <EyeOff className="size-3" />
                </span>
                {t("nav.hideFromRail")}
              </button>
              <div className="h-px bg-border my-1" />
            </>
          )}
          <button
            onClick={togglePinned2}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
            role="menuitemcheckbox"
            aria-checked={pinned}
          >
            <span className="shrink-0 w-3 flex items-center justify-center">
              {pinned && <Check className="size-3" />}
            </span>
            {t("newUi.sidebar.userProfile.pinAppRail")}
          </button>
          <button
            onClick={toggleExpandOnHover}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
            role="menuitemcheckbox"
            aria-checked={expandOnHover}
          >
            <span className="shrink-0 w-3 flex items-center justify-center">
              {expandOnHover && <Check className="size-3" />}
            </span>
            {t("newUi.sidebar.userProfile.expandAppRailOnHover")}
          </button>
          <div className="h-px bg-border my-1" />
          <button
            onClick={() => {
              onOpenSettings();
              setMenuPos(null);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
          >
            <span className="shrink-0 w-3 flex items-center justify-center">
              <SlidersHorizontal className="size-3" />
            </span>
            {t("settings.openSettings")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The group name rides on the divider that separates the bands.
 *
 * It used to be its own row, rendered only when expanded, which pushed every
 * item below it down on hover so whatever you were reaching for moved out from
 * under the pointer. Reserving that row instead fixed the jump but left an
 * empty gap in the collapsed rail. The divider exists in both states, so
 * putting the label on it costs no height either way: collapsed it is a short
 * rule, expanded the rule shortens and the name fades in beside it.
 */
function GroupDivider({
  group,
  expanded,
}: {
  group: RailGroup;
  expanded: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="my-0.5 flex h-3 shrink-0 items-center gap-1.5 px-2.5">
      <span
        aria-hidden={!expanded}
        className={`shrink-0 overflow-hidden text-[10px] font-semibold uppercase leading-none tracking-widest whitespace-nowrap text-muted-foreground/60 transition-[opacity,max-width] duration-200 ${
          expanded ? "max-w-32 opacity-100 delay-75" : "max-w-0 opacity-0"
        }`}
      >
        {t(`nav.group.${group}`)}
      </span>
      <div className="h-px min-w-3 flex-1 bg-border" />
    </div>
  );
}
