import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Input } from "@/components/input";

/**
 * Shared chrome for the rail panels the demo does not implement in full.
 *
 * Each one keeps the real panel's shape -- an optional search row, then either a
 * list of rows or an empty state -- so the sidebar looks right at a glance
 * without pretending the feature works.
 */
export function DemoPanel({
  icon: Icon,
  emptyTitle,
  emptyHint,
  searchPlaceholder,
  rows,
}: {
  icon?: LucideIcon;
  emptyTitle: string;
  emptyHint?: string;
  searchPlaceholder?: string;
  rows?: DemoPanelRow[];
}) {
  const hasRows = !!rows && rows.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {searchPlaceholder && (
        <div className="shrink-0 border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              className="h-7 pl-7 text-xs"
              readOnly
            />
          </div>
        </div>
      )}

      {hasRows ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {rows!.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 border-b border-border/60 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">
                  {row.title}
                </span>
                {row.badge && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {row.badge}
                  </span>
                )}
              </div>
              {row.subtitle && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {row.subtitle}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          {Icon && (
            <Icon className="size-5 shrink-0 text-muted-foreground/40" />
          )}
          <span className="text-xs text-muted-foreground">{emptyTitle}</span>
          {emptyHint && (
            <span className="max-w-xs text-[11px] leading-snug text-muted-foreground/70">
              {emptyHint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface DemoPanelRow {
  title: string;
  subtitle?: string;
  badge?: string;
}
