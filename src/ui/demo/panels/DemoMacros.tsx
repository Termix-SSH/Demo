import { useEffect, useState } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Play,
  Plus,
  Square,
} from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { PANEL, PanelSearch, PanelShell } from "@/components/panel-layout";
import { getMacros } from "@/demo/demo-api";
import type { DemoMacro, DemoMacroStep } from "@/demo/demo-data";

/**
 * Mirrors the real MacrosPanel: a named run of steps against one terminal,
 * where each step either sends something or waits for something.
 *
 * The step kind is the thing worth reading at a glance, so it leads the row as
 * a fixed-width chip and the detail follows in mono.
 */

const KIND_CLASS: Record<DemoMacroStep["kind"], string> = {
  send: "text-accent-brand border-accent-brand/40 bg-accent-brand/10",
  wait: "text-warning border-warning/40 bg-warning/10",
  delay: "text-muted-foreground border-border bg-muted/30",
  if: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  repeat: "text-blue-400 border-blue-400/40 bg-blue-400/10",
};

export function DemoMacros({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<DemoMacro[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMacros().then((macros) => {
      if (cancelled) return;
      setRows(macros);
      // The first macro starts expanded so the step model is visible without
      // a click.
      setOpen(new Set(macros.length > 0 ? [macros[0].id] : []));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (running === null) return;
    const id = setTimeout(() => setRunning(null), 2200);
    return () => clearTimeout(id);
  }, [running]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      !q ||
      row.name.toLowerCase().includes(q) ||
      (row.description ?? "").toLowerCase().includes(q),
  );

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Braces className="size-4" />}
      title="Macros"
      status={`${rows.length} saved`}
      actions={
        <Button variant="ghost" size="icon-xs" title="New macro">
          <Plus className="size-4" />
        </Button>
      }
      toolbar={
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder="Search macros"
          fill
        />
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={Braces}
          title={rows.length === 0 ? "No macros" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Record a run of keystrokes and replay it in any terminal."
              : "Try a different search."
          }
        />
      ) : (
        visible.map((row) => {
          const expanded = open.has(row.id);
          const isRunning = running === row.id;
          return (
            <div
              key={row.id}
              className="flex flex-col border border-border bg-background"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(row.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {expanded ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold">
                      {row.name}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {row.description ?? `${row.steps.length} steps`}
                    </span>
                  </div>
                </button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setRunning(isRunning ? null : row.id)}
                  className={`shrink-0 gap-1 ${
                    isRunning
                      ? "border-destructive/40 text-destructive hover:text-destructive"
                      : ""
                  }`}
                >
                  {isRunning ? (
                    <Square className="size-3" />
                  ) : (
                    <Play className="size-3" />
                  )}
                  {isRunning ? "Stop" : "Run"}
                </Button>
              </div>

              {expanded && (
                <div className="flex flex-col border-t border-border">
                  {row.steps.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0"
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-[10px] text-muted-foreground/60">
                        {i + 1}
                      </span>
                      <span
                        className={`w-14 shrink-0 border px-1 py-px text-center text-[9px] font-bold uppercase ${KIND_CLASS[step.kind]}`}
                      >
                        {step.kind}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                        {step.detail}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </PanelShell>
  );
}
