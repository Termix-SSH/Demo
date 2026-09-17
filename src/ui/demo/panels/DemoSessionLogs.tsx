import { useEffect, useMemo, useState } from "react";
import { Download, Eye, ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import {
  Facts,
  GroupHeading,
  PANEL,
  PanelSearch,
  PanelShell,
} from "@/components/panel-layout";
import { getSessionLogs } from "@/demo/demo-api";
import type { DemoSessionLog } from "@/demo/demo-data";
import { timeAgo } from "@/lib/relative-time";

/** "48 KB", "1.2 MB". */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Mirrors the real SessionLogsPanel: recordings grouped by host, each row
 * carrying who opened it, how long it ran and how much was captured.
 */
export function DemoSessionLogs({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<DemoSessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSessionLogs().then((logs) => {
      if (cancelled) return;
      setRows(logs);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      !q ||
      row.hostName.toLowerCase().includes(q) ||
      row.username.toLowerCase().includes(q),
  );

  const groups = useMemo(() => {
    const byHost = new Map<string, DemoSessionLog[]>();
    for (const row of visible) {
      const list = byHost.get(row.hostName);
      if (list) list.push(row);
      else byHost.set(row.hostName, [row]);
    }
    return [...byHost.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<ScrollText className="size-4" />}
      title="Session logs"
      status={`${rows.length} recorded, ${formatBytes(totalBytes)}`}
      toolbar={
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder="Search by host or user"
          fill
        />
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={rows.length === 0 ? "No session logs" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Recorded terminal sessions are listed here to replay or download."
              : "Try a different search."
          }
        />
      ) : (
        groups.map(([host, items]) => (
          <div key={host} className="flex flex-col gap-1">
            <GroupHeading title={host} count={items.length} />
            {items.map((row) => (
              <div
                key={row.id}
                className="group flex items-center gap-2 border border-border px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">
                    {row.username}
                  </span>
                  <Facts className="text-[10px] text-muted-foreground">
                    <span>{timeAgo(row.startedAt, "just now")}</span>
                    <span>{formatDuration(row.durationMinutes)}</span>
                    <span>{formatBytes(row.bytes)}</span>
                  </Facts>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Replay"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Eye className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Download"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Download className="size-3" />
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
            ))}
          </div>
        ))
      )}
    </PanelShell>
  );
}
