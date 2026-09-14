import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Clock,
  ExternalLink,
  Network,
  Play,
  RefreshCw,
  Settings,
  Square,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import {
  Facts,
  PANEL,
  PanelSearch,
  PanelShell,
  Segmented,
  ViewToggle,
} from "@/components/panel-layout";
import { DataView, type DataColumn } from "@/components/data-view";
import { usePanelView } from "@/hooks/use-panel-view";
import { getTunnels } from "@/demo/demo-api";
import type { DemoTunnelRow } from "@/demo/demo-data";

// Mirrors the real TunnelTab on the shared panel chrome: the tunnels as either
// a card grid or a dense list.
// Starting a tunnel walks it through connecting so every badge state is
// reachable in the demo.

type TunnelState =
  | "connected"
  | "connecting"
  | "disconnected"
  | "waiting"
  | "error";

interface TunnelRow extends DemoTunnelRow {
  state: TunnelState;
  reason?: string;
}

const STATE_CLASS: Record<TunnelState, string> = {
  connected: "text-accent-brand border-accent-brand/40 bg-accent-brand/10",
  connecting: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  error: "text-destructive border-destructive/40 bg-destructive/10",
  waiting: "text-warning border-warning/40 bg-warning/10",
  disconnected: "text-muted-foreground border-border bg-muted/30",
};

const STATE_LABEL: Record<TunnelState, string> = {
  connected: "Connected",
  connecting: "Connecting",
  error: "Error",
  waiting: "Waiting",
  disconnected: "Disconnected",
};

// The one tunnel that fails on start, so the error badge and banner are
// reachable without pretending the demo has a real network.
const FAILING_TUNNEL_ID = "t-4";

type TunnelFilter = "all" | "connected" | "disconnected";

const TUNNEL_FILTERS = [
  { value: "all", label: "All" },
  { value: "connected", label: "Connected" },
  { value: "disconnected", label: "Stopped" },
] as const satisfies readonly { value: TunnelFilter; label: string }[];

function StateIcon({ state }: { state: TunnelState }) {
  switch (state) {
    case "connecting":
      return <RefreshCw className="size-3 animate-spin" />;
    case "connected":
      return <Wifi className="size-3" />;
    case "error":
      return <AlertCircle className="size-3" />;
    case "waiting":
      return <Clock className="size-3" />;
    default:
      return <WifiOff className="size-3" />;
  }
}

export function DemoTunnels() {
  const [rows, setRows] = useState<TunnelRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { view, density, setView, setDensity } = usePanelView("tunnels");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TunnelFilter>("all");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;
    getTunnels().then((tunnels) => {
      if (cancelled) return;
      setRows(
        tunnels.map((t) => ({
          ...t,
          state: t.status === "running" ? "connected" : "disconnected",
        })),
      );
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const captured = timers.current;
  useEffect(() => () => captured.forEach(clearTimeout), [captured]);

  function patch(id: string, next: Partial<TunnelRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...next } : r)),
    );
  }

  function start(row: TunnelRow) {
    patch(row.id, { state: "connecting", reason: undefined });
    if (row.id === FAILING_TUNNEL_ID) {
      timers.current.push(
        setTimeout(() => patch(row.id, { state: "waiting" }), 700),
        setTimeout(
          () =>
            patch(row.id, {
              state: "error",
              reason: "Connection refused by the remote host.",
            }),
          1600,
        ),
      );
      return;
    }
    timers.current.push(
      setTimeout(() => patch(row.id, { state: "connected" }), 900),
    );
  }

  function stop(row: TunnelRow) {
    patch(row.id, { state: "disconnected", reason: undefined });
  }

  const connectedCount = rows.filter((r) => r.state === "connected").length;

  const q = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (filter === "connected" && row.state !== "connected") return false;
    // Anything not up counts as stopped, including the error and waiting states.
    if (filter === "disconnected" && row.state === "connected") return false;
    if (!q) return true;
    return (
      row.hostName.toLowerCase().includes(q) ||
      row.endpointHost.toLowerCase().includes(q) ||
      String(row.sourcePort).includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <RefreshCw className="size-5 animate-spin text-muted-foreground opacity-40" />
      </div>
    );
  }

  return (
    <PanelShell
      icon={<Network className="size-4" />}
      title="Tunnels"
      status={`${connectedCount} of ${rows.length} connected`}
      actions={
        <a
          href="https://docs.termix.site"
          target="_blank"
          rel="noreferrer"
          className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          title="Documentation"
        >
          <ExternalLink className="size-4" />
        </a>
      }
      toolbar={
        <>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder="Search tunnels"
          />
          <Segmented<TunnelFilter>
            value={filter}
            onChange={setFilter}
            options={TUNNEL_FILTERS}
          />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums sm:inline">
              {visible.length} of {rows.length}
            </span>
            <ViewToggle
              view={view}
              onView={setView}
              density={density}
              onDensity={setDensity}
            />
          </div>
        </>
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      <DataView
        items={visible}
        view={view}
        density={density}
        getKey={(r) => r.id}
        columns={{ base: 1, md: 2, lg: 3 }}
        listColumns={tunnelColumns(start, stop)}
        renderCard={(row) => (
          <TunnelCard
            row={row}
            onStart={() => start(row)}
            onStop={() => stop(row)}
          />
        )}
        empty={
          <EmptyState
            icon={Network}
            title={
              rows.length === 0
                ? "No SSH tunnels"
                : "Nothing matches those filters"
            }
            hint={
              rows.length === 0
                ? "Configure tunnel connections in the Host Manager to get started."
                : "Try a different search or status filter."
            }
          />
        }
      />
    </PanelShell>
  );
}

/** List mode. Start and stop stay on the row, since a row cannot use hover. */
function tunnelColumns(
  onStart: (row: TunnelRow) => void,
  onStop: (row: TunnelRow) => void,
): DataColumn<TunnelRow>[] {
  return [
    {
      key: "port",
      header: "Local port",
      width: "110px",
      cell: (r) => (
        <span className="font-mono font-medium">{r.sourcePort}</span>
      ),
    },
    {
      key: "state",
      header: "State",
      width: "130px",
      cell: (r) => (
        <span
          className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-bold ${STATE_CLASS[r.state]}`}
        >
          <StateIcon state={r.state} />
          {STATE_LABEL[r.state]}
        </span>
      ),
    },
    {
      key: "destination",
      header: "Destination",
      width: "minmax(0,1.6fr)",
      cell: (r) => (
        <span className="truncate font-mono text-[11px]">
          {r.mode === "dynamic"
            ? "SOCKS5 proxy"
            : `${r.endpointHost}:${r.endpointPort}`}
        </span>
      ),
    },
    {
      key: "meta",
      header: "Host",
      width: "minmax(0,1fr)",
      hideBelow: "md",
      cell: (r) => (
        <Facts className="text-[10px] text-muted-foreground">
          <span className="truncate">{r.hostName}</span>
          <span className="uppercase">{r.mode}</span>
        </Facts>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "72px",
      align: "end",
      cell: (r) => {
        const running = r.state === "connected";
        const busy = r.state === "connecting" || r.state === "waiting";
        return (
          <Button
            variant="ghost"
            size="icon-xs"
            title={running || busy ? "Stop" : "Start"}
            className={running || busy ? "text-destructive" : ""}
            onClick={(e) => {
              e.stopPropagation();
              if (running || busy) onStop(r);
              else onStart(r);
            }}
          >
            {running || busy ? (
              <Square className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </Button>
        );
      },
    },
  ];
}

function TunnelCard({
  row,
  onStart,
  onStop,
}: {
  row: TunnelRow;
  onStart: () => void;
  onStop: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const busy = row.state === "connecting" || row.state === "waiting";
  const running = row.state === "connected";

  return (
    <Card className="flex flex-col overflow-hidden p-0 gap-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground truncate">
            Port {row.sourcePort}
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold ${STATE_CLASS[row.state]}`}
        >
          <StateIcon state={row.state} />
          {STATE_LABEL[row.state]}
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
            Destination
          </span>
          <span className="text-sm font-mono font-semibold truncate">
            {row.mode === "dynamic"
              ? "SOCKS5 Proxy"
              : `${row.endpointHost}:${row.endpointPort}`}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground uppercase">
              {row.mode}
            </span>
            <span className="text-[10px] text-muted-foreground">
              → localhost:{row.sourcePort}
            </span>
          </div>
        </div>

        {row.reason && (
          <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 text-destructive text-[10px]">
            <AlertCircle className="size-3 shrink-0 mt-px" />
            <span>{row.reason}</span>
          </div>
        )}

        {showSettings && (
          <div className="border border-border bg-muted/20 p-3 flex flex-col gap-2 text-xs">
            <Detail label="Host" value={row.hostName} mono />
            <Detail label="Mode" value={row.mode} upper />
            <Detail label="Local Port" value={String(row.sourcePort)} mono />
            <Detail
              label="Remote Host"
              value={row.mode === "dynamic" ? "-" : row.endpointHost}
              mono
            />
            <Detail
              label="Remote Port"
              value={row.mode === "dynamic" ? "-" : String(row.endpointPort)}
              mono
            />
            <Detail label="Auto Start" value={row.autoStart ? "Yes" : "No"} upper />
          </div>
        )}

        <div className="flex gap-2 mt-1">
          {running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              className="flex-1 h-8 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Square className="size-3" />
              Stop
            </Button>
          ) : busy ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              className="flex-1 h-8 text-warning border-warning/40 hover:bg-warning/10 hover:text-warning gap-1.5"
            >
              <Square className="size-3" />
              Cancel
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onStart}
              className="flex-1 h-8 text-accent-brand border-accent-brand/40 hover:bg-accent-brand/10 hover:text-accent-brand gap-1.5"
            >
              <Play className="size-3" />
              Start
            </Button>
          )}
          <Button
            variant={showSettings ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
            className={`h-8 w-8 ${showSettings ? "bg-accent-brand/10 text-accent-brand" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings className="size-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Detail({
  label,
  value,
  mono,
  upper,
}: {
  label: string;
  value: string;
  mono?: boolean;
  upper?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-muted-foreground font-semibold shrink-0">
        {label}
      </span>
      <span
        className={`truncate ${mono ? "font-mono" : ""} ${upper ? "uppercase font-bold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
