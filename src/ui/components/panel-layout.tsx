/* eslint-disable react-refresh/only-export-components */
import { Children, Fragment } from "react";
import type React from "react";
import { Grid3X3, List, Rows3, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/input";
import { Separator } from "@/components/separator";

/**
 * The chrome every feature tab draws.
 *
 * Each tab used to build its own header: Docker and Tunnels had a hero card
 * with a 2xl title, Proxmox a bare bordered div, Tmux nothing at all. They
 * disagreed on height, padding and type scale, and the hero cards cost about
 * 70px before any content. Everything now goes through PanelShell, which uses
 * the h-12.5 header row the rest of the app already uses (AppShell, TabBar,
 * PanelFrame, PluginsScreen).
 */

/** One rhythm for every panel, so tightening the app is an edit here. */
export const PANEL = {
  body: "p-2.5",
  gap: "gap-2",
  band: "px-3 py-2",
  cardHead: "px-3 py-2.5",
  header: "h-12.5",
} as const;

export type PanelViewMode = "grid" | "list";
export type PanelDensity = "comfortable" | "compact";

export function PanelShell({
  chrome = true,
  icon,
  title,
  status,
  leading,
  actions,
  toolbar,
  tabs,
  scroll = true,
  className,
  children,
}: {
  /** False inside the sidebar, which draws its own header and background. */
  chrome?: boolean;
  icon?: React.ReactNode;
  title?: string;
  /** Short caption beside the title, e.g. "12 of 18 running". */
  status?: React.ReactNode;
  /** Sits before the title, for a back button. */
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  /**
   * A full-bleed tab strip in place of a toolbar. Unlike `toolbar` this adds no
   * padding, so the strip's underline sits on the band's own border.
   */
  tabs?: React.ReactNode;
  /** False when the body scrolls itself, as the tmux and file panes do. */
  scroll?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const body = (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        scroll && "overflow-y-auto",
        className,
      )}
    >
      {children}
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar && (
          <div
            className={`flex shrink-0 items-center gap-2 border-b border-border ${PANEL.band}`}
          >
            {toolbar}
          </div>
        )}
        {tabs && (
          <div className="shrink-0 border-b border-border px-1">{tabs}</div>
        )}
        {body}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header
        className={`flex ${PANEL.header} shrink-0 flex-row items-center border-b border-border`}
      >
        {leading && (
          <>
            {leading}
            <Separator orientation="vertical" />
          </>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          {icon && <span className="shrink-0 text-accent-brand">{icon}</span>}
          <span className="truncate text-base font-bold tracking-tight">
            {title}
          </span>
          {status && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {status}
              </span>
            </>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1 px-2">{actions}</div>
        )}
      </header>

      {toolbar && (
        <div
          className={`flex shrink-0 items-center gap-2 border-b border-border ${PANEL.band}`}
        >
          {toolbar}
        </div>
      )}

      {tabs && (
        <div className="shrink-0 border-b border-border px-1">{tabs}</div>
      )}

      {body}
    </div>
  );
}

/** Search box sized to match the toolbar buttons and chips. */
export function PanelSearch({
  value,
  onChange,
  placeholder,
  fill,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** Takes the whole toolbar, for panels whose search is the only control. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative", fill ? "w-full" : "w-40 md:w-56", className)}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}

/**
 * Square segmented control. Replaces the three near-identical copies that grew
 * in DemoProxmox, PluginsScreen and FileManagerToolbar.
 *
 * The focus ring is not optional: index.css sets outline-none on everything, so
 * a raw button here is invisible to the keyboard. Setting it once covers every
 * call site.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly {
    value: NoInfer<T>;
    label: string;
    icon?: React.ReactNode;
    count?: number;
    title?: string;
  }[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center border border-border", className)}>
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring",
              i > 0 && "border-l border-border",
              active
                ? "bg-accent-brand/10 text-accent-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span className="text-[10px] tabular-nums opacity-60">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Grid/list and density, lifted out of the file manager toolbar so every panel
 * gets the same control in the same place.
 */
export function ViewToggle({
  view,
  onView,
  density,
  onDensity,
}: {
  view: PanelViewMode;
  onView: (next: PanelViewMode) => void;
  density: PanelDensity;
  onDensity: (next: PanelDensity) => void;
}) {
  return (
    <div className="flex items-center border border-border">
      <ToggleButton
        active={view === "grid"}
        onClick={() => onView("grid")}
        title="Grid"
      >
        <Grid3X3 className="size-4" />
      </ToggleButton>
      <ToggleButton
        active={view === "list"}
        onClick={() => onView("list")}
        title="List"
        bordered
      >
        <List className="size-4" />
      </ToggleButton>
      <ToggleButton
        active={density === "compact"}
        onClick={() =>
          onDensity(density === "compact" ? "comfortable" : "compact")
        }
        title={density === "compact" ? "Comfortable rows" : "Compact rows"}
        bordered
      >
        <Rows3 className="size-4" />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  bordered,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex size-8 items-center justify-center transition-colors focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring",
        bordered && "border-l border-border",
        active
          ? "bg-accent-brand/10 text-accent-brand"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A run of peer facts, separated by a real rule between each pair.
 *
 * The first version of this drew the rule as a left border on every sibling,
 * which broke in four ways: a wrapped line started with a rule, a
 * justify-between row put a rule between a label and its value at opposite
 * ends, a single child still got the treatment, and a nested flex span pushed
 * the rule into the middle of a group. Separators are real elements now, placed
 * only between children, and the row never wraps -- a fact that does not fit is
 * truncated rather than sent to a second line where its rule would dangle.
 *
 * Use this only for peers: "12 online", "40 hosts". A label and its value are
 * not peers -- separate those with space, since a rule between a name and its
 * number reads as a boundary between two facts.
 */
export function Facts({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span
              aria-hidden
              className="h-3 w-px shrink-0 bg-border"
            />
          )}
          <span className="min-w-0 truncate">{child}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** Section label with a rule running to the edge. */
export function GroupHeading({
  title,
  count,
  className,
}: {
  title: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
