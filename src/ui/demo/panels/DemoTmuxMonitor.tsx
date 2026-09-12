import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  MemoryStick,
  MonitorPlay,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  SquareSplitHorizontal,
  SquareSplitVertical,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Skeleton } from "@/components/skeleton";
import { getTmuxPaneOutput, getTmuxSessions } from "@/demo/demo-api";
import type { DemoTmuxSession } from "@/demo/demo-data";

// Mirrors the real TmuxMonitor: a resizable session tree on the left, a host
// header with search and refresh on the right, and a pane preview below it.
// The real preview embeds a live terminal; the demo shows canned output.

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
    <div className="flex h-full min-h-0 bg-background">
      <div className="relative flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">Sessions</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {sessions.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          {isLoading ? (
            <div className="space-y-2 px-1">
              <Skeleton className="h-5 w-full rounded-md" />
              <Skeleton className="ml-6 h-3.5 w-3/4 rounded-md" />
              <Skeleton className="ml-6 h-3.5 w-2/3 rounded-md" />
              <Skeleton className="h-5 w-full rounded-md" />
              <Skeleton className="ml-6 h-3.5 w-2/3 rounded-md" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No tmux sessions match.
            </p>
          ) : (
            filtered.map((session) => (
              <SessionNode
                key={session.id}
                session={session}
                selected={selected}
                onSelect={setSelected}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Server className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">proxmox</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search panes"
                className="h-8 w-48 pl-7 text-sm md:w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={refresh}
            >
              <RefreshCw
                className={`size-3.5 ${isLoading || refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selected ? (
            <PanePreview
              pane={selected}
              onClose={() => setSelected(null)}
            />
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
    </div>
  );
}

function SessionNode({
  session,
  selected,
  onSelect,
}: {
  session: DemoTmuxSession;
  selected: SelectedPane | null;
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
        className="group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted/40"
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
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
          {session.windows.length}w · {paneCount}p
        </span>
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
                  className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors ${
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
        <span className="font-medium text-foreground truncate">
          {pane.sessionName} · {pane.paneId}
        </span>
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
      <div className="min-h-0 flex-1 overflow-auto bg-card p-3 font-mono text-[11px] leading-relaxed">
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
