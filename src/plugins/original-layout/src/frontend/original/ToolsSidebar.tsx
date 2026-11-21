import type React from "react";
import { X } from "lucide-react";
import { rem, useRailItems, type RailItemDef } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useHiddenRailTabs } from "../sidebar/hidden-rail-tabs";
import { floatingPanel, outlineButton } from "./styles";

/** Panels that can sit on the right, like the old SSH Tools sidebar. */
export function useToolPanels(): RailItemDef[] {
  const items = useRailItems();
  const hidden = useHiddenRailTabs();
  return items.filter((item) => item.rightDockable && !hidden.has(item.id));
}

/** The right sidebar: one tab per tool panel across the top. */
export function ToolsSidebar({
  view,
  width,
  dragging = false,
  onSelect,
  onClose,
  onResizeStart,
  children,
}: {
  view: string;
  width: number;
  dragging?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onResizeStart?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const panels = useToolPanels();

  return (
    <aside
      aria-label={t("original.tools")}
      className={`${floatingPanel} relative flex min-h-0 shrink-0 flex-col`}
      style={{
        width: rem(width),
        transition: dragging ? "none" : "width 0.2s",
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <span className="min-w-0 flex-1 truncate text-lg font-bold">
          {t("original.tools")}
        </span>
        <button
          type="button"
          onClick={onClose}
          title={t("nav.closeRightDock")}
          aria-label={t("nav.closeRightDock")}
          className={`${outlineButton} size-7`}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="h-0.5 shrink-0 bg-border" />
      {panels.length > 1 && (
        <>
          <div
            role="tablist"
            aria-label={t("original.tools")}
            className="flex shrink-0 gap-1 overflow-x-auto p-2 thin-scrollbar"
          >
            {panels.map((panel) => {
              const Icon = panel.icon;
              const active = panel.id === view;
              return (
                <button
                  key={panel.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(panel.id)}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[0.5rem] border-2 px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "border-foreground/60 bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {t(panel.labelKey)}
                </button>
              );
            })}
          </div>
          <div className="h-0.5 shrink-0 bg-border" />
        </>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      {onResizeStart && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("original.resizeTools")}
          onMouseDown={onResizeStart}
          className={`absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize transition-colors ${dragging ? "bg-border" : "hover:bg-border"}`}
        />
      )}
    </aside>
  );
}
