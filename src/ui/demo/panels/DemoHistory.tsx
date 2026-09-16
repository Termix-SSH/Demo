import { useEffect, useState } from "react";
import { Check, Clock, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Facts, PanelSearch, PanelShell } from "@/components/panel-layout";
import { getCommandHistory } from "@/demo/demo-api";
import type { DemoHistoryEntry } from "@/demo/demo-data";
import { timeAgo } from "@/lib/relative-time";

/**
 * Mirrors the real HistoryPanel: a search box over a flat list of commands,
 * each with the host it ran on and a copy and delete action.
 */
export function DemoHistory({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<DemoHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCommandHistory().then((entries) => {
      if (cancelled) return;
      setRows(entries);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (copied === null) return;
    const id = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      !q ||
      row.command.toLowerCase().includes(q) ||
      row.hostName.toLowerCase().includes(q),
  );

  async function copy(row: DemoHistoryEntry) {
    try {
      await navigator.clipboard.writeText(row.command);
    } catch {
      // Nothing useful to say if the clipboard is blocked.
    }
    setCopied(row.id);
  }

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Clock className="size-4" />}
      title="History"
      status={`${rows.length} commands`}
      actions={
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setRows([])}
        >
          Clear
        </Button>
      }
      toolbar={
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder="Search commands"
          fill
        />
      }
      scroll={false}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={rows.length === 0 ? "No command history" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Commands you run in a terminal are listed here so you can find and rerun them."
              : "Try a different search."
          }
          className="flex-1"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((row) => (
            <div
              key={row.id}
              className="group flex items-center gap-2 border-b border-border/60 px-3 py-2 transition-colors last:border-0 hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-xs">
                  {row.command}
                </span>
                <Facts className="text-[10px] text-muted-foreground">
                  <span>{row.hostName}</span>
                  <span>{timeAgo(row.at, "just now")}</span>
                </Facts>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Copy"
                  onClick={() => copy(row)}
                  className={
                    copied === row.id
                      ? "text-accent-brand"
                      : "text-muted-foreground hover:text-foreground"
                  }
                >
                  {copied === row.id ? (
                    <Check className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Remove"
                  onClick={() =>
                    setRows((prev) => prev.filter((r) => r.id !== row.id))
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
