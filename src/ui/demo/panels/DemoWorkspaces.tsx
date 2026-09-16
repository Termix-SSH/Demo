import { useEffect, useState } from "react";
import { Check, LayoutTemplate, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Facts, PANEL, PanelShell } from "@/components/panel-layout";
import { getWorkspaces } from "@/demo/demo-api";
import type { DemoWorkspace } from "@/demo/demo-data";
import { timeAgo } from "@/lib/relative-time";

/**
 * Mirrors the real WorkspacesPanel: saved layouts, each summarised by how many
 * tabs it restores and how the panes were split.
 */
export function DemoWorkspaces({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<DemoWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWorkspaces().then((workspaces) => {
      if (cancelled) return;
      setRows(workspaces);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (applied === null) return;
    const id = setTimeout(() => setApplied(null), 1600);
    return () => clearTimeout(id);
  }, [applied]);

  function makeDefault(id: number) {
    setRows((prev) =>
      prev.map((row) => ({ ...row, isDefault: row.id === id })),
    );
  }

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<LayoutTemplate className="size-4" />}
      title="Workspaces"
      status={`${rows.length} saved`}
      actions={
        <Button variant="ghost" size="icon-xs" title="Save this layout">
          <Plus className="size-4" />
        </Button>
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No workspaces"
          hint="Save a set of tabs and panes, then bring it back later."
        />
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="group flex items-center gap-2 border border-border px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-xs font-semibold">
                  {row.name}
                </span>
                {row.isDefault && (
                  <span className="shrink-0 border border-accent-brand/40 bg-accent-brand/10 px-1 py-px text-[9px] font-bold uppercase text-accent-brand">
                    Default
                  </span>
                )}
              </div>
              <Facts className="text-[10px] text-muted-foreground">
                <span>
                  {row.tabCount} {row.tabCount === 1 ? "tab" : "tabs"}
                </span>
                <span>{row.splitMode}</span>
                <span>{timeAgo(row.savedAt, "just now")}</span>
              </Facts>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={() => setApplied(row.id)}
              className={`shrink-0 gap-1 ${
                applied === row.id
                  ? "border-accent-brand/40 text-accent-brand hover:text-accent-brand"
                  : ""
              }`}
            >
              {applied === row.id && <Check className="size-3" />}
              {applied === row.id ? "Applied" : "Apply"}
            </Button>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon-xs"
                title="Make default"
                onClick={() => makeDefault(row.id)}
                className={
                  row.isDefault
                    ? "text-accent-brand"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                <Star className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Delete"
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.id !== row.id))
                }
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))
      )}
    </PanelShell>
  );
}
