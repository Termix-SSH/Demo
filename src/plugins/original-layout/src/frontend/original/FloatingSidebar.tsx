import type React from "react";
import { ArrowLeft, LayoutGrid, Menu, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  groupRailItems,
  isElectron,
  rem,
  useBranding,
  useRailItems,
  type EditingWidth,
  type RailItemDef,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { dockWidth } from "../shell/DockPanel";
import { useHiddenRailTabs } from "../sidebar/hidden-rail-tabs";
import { floatingPanel, outlineButton } from "./styles";
import { UserMenu } from "./UserMenu";

/** Everything the old rail offered, minus the host list the sidebar already shows. */
export function useSidebarApps(): RailItemDef[] {
  const items = useRailItems();
  const hidden = useHiddenRailTabs();
  return items.filter(
    (item) =>
      item.id !== "hosts" &&
      item.placement !== "footer" &&
      !hidden.has(item.id) &&
      (!item.electronOnly || isElectron()),
  );
}

function AppsMenu({ onOpenApp }: { onOpenApp: (item: RailItemDef) => void }) {
  const { t } = useTranslation();
  const apps = useSidebarApps();
  if (apps.length === 0) return null;
  const bands = groupRailItems(apps);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("original.apps")}
          aria-label={t("original.apps")}
          className={`${outlineButton} size-7`}
        >
          <LayoutGrid className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {bands.map((band, index) => (
          <div key={band.group}>
            {index > 0 && <DropdownMenuSeparator />}
            {band.items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => onOpenApp(item)}
                >
                  <Icon className="size-3.5" />
                  {t(item.labelKey)}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The old floating left sidebar. */
export function FloatingSidebar({
  width,
  editing = false,
  dragging = false,
  fill = false,
  viewTitle,
  onBack,
  onOpenApp,
  onCollapse,
  onResetWidth,
  onResizeStart,
  children,
}: {
  width: number;
  editing?: EditingWidth;
  dragging?: boolean;
  /** Fill the parent, as in the mobile sheet. */
  fill?: boolean;
  /** Set when a panel other than the host list is showing. */
  viewTitle?: string;
  onBack?: () => void;
  onOpenApp: (item: RailItemDef) => void;
  onCollapse: () => void;
  onResetWidth?: () => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const branding = useBranding();

  return (
    <aside
      aria-label={t("original.sidebar")}
      className={`${floatingPanel} relative flex min-h-0 flex-col text-foreground ${fill ? "flex-1" : "shrink-0"}`}
      style={
        fill
          ? undefined
          : {
              width: rem(dockWidth(width, editing)),
              transition: dragging ? "none" : "width 0.2s",
            }
      }
    >
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        {branding.logo ? (
          <img
            src={branding.logo}
            alt=""
            className="size-5 shrink-0 object-contain"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-lg font-bold">
          {branding.appName}
        </span>
        <AppsMenu onOpenApp={onOpenApp} />
        {onResetWidth && (
          <button
            type="button"
            onClick={onResetWidth}
            title={t("nav.resetSidebarWidth")}
            aria-label={t("nav.resetSidebarWidth")}
            className={`${outlineButton} size-7`}
          >
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onCollapse}
          title={t("nav.collapseSidebar")}
          aria-label={t("nav.collapseSidebar")}
          className={`${outlineButton} size-7`}
        >
          <Menu className="size-4" />
        </button>
      </header>
      <div className="h-0.5 shrink-0 bg-border" />

      {viewTitle && onBack && (
        <>
          <div className="flex h-10 shrink-0 items-center gap-2 px-2">
            <button
              type="button"
              onClick={onBack}
              title={t("original.backToHosts")}
              aria-label={t("original.backToHosts")}
              className={`${outlineButton} size-7`}
            >
              <ArrowLeft className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {viewTitle}
            </span>
          </div>
          <div className="h-0.5 shrink-0 bg-border" />
        </>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>

      <div className="h-0.5 shrink-0 bg-border" />
      <footer className="shrink-0 p-2">
        <UserMenu />
      </footer>

      {onResizeStart && !editing && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("original.resizeSidebar")}
          onMouseDown={onResizeStart}
          className={`absolute inset-y-0 right-0 z-30 w-1.5 cursor-col-resize transition-colors ${dragging ? "bg-border" : "hover:bg-border"}`}
        />
      )}
    </aside>
  );
}
