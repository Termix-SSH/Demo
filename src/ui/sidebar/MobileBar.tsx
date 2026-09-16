import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  LogOut,
  MoreHorizontal,
  Puzzle,
  Search,
  Settings,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import type { TabType } from "@/types/ui-types";
import {
  RAIL_GROUP_ORDER,
  readHiddenIds,
  visibleRailDestinations,
} from "./rail-items";
import type { RailView } from "./AppRail";

/**
 * The rail replacement for phones.
 *
 * The app rail is a hover-expanding strip of 28px icon buttons, which does not
 * work without a pointer and is hidden below md. Everything it reaches lives
 * here instead: the four most used destinations sit on the bar, the rest are
 * in a sheet behind More, and the account, plugins, alerts and logout buttons
 * from the rail's footer are in the same sheet.
 */

const PRIMARY_IDS = ["hosts", "credentials", "quick-connect", "ssh-tools"];

export function MobileBar({
  railView,
  sidebarOpen,
  unreadAlerts,
  username,
  onRailClick,
  onOpenTab,
  onOpenPlugins,
  onOpenSettings,
  onOpenPalette,
  onLogout,
}: {
  railView: RailView;
  sidebarOpen: boolean;
  unreadAlerts: number;
  username: string;
  onRailClick: (view: RailView) => void;
  onOpenTab: (type: TabType) => void;
  onOpenPlugins: () => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const destinations = useMemo(
    () => visibleRailDestinations(readHiddenIds()),
    [],
  );

  const primary = useMemo(
    () =>
      PRIMARY_IDS.map((id) => destinations.find((d) => d.id === id)).filter(
        (d) => !!d,
      ),
    [destinations],
  );

  const grouped = useMemo(
    () =>
      RAIL_GROUP_ORDER.map((group) => ({
        group,
        items: destinations.filter((d) => (d.group ?? "tools") === group),
      })).filter((band) => band.items.length > 0),
    [destinations],
  );

  const open = (view: RailView) => {
    setMoreOpen(false);
    onRailClick(view);
  };

  return (
    <>
      <nav
        className="flex shrink-0 items-stretch border-t border-border bg-sidebar md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Tapping the open one closes it again, which is what handleRailClick
            already does on the rail. */}
        {primary.map((item) => (
          <BarButton
            key={item.id}
            icon={item.icon}
            label={t(item.labelKey)}
            active={sidebarOpen && railView === item.id}
            onClick={() => open(item.id as RailView)}
          />
        ))}

        <BarButton
          icon={MoreHorizontal}
          label={t("nav.more")}
          active={moreOpen}
          badge={unreadAlerts}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end md:hidden">
          <button
            aria-label={t("nav.close")}
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreOpen(false)}
          />

          <div
            className="relative flex max-h-[80dvh] flex-col border-t border-border bg-sidebar"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex h-12.5 shrink-0 items-center border-b border-border px-3">
              <span className="flex-1 text-base font-bold tracking-tight text-foreground">
                {t("nav.more")}
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label={t("nav.close")}
                className="flex size-9 items-center justify-center text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              <SheetRow
                icon={Search}
                label={t("commandPalette.search")}
                onClick={() => {
                  setMoreOpen(false);
                  onOpenPalette();
                }}
              />

              {grouped.map((band) => (
                <div key={band.group} className="mt-1 flex flex-col">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {t(`nav.group.${band.group}`)}
                  </div>
                  {band.items.map((item) => (
                    <SheetRow
                      key={item.id}
                      icon={item.icon}
                      label={t(item.labelKey)}
                      active={sidebarOpen && railView === item.id}
                      onOpenAsTab={
                        item.promotable
                          ? () => {
                              setMoreOpen(false);
                              onOpenTab(item.id as TabType);
                            }
                          : undefined
                      }
                      onClick={() =>
                        item.kind === "tab"
                          ? (setMoreOpen(false), onOpenTab(item.id as TabType))
                          : open(item.id as RailView)
                      }
                    />
                  ))}
                </div>
              ))}

              <div className="mt-2 border-t border-border pt-2">
                <SheetRow
                  icon={Bell}
                  label={t("nav.alerts")}
                  badge={unreadAlerts}
                  active={sidebarOpen && railView === "alerts"}
                  onClick={() => open("alerts")}
                />
                <SheetRow
                  icon={Puzzle}
                  label={t("nav.plugins")}
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenPlugins();
                  }}
                />
                <SheetRow
                  icon={Settings}
                  label={t("nav.settings")}
                  hint={username}
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenSettings();
                  }}
                />
                <SheetRow
                  icon={LogOut}
                  label={t("common.logout")}
                  onClick={() => {
                    setMoreOpen(false);
                    onLogout();
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BarButton({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!!active}
      className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
        active
          ? "text-accent-brand bg-accent-brand/10"
          : "text-muted-foreground active:bg-muted/60"
      }`}
    >
      <span className="relative flex items-center justify-center">
        <Icon className="size-5" />
        {!!badge && badge > 0 && (
          <span className="absolute -right-2 -top-1 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold leading-none text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate px-1 text-[10px] font-medium leading-none">
        {label}
      </span>
    </button>
  );
}

function SheetRow({
  icon: Icon,
  label,
  hint,
  badge,
  active,
  onClick,
  onOpenAsTab,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
  badge?: number;
  active?: boolean;
  onClick: () => void;
  onOpenAsTab?: () => void;
}) {
  return (
    <div className="flex items-stretch">
      <button
        onClick={onClick}
        className={`flex min-h-11 flex-1 items-center gap-3 border-l-2 px-3 text-left transition-colors ${
          active
            ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
            : "border-transparent text-foreground active:bg-muted"
        }`}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        {!!badge && badge > 0 && (
          <span className="shrink-0 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {hint && (
          <span className="shrink-0 truncate text-[11px] text-muted-foreground">
            {hint}
          </span>
        )}
      </button>
      {onOpenAsTab && (
        <button
          onClick={onOpenAsTab}
          aria-label={label}
          title={label}
          className="flex w-11 shrink-0 items-center justify-center text-muted-foreground active:bg-muted"
        >
          <SquareArrowOutUpRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
