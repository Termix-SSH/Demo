import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  PanelRight,
  RotateCcw,
  SquareArrowOutUpRight,
} from "lucide-react";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { PANEL } from "@/components/panel-layout";
import {
  PROMOTABLE_IDS,
  RIGHT_DOCKABLE_IDS,
  railItemLabel,
} from "@/sidebar/rail-items";

/**
 * One dock, either side.
 *
 * The left sidebar and the right dock used to be two hand-copied headers, and
 * the right one rendered an empty div under its title. They share this now, so
 * both resize, reset and persist the same way and a fix lands in one place.

 */

export const DOCK_DEFAULT_WIDTH = 291;
export const DOCK_MIN_WIDTH = 220;
export const DOCK_MAX_WIDTH = 560;

function storageKey(side: "left" | "right") {
  return `termix-demo-dock-${side}`;
}

export function readDockWidth(side: "left" | "right"): number {
  try {
    const raw = localStorage.getItem(storageKey(side));
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value))
      return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, value));
  } catch {
    // Unreadable storage just means the default width.
  }
  return DOCK_DEFAULT_WIDTH;
}

function writeDockWidth(side: "left" | "right", width: number) {
  try {
    localStorage.setItem(storageKey(side), String(width));
  } catch {
    // Private windows refuse writes; the width just will not persist.
  }
}

export function DockPanel({
  side,
  view,
  open,
  onClose,
  onOpenAsTab,
  onMoveToRightDock,
  children,
}: {
  side: "left" | "right";
  view: string;
  open: boolean;
  /** Left only: an open editor forces the wider fixed width. */
  onClose: () => void;
  onOpenAsTab?: (view: string) => void;
  onMoveToRightDock?: (view: string) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(() => readDockWidth(side));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) writeDockWidth(side, width);
  }, [side, width, dragging]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        // The right dock grows as the pointer moves left, so the delta flips.
        const delta =
          side === "left" ? ev.clientX - startX : startX - ev.clientX;
        setWidth(
          Math.min(
            DOCK_MAX_WIDTH,
            Math.max(DOCK_MIN_WIDTH, startWidth + delta),
          ),
        );
      };
      const onUp = () => {
        setDragging(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [side, width],
  );

  const CollapseIcon = side === "left" ? ChevronLeft : PanelRight;

  return (
    <div
      className={`relative flex flex-col min-h-0 bg-sidebar shrink-0 overflow-hidden ${
        open
          ? `${side === "left" ? "border-r" : "border-l"} transition-colors ${
              dragging ? "border-accent-brand/60" : "border-border"
            }`
          : ""
      }`}
      style={{
        width: open ? width : 0,
        transition: dragging ? "none" : "width 0.2s",
      }}
    >
      <div
        className={`flex flex-row items-center border-b border-border ${PANEL.header} shrink-0`}
      >
        <span className="flex-1 min-w-0 whitespace-nowrap text-base font-bold tracking-tight text-foreground px-3">
          {railItemLabel(view, t)}
        </span>

        {onOpenAsTab && PROMOTABLE_IDS.includes(view) && (
          <>
            <Separator orientation="vertical" />
            <Button
              variant="ghost"
              size="icon"
              className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
              title={t("nav.openAsTab")}
              aria-label={t("nav.openAsTab")}
              onClick={() => onOpenAsTab(view)}
            >
              <SquareArrowOutUpRight className="size-3.5" />
            </Button>
          </>
        )}

        {side === "left" &&
          onMoveToRightDock &&
          RIGHT_DOCKABLE_IDS.includes(view) && (
            <>
              <Separator orientation="vertical" />
              <Button
                variant="ghost"
                size="icon"
                className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
                title={t("nav.openInRightDock")}
                aria-label={t("nav.openInRightDock")}
                onClick={() => onMoveToRightDock(view)}
              >
                <PanelRight className="size-3.5" />
              </Button>
            </>
          )}

        <Separator orientation="vertical" />
        <Button
          variant="ghost"
          size="icon"
          className="h-full w-12.5 border-y-0 border-border rounded-none text-muted-foreground hover:text-foreground"
          title={t("nav.resetWidth")}
          aria-label={t("nav.resetWidth")}
          onClick={() => setWidth(DOCK_DEFAULT_WIDTH)}
        >
          <RotateCcw className="size-3.5" />
        </Button>

        <Separator orientation="vertical" />
        <Button
          variant="ghost"
          size="icon"
          className="h-full w-12.5 border-y-0 border-r-0 border-border rounded-none text-muted-foreground hover:text-foreground"
          title={t("nav.collapse")}
          aria-label={t("nav.collapse")}
          onClick={onClose}
        >
          <CollapseIcon className="size-3.5" />
        </Button>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {children}
      </div>

      {open && (
        <div
          onMouseDown={onDragStart}
          className={`absolute ${side === "left" ? "right-0" : "left-0"} top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${
            dragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"
          }`}
        />
      )}
    </div>
  );
}

/** The thin strip that reopens a collapsed left dock. */
export function DockReopenStrip({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t("nav.expand")}
      aria-label={t("nav.expand")}
      className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-sidebar border-r border-border text-muted-foreground hover:text-accent-brand hover:bg-accent-brand/5 transition-colors"
    >
      <ChevronRight className="size-3.5" />
    </button>
  );
}
