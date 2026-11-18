import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ComponentSlot,
  type TabType,
  type ToolsTab,
  Skeleton,
  groupRailItems,
  moveRailItem,
  useRailItems,
  type RailGroup,
  type RailItemDef,
  useUiPreferencesContext,
  rem,
  PanelSearch,
  isElectron,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  useChooseTheme,
  useTheme,
  useThemeOptions,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Check,
  Eye,
  EyeOff,
  LayoutGrid,
  PinOff,
  Settings2,
  LogOut,
  Palette,
  PanelRight,
  Pin,
  Search,
  SlidersHorizontal,
  SquareArrowOutUpRight,
} from "lucide-react";
import { readRailPreference, setRailPreference } from "./rail-preferences";
import { useRailPins } from "../rail-pins";
import { useFeatureSettings } from "../settings/FeatureSettingsSections";
import { toggleHiddenRailTab, useHiddenRailTabs } from "./hidden-rail-tabs";
import { RailBadge, RailStatus, type RailStatusTone } from "./RailBadge";

/** Core rail views; plugins add their own ids at runtime. */
export type CoreRailView =
  "hosts" | "credentials" | "quick-connect" | ToolsTab | "connections";

export type RailView = CoreRailView | (string & {});

const btnBase =
  "relative flex items-center h-7 shrink-0 transition-colors gap-2.5 focus-visible:ring-1 focus-visible:ring-ring";
const btnStyle = { margin: `0 ${rem(4)}`, padding: `0 ${rem(8)}` };
const idle = "text-muted-foreground hover:text-foreground hover:bg-muted/60";
const activeClass = "text-accent-brand bg-accent-brand/10";

// useStatus is on rail items from Termix 26.10.6; typed here so older SDK
// types still build.
const statusHook = (item: object) =>
  (item as { useStatus?: () => RailStatusTone | null | undefined }).useStatus;

function RailLabel({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`text-xs font-medium whitespace-nowrap overflow-hidden transition-[opacity,width] duration-150 ${
        expanded ? "opacity-100 delay-75" : "opacity-0 w-0"
      }`}
    >
      {children}
    </span>
  );
}

function RailIcon({
  children,
  useBadge,
  useStatus,
}: {
  children: React.ReactNode;
  useBadge?: () => number | null | undefined;
  useStatus?: () => RailStatusTone | null | undefined;
}) {
  return (
    <span
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: rem(16), height: rem(16) }}
    >
      {children}
      {useBadge && (
        <RailBadge useBadge={useBadge} className="-top-1.5 -right-2" />
      )}
      {useStatus && (
        <RailStatus useStatus={useStatus} className="-bottom-0.5 -right-0.5" />
      )}
    </span>
  );
}

/** Picks a theme from the rail, without opening Settings. */
export function ThemeMenu({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const chooseTheme = useChooseTheme();
  const options = useThemeOptions();
  if (options.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          style={btnStyle}
          title={t("nav.theme")}
          aria-label={t("nav.theme")}
          className={`${btnBase} ${idle}`}
        >
          <RailIcon>
            <Palette size={16} />
          </RailIcon>
          <RailLabel expanded={expanded}>{t("nav.theme")}</RailLabel>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-48">
        <DropdownMenuLabel>{t("nav.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(id) => chooseTheme(id as typeof theme)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Rule({ expanded }: { expanded: boolean }) {
  return (
    <div
      className="mx-auto h-px bg-border my-0.5 shrink-0 transition-[width] duration-200"
      style={{ width: expanded ? `calc(100% - ${rem(16)})` : rem(20) }}
    />
  );
}

/**
 * The band name rides on the divider between bands, so expanding the rail
 * never pushes items down from under the pointer.
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

interface MenuTarget {
  id: string;
  title: string;
  promotable?: boolean;
  rightDockable?: boolean;
  hideable: boolean;
}

export function AppRail({
  railView,
  sidebarOpen,
  username,
  isAdmin,
  pluginsSettled = true,
  onRailClick,
  onOpenTab,
  onOpenInRightDock,
  onOpenSettings,
  onOpenNavigationSettings,
  onOpenAppSettings,
  onOpenPalette,
  onLogout,
}: {
  railView: RailView;
  sidebarOpen: boolean;
  username: string;
  isAdmin: boolean;
  /** False while plugins are still registering their rail items. */
  pluginsSettled?: boolean;
  onRailClick: (view: RailView) => void;
  onOpenTab?: (type: TabType) => void;
  onOpenInRightDock?: (view: RailView) => void;
  onOpenSettings: () => void;
  /** The rail menu's own entry, which jumps to the navigation settings. */
  onOpenNavigationSettings: () => void;
  /** Opens a plugin's page in Settings. */
  onOpenAppSettings?: (pluginId: string) => void;
  onOpenPalette?: () => void;
  onLogout: (options?: { manual?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  // Native events, since React counts the All apps portal as inside the rail.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    };
  }, []);
  const [pinned, setPinned] = useState(() => readRailPreference("pinAppRail"));
  const [expandOnHover, setExpandOnHover] = useState(() =>
    readRailPreference("expandAppRailOnHover"),
  );
  const [showPinButton, setShowPinButton] = useState(() =>
    readRailPreference("showPinAppRailButton"),
  );
  const [hoverPushes, setHoverPushes] = useState(() =>
    readRailPreference("appRailHoverPushesContent"),
  );
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [managing, setManaging] = useState(false);
  const hiddenTabs = useHiddenRailTabs();
  const railPins = useRailPins();
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsQuery, setAppsQuery] = useState("");
  const closeApps = () => setAppsOpen(false);
  useEffect(() => {
    if (!appsOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-all-apps]") && !el.closest("[data-all-apps-btn]"))
        closeApps();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeApps();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [appsOpen]);

  useEffect(() => {
    const pinHandler = () => setPinned(readRailPreference("pinAppRail"));
    const hoverHandler = () =>
      setExpandOnHover(readRailPreference("expandAppRailOnHover"));
    const showPinButtonHandler = () =>
      setShowPinButton(readRailPreference("showPinAppRailButton"));
    const pushHandler = () =>
      setHoverPushes(readRailPreference("appRailHoverPushesContent"));
    window.addEventListener("pinAppRailChanged", pinHandler);
    window.addEventListener("expandAppRailOnHoverChanged", hoverHandler);
    window.addEventListener("appRailHoverPushesContentChanged", pushHandler);
    window.addEventListener(
      "showPinAppRailButtonChanged",
      showPinButtonHandler,
    );
    return () => {
      window.removeEventListener("pinAppRailChanged", pinHandler);
      window.removeEventListener("expandAppRailOnHoverChanged", hoverHandler);
      window.removeEventListener(
        "appRailHoverPushesContentChanged",
        pushHandler,
      );
      window.removeEventListener(
        "showPinAppRailButtonChanged",
        showPinButtonHandler,
      );
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

  // Plugins add and remove rail items at runtime, and permissions hide some.
  const railItems = useRailItems();
  const uiPrefs = useUiPreferencesContext();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null>(null);

  const railExpanded =
    pinned || (expandOnHover && (hovered || appsOpen)) || managing;
  const mainItems = railItems.filter((item) => item.placement !== "footer");
  const isPinned = railPins.isPinned;
  const menuItem = menuTarget
    ? mainItems.find((entry) => entry.id === menuTarget.id)
    : undefined;
  const menuPluginId = menuItem?.pluginId;
  const menuItemPinned = !!menuItem && isPinned(menuItem);
  const userFeatures = useFeatureSettings("user");
  const adminFeatures = useFeatureSettings("admin");
  const settingsPluginIds = new Set(
    [...userFeatures, ...(isAdmin ? adminFeatures : [])].map((p) => p.id),
  );
  const togglePin = (id: string) => {
    const item = mainItems.find((entry) => entry.id === id);
    if (item) railPins.toggle(item, mainItems);
  };
  const bands = groupRailItems(
    mainItems.filter((item) => !hiddenTabs.has(item.id) && isPinned(item)),
  );
  // Everything not on the rail, so an app is never out of reach.
  const overflowItems = mainItems.filter(
    (item) => item.pluginId && !hiddenTabs.has(item.id) && !isPinned(item),
  );
  const openItem = (item: RailItemDef, newTab = false) => {
    if (item.kind === "tab" || (item.promotable && newTab)) {
      onOpenTab?.(item.id as TabType);
      return;
    }
    onRailClick(item.id as RailView);
  };
  const hiddenItems = mainItems.filter((item) => hiddenTabs.has(item.id));
  const footerItems = railItems.filter(
    (item) => item.placement === "footer" && !hiddenTabs.has(item.id),
  );

  useEffect(() => {
    if (hiddenItems.length === 0) setManaging(false);
  }, [hiddenItems.length]);

  const togglePinned = () => {
    setRailPreference("pinAppRail", !pinned);
    setMenuPos(null);
  };

  const toggleExpandOnHover = () => {
    setRailPreference("expandAppRailOnHover", !expandOnHover);
    setMenuPos(null);
  };

  const sameBand = (a: string, b: string) =>
    (mainItems.find((item) => item.id === a)?.group ?? "tools") ===
    (mainItems.find((item) => item.id === b)?.group ?? "tools");

  const renderItem = (item: RailItemDef) => {
    const Icon = item.icon;
    const title = t(item.labelKey);
    const isTab = item.kind === "tab";
    const active = !isTab && sidebarOpen && railView === item.id;
    const reorderable = item.placement !== "footer" && !!uiPrefs;
    const dropHere =
      dragId !== null && dropBefore === item.id && dragId !== item.id;
    return (
      <button
        key={item.id}
        type="button"
        draggable={reorderable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setDragId(item.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropBefore(null);
        }}
        onDragOver={(e) => {
          if (!dragId || dragId === item.id || !sameBand(dragId, item.id))
            return;
          e.preventDefault();
          setDropBefore(item.id);
        }}
        onDrop={(e) => {
          if (!dragId || !sameBand(dragId, item.id)) return;
          e.preventDefault();
          uiPrefs?.setOverride(
            "rail",
            "order",
            moveRailItem(mainItems, dragId, item.id),
          );
          setDragId(null);
          setDropBefore(null);
        }}
        onClick={(e) => {
          if (isTab || (item.promotable && (e.ctrlKey || e.metaKey))) {
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
            id: item.id,
            title,
            promotable: item.promotable,
            rightDockable: item.rightDockable,
            hideable: !item.alwaysVisible && item.hideable !== false,
          })
        }
        data-rail-item=""
        aria-current={active ? "page" : undefined}
        title={item.promotable ? `${title}\n${t("nav.openAsTabHint")}` : title}
        style={btnStyle}
        className={`${btnBase} ${active ? activeClass : idle} ${dragId === item.id ? "opacity-40" : ""} ${dropHere ? "relative before:absolute before:inset-x-1 before:-top-0.5 before:h-0.5 before:bg-accent-brand" : ""}`}
      >
        <RailIcon useBadge={item.useBadge} useStatus={statusHook(item)}>
          <Icon size={16} />
        </RailIcon>
        <RailLabel expanded={railExpanded}>{title}</RailLabel>
      </button>
    );
  };

  // Expanding on hover draws over the content instead of pushing it, so open
  // sessions like remote desktop are not resized each time, unless the user
  // asked for the old behavior.
  const takesSpace = hoverPushes ? railExpanded : pinned || managing;

  return (
    <div
      // The desktop app keeps the rail however narrow its window gets.
      className={`${isElectron() ? "flex" : "hidden md:flex"} relative shrink-0 transition-[width] duration-200 min-h-0`}
      style={{ width: rem(takesSpace ? 172 : 40) }}
    >
      <div
        className="absolute inset-y-0 left-0 z-[60] flex flex-col items-stretch bg-sidebar border-r border-border overflow-hidden pt-2 gap-1 transition-[width] duration-200 min-h-0"
        style={{ width: rem(railExpanded ? 172 : 40) }}
        ref={railRef}
        onContextMenu={(e) => {
          e.preventDefault();
          // Keep the menu on screen when right-clicking near the viewport edges
          const MENU_W = 200;
          const MENU_H = 180;
          setMenuPos({
            x: Math.min(e.clientX, window.innerWidth - MENU_W - 8),
            y: Math.min(e.clientY, window.innerHeight - MENU_H - 8),
          });
          if (!(e.target as HTMLElement).closest("[data-rail-item]")) {
            setMenuTarget(null);
          }
        }}
      >
        {onOpenPalette && (
          <>
            <button
              type="button"
              onClick={onOpenPalette}
              title={t("nav.searchEverything")}
              aria-label={t("nav.searchEverything")}
              style={btnStyle}
              className={`${btnBase} ${idle}`}
            >
              <RailIcon>
                <Search size={16} />
              </RailIcon>
              <RailLabel expanded={railExpanded}>{t("nav.search")}</RailLabel>
            </button>
            <Rule expanded={railExpanded} />
          </>
        )}

        <div className="flex flex-col flex-1 gap-1 overflow-y-auto scrollbar-none min-h-0">
          {!pluginsSettled
            ? Array.from({ length: mainItems.length || 8 }, (_, i) => (
                <div
                  key={`rail-skeleton-${i}`}
                  style={btnStyle}
                  className="flex items-center h-7 shrink-0"
                >
                  <Skeleton className="size-4 shrink-0" />
                </div>
              ))
            : bands.map((band, i) => (
                <div key={band.group} className="flex flex-col gap-1">
                  {i > 0 && (
                    <GroupDivider group={band.group} expanded={railExpanded} />
                  )}
                  {band.items.map(renderItem)}
                </div>
              ))}

          {pluginsSettled && overflowItems.length > 0 && (
            <>
              <Rule expanded={railExpanded} />
              <button
                type="button"
                data-all-apps-btn=""
                onClick={() => setAppsOpen((v) => !v)}
                aria-expanded={appsOpen}
                title={t("nav.allApps")}
                style={btnStyle}
                className={`${btnBase} ${appsOpen ? activeClass : idle}`}
              >
                <RailIcon>
                  <LayoutGrid size={16} />
                </RailIcon>
                <RailLabel expanded={railExpanded}>
                  {t("nav.allApps")}
                </RailLabel>
              </button>
            </>
          )}

          {pluginsSettled && hiddenItems.length > 0 && (
            <>
              <Rule expanded={railExpanded} />
              <button
                type="button"
                onClick={() => setManaging((v) => !v)}
                aria-expanded={managing}
                title={t("nav.hiddenCount", { count: hiddenItems.length })}
                style={btnStyle}
                className={`${btnBase} ${managing ? activeClass : idle}`}
              >
                <RailIcon>
                  <EyeOff size={16} />
                </RailIcon>
                <RailLabel expanded={railExpanded}>
                  {t("nav.hiddenCount", { count: hiddenItems.length })}
                </RailLabel>
              </button>
              {managing &&
                hiddenItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`hidden-${item.id}`}
                      type="button"
                      onClick={() => void toggleHiddenRailTab(item.id)}
                      title={t("nav.showInRail")}
                      style={btnStyle}
                      className={`${btnBase} text-muted-foreground/70 hover:text-foreground hover:bg-muted/60`}
                    >
                      <RailIcon>
                        <Icon size={16} />
                      </RailIcon>
                      <span className="min-w-0 truncate text-xs font-medium whitespace-nowrap">
                        {t(item.labelKey)}
                      </span>
                      <Eye className="ml-auto size-3 shrink-0 opacity-60" />
                    </button>
                  );
                })}
            </>
          )}
        </div>

        <div className="shrink-0 flex flex-col gap-1 border-t border-border pt-1 pb-1">
          {showPinButton && (
            <>
              <button
                type="button"
                onClick={() => setRailPreference("pinAppRail", !pinned)}
                style={btnStyle}
                title={
                  pinned ? t("nav.collapseSideMenu") : t("nav.keepSideMenuOpen")
                }
                className={`${btnBase} ${pinned ? activeClass : idle}`}
              >
                <RailIcon>
                  <Pin size={16} />
                </RailIcon>
                <RailLabel expanded={railExpanded}>
                  {pinned
                    ? t("nav.collapseSideMenu")
                    : t("nav.keepSideMenuOpen")}
                </RailLabel>
              </button>
              <Rule expanded={railExpanded} />
            </>
          )}
          {footerItems.map(renderItem)}
          {footerItems.length > 0 && !isElectron() && (
            <Rule expanded={railExpanded} />
          )}
          <ThemeMenu expanded={railExpanded} />
          {/* The desktop signs in to its own local profile by itself. */}
          {!isElectron() && (
            <button
              type="button"
              onClick={() => onLogout({ manual: true })}
              style={btnStyle}
              title={t("common.logout")}
              aria-label={t("common.logout")}
              className={`${btnBase} text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
            >
              <RailIcon>
                <LogOut size={16} />
              </RailIcon>
              <RailLabel expanded={railExpanded}>
                {t("common.logout")}
              </RailLabel>
            </button>
          )}
        </div>

        <div className="shrink-0 border-t border-border flex items-center overflow-hidden">
          <button
            type="button"
            onClick={onOpenSettings}
            title={t("nav.openSettings")}
            aria-label={t("nav.openSettings")}
            className="flex items-center gap-2.5 flex-1 min-w-0 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
            style={{ padding: `0 ${rem(8)}` }}
          >
            <div
              className="rounded-full bg-accent-brand/20 border border-accent-brand/30 flex items-center justify-center font-bold text-accent-brand shrink-0"
              style={{ width: rem(24), height: rem(24), fontSize: rem(11) }}
            >
              {username.charAt(0).toUpperCase() || "U"}
            </div>
            <div
              className={`flex flex-col items-start overflow-hidden transition-opacity duration-150 ${
                railExpanded ? "opacity-100 delay-75" : "opacity-0"
              }`}
            >
              <span className="text-xs font-semibold leading-tight whitespace-nowrap">
                {username || t("nav.roleUser")}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight whitespace-nowrap">
                {isAdmin ? t("nav.roleAdministrator") : t("nav.roleUser")}
              </span>
            </div>
          </button>
          {/* Sits in the profile row, so nothing above it moves when the rail opens. */}
          <div
            className={`shrink-0 pr-1 transition-opacity duration-150 ${
              railExpanded ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <ComponentSlot slotId="shell.accountSwitcher" />
          </div>
        </div>

        {appsOpen &&
          createPortal(
            <div
              data-all-apps=""
              role="dialog"
              aria-label={t("nav.allApps")}
              className="fixed inset-y-0 z-[70] flex flex-col border-r border-border bg-sidebar shadow-xl transition-[left] duration-200"
              style={{ left: rem(railExpanded ? 172 : 40), width: rem(300) }}
            >
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
                <LayoutGrid className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">
                  {t("nav.allApps")}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                  {overflowItems.length}
                </span>
              </div>
              <div className="shrink-0 border-b border-border px-2 py-1.5">
                <PanelSearch
                  value={appsQuery}
                  onChange={setAppsQuery}
                  placeholder={t("nav.findApp")}
                  autoFocus
                  fill
                />
              </div>
              <div className="thin-scrollbar flex-1 overflow-y-auto p-1">
                {overflowItems
                  .filter((item) =>
                    t(item.labelKey)
                      .toLowerCase()
                      .includes(appsQuery.trim().toLowerCase()),
                  )
                  .sort((a, b) => t(a.labelKey).localeCompare(t(b.labelKey)))
                  .map((item) => {
                    const Icon = item.icon;
                    const title = t(item.labelKey);
                    return (
                      <div
                        key={`app-${item.id}`}
                        role="button"
                        tabIndex={0}
                        data-rail-item=""
                        className="group flex h-8 cursor-pointer items-center gap-2.5 px-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={(e) => {
                          openItem(item, e.ctrlKey || e.metaKey);
                          closeApps();
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          openItem(item);
                          closeApps();
                        }}
                        onContextMenu={() =>
                          setMenuTarget({
                            id: item.id,
                            title,
                            promotable: item.promotable,
                            rightDockable: item.rightDockable,
                            hideable:
                              !item.alwaysVisible && item.hideable !== false,
                          })
                        }
                      >
                        <RailIcon
                          useBadge={item.useBadge}
                          useStatus={statusHook(item)}
                        >
                          <Icon size={16} />
                        </RailIcon>
                        <span className="truncate text-xs">{title}</span>
                        {!railPins.locked && (
                          <button
                            type="button"
                            title={t("nav.pinToRail")}
                            aria-label={t("nav.pinToRail")}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(item.id);
                            }}
                            className="ml-auto p-1 opacity-0 hover:text-accent-brand focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <Pin className="size-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
              <div className="shrink-0 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
                {railPins.locked
                  ? t("nav.allAppsLockedHint")
                  : t("nav.allAppsHint")}
              </div>
            </div>,
            document.body,
          )}

        {menuPos && (
          <div
            data-rail-context-menu
            role="menu"
            style={{ position: "fixed", left: menuPos.x, top: menuPos.y }}
            className="z-[10000] bg-popover border border-border shadow-lg py-1 min-w-[200px]"
          >
            {menuTarget && (
              <>
                {menuTarget.promotable && (
                  <MenuItem
                    icon={<SquareArrowOutUpRight className="size-3" />}
                    onClick={() => {
                      onOpenTab?.(menuTarget.id as TabType);
                      setMenuPos(null);
                    }}
                  >
                    {t("nav.openAsTab")}
                  </MenuItem>
                )}
                {menuTarget.rightDockable && (
                  <MenuItem
                    icon={<PanelRight className="size-3" />}
                    onClick={() => {
                      onOpenInRightDock?.(menuTarget.id);
                      setMenuPos(null);
                    }}
                  >
                    {t("nav.openInRightDock")}
                  </MenuItem>
                )}
                {menuPluginId &&
                  onOpenAppSettings &&
                  settingsPluginIds.has(menuPluginId) && (
                    <MenuItem
                      icon={<Settings2 className="size-3" />}
                      onClick={() => {
                        onOpenAppSettings?.(menuPluginId);
                        setMenuPos(null);
                      }}
                    >
                      {t("nav.appSettings")}
                    </MenuItem>
                  )}
                {menuPluginId && railPins.appsMenu && !railPins.locked && (
                  <MenuItem
                    icon={
                      menuItemPinned ? (
                        <PinOff className="size-3" />
                      ) : (
                        <Pin className="size-3" />
                      )
                    }
                    onClick={() => {
                      togglePin(menuTarget.id);
                      setMenuPos(null);
                    }}
                  >
                    {menuItemPinned
                      ? t("nav.unpinFromRail")
                      : t("nav.pinToRail")}
                  </MenuItem>
                )}
                {menuTarget.hideable &&
                  !(menuPluginId && railPins.appsMenu) && (
                    <MenuItem
                      icon={<EyeOff className="size-3" />}
                      onClick={() => {
                        void toggleHiddenRailTab(menuTarget.id);
                        setMenuPos(null);
                      }}
                    >
                      {t("nav.hideFromRail")}
                    </MenuItem>
                  )}
                <div className="h-px bg-border my-1" />
              </>
            )}
            <MenuItem
              icon={pinned ? <Check className="size-3" /> : null}
              onClick={togglePinned}
              checked={pinned}
            >
              {t("newUi.sidebar.userProfile.pinAppRail")}
            </MenuItem>
            <MenuItem
              icon={expandOnHover ? <Check className="size-3" /> : null}
              onClick={toggleExpandOnHover}
              checked={expandOnHover}
            >
              {t("newUi.sidebar.userProfile.expandAppRailOnHover")}
            </MenuItem>
            <div className="h-px bg-border my-1" />
            <MenuItem
              icon={<SlidersHorizontal className="size-3" />}
              onClick={() => {
                onOpenNavigationSettings();
                setMenuPos(null);
              }}
            >
              {t("nav.openSettings")}
            </MenuItem>
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  onClick,
  checked,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  checked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
    >
      <span className="shrink-0 w-3 flex items-center justify-center">
        {icon}
      </span>
      {children}
    </button>
  );
}
