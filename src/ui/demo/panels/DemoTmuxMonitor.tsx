import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  MemoryStick,
  MonitorPlay,
  RefreshCw,
  RotateCw,
  SquareSplitHorizontal,
  SquareSplitVertical,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/button";
import { Skeleton } from "@/components/skeleton";
import {
  Facts,
  PANEL,
  PanelSearch,
  PanelShell,
} from "@/components/panel-layout";
import { usePanelView } from "@/hooks/use-panel-view";
import { getTmuxPaneOutput, getTmuxSessions } from "@/demo/demo-api";
import type { DemoTmuxSession } from "@/demo/demo-data";

// Mirrors the real TmuxMonitor on the shared panel chrome: a session tree on
// the left and a pane preview on the right. The real preview embeds a live
// terminal; the demo shows canned output.

interface SelectedPane {
  sessionName: string;
  paneId: string;
  command: string;
}

export function DemoTmuxMonitor() {
  const [sessions, setSessions] = useState<DemoTmuxSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedPane | null>(null);
  const { density } = usePanelView("tmux");
  const compact = density === "compact";

  useEffect(() => {
    let cancelled = false;
    getTmuxSessions().then((rows) => {
      if (cancelled) return;
      setSessions(rows);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    setRefreshing(true);
    getTmuxSessions().then((rows) => {
      setSessions(rows);
      setRefreshing(false);
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions
      .map((s) => ({
        ...s,
        windows: s.windows
          .map((w) => ({
            ...w,
            panes: w.panes.filter(
              (p) =>
                p.command.toLowerCase().includes(q) ||
                w.name.toLowerCase().includes(q) ||
                s.name.toLowerCase().includes(q),
            ),
          }))
          .filter((w) => w.panes.length > 0),
      }))
      .filter((s) => s.windows.length > 0);
  }, [sessions, query]);

  return (
    <PanelShell
      icon={<SquareTerminal className="size-4" />}
      title="tmux"
      status={`${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}
      actions={
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          title="Refresh"
          className="text-accent-brand"
        >
          <RefreshCw
            className={`size-4 ${isLoading || refreshing ? "animate-spin" : ""}`}
          />
        </Button>
      }
      toolbar={
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder="Search panes"
        />
      }
      scroll={false}
    >
      {/* Side by side on a desktop, stacked on a phone where 288px of session
          list would leave nothing for the pane detail. */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex max-h-48 shrink-0 flex-col border-b border-border md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div
            className={`flex items-center gap-2 border-b border-border ${PANEL.band}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Sessions
            </span>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {sessions.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {isLoading ? (
              <div className="space-y-2 px-1">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="ml-6 h-3.5 w-3/4" />
                <Skeleton className="ml-6 h-3.5 w-2/3" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="ml-6 h-3.5 w-2/3" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                No tmux sessions match.
              </p>
            ) : (
              filtered.map((session) => (
                <SessionNode
                  key={session.id}
                  session={session}
                  selected={selected}
                  compact={compact}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <PanePreview pane={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MonitorPlay className="mx-auto mb-2 size-8 opacity-50" />
                <p className="text-sm">Select a pane to preview it.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelShell>
  );
}

function SessionNode({
  session,
  selected,
  compact,
  onSelect,
}: {
  session: DemoTmuxSession;
  selected: SelectedPane | null;
  compact: boolean;
  onSelect: (pane: SelectedPane) => void;
}) {
  const [open, setOpen] = useState(true);
  const paneCount = session.windows.reduce(
    (total, w) => total + w.panes.length,
    0,
  );

  return (
    <div className="mb-0.5">
      <div
        className={`group flex cursor-pointer items-center gap-1.5 px-2 hover:bg-muted/40 ${compact ? "py-0.5" : "py-1"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span
          className={`size-2 shrink-0 rounded-full ${session.attached ? "bg-accent-brand" : "bg-muted-foreground/40"}`}
        />
        <span className="truncate text-sm font-medium">{session.name}</span>
        <Facts className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
          <span>{session.windows.length}w</span>
          <span>{paneCount}p</span>
        </Facts>
      </div>

      {open &&
        session.windows.map((window) => (
          <div key={window.id} className="ml-4">
            <div className="px-2 py-0.5 text-xs text-muted-foreground">
              {window.name}
            </div>
            {window.panes.map((pane) => {
              const isSelected = selected?.paneId === pane.id;
              return (
                <button
                  key={pane.id}
                  onClick={() =>
                    onSelect({
                      sessionName: session.name,
                      paneId: pane.id,
                      command: pane.command,
                    })
                  }
                  className={`flex w-full items-center gap-1.5 px-2 text-left transition-colors ${compact ? "py-0.5" : "py-1"} ${
                    isSelected
                      ? "bg-accent-brand/10 text-accent-brand"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <SquareTerminal className="size-3 shrink-0" />
                  <span className="truncate font-mono text-xs">
                    {pane.command}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function PanePreview({
  pane,
  onClose,
}: {
  pane: SelectedPane;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getTmuxPaneOutput(pane.paneId).then((rows) => {
      if (cancelled) return;
      setLines(rows);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pane.paneId]);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Facts className="min-w-0 text-[11px]">
          <span className="truncate font-medium text-foreground">
            {pane.sessionName}
          </span>
          <span className="shrink-0 font-mono">{pane.paneId}</span>
        </Facts>
        <span className="flex items-center gap-1 shrink-0">
          <Cpu className="size-3" />
          2.4%
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <MemoryStick className="size-3" />
          48 MB
        </span>
        <span className="truncate hidden md:inline">{pane.command}</span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Split right"
          >
            <SquareSplitHorizontal className="size-3.5" />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Split down"
          >
            <SquareSplitVertical className="size-3.5" />
          </button>
          <button
            className="text-muted-foreground hover:text-destructive"
            title="Kill pane"
          >
            <Trash2 className="size-3.5" />
          </button>
          <div className="h-3.5 border-l border-border" />
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Reattach"
          >
            <RotateCw className="size-3.5" />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Close preview"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-terminal-bg p-3 font-mono text-[11px] leading-relaxed">
        {isLoading ? (
          <span className="text-muted-foreground italic">Loading pane…</span>
        ) : lines.length === 0 ? (
          <span className="text-muted-foreground italic">
            This pane has no recent output.
          </span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
      </div>
    </>
  );
}
