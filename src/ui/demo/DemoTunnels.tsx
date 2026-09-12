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
import { getTunnels } from "@/demo/demo-api";
import type { DemoTunnelRow } from "@/demo/demo-data";

// Mirrors the real TunnelTab: a header card over a grid of per-tunnel cards.
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
  waiting: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10",
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <RefreshCw className="size-5 animate-spin text-muted-foreground opacity-40" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background h-full">
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 gap-0">
          <div className="flex items-center gap-3">
            <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
              <Network className="size-5 text-accent-brand" />
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-bold leading-none">Tunnels</h1>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent-brand" />
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                  {connectedCount}/{rows.length} Active
                </span>
              </div>
            </div>
          </div>
          <a
            href="https://docs.termix.site"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center size-9 text-muted-foreground hover:text-foreground transition-colors"
            title="Documentation"
          >
            <ExternalLink className="size-4" />
          </a>
        </Card>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <div className="opacity-10 flex flex-col items-center gap-4">
              <Network className="size-16" />
              <span className="text-xl font-bold uppercase tracking-widest">
                No SSH Tunnels
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              You haven't created any SSH tunnels yet. Configure tunnel
              connections in the Host Manager to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((row) => (
              <TunnelCard
                key={row.id}
                row={row}
                onStart={() => start(row)}
                onStop={() => stop(row)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
              className="flex-1 h-8 text-yellow-500 border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-500 gap-1.5"
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
