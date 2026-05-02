import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Clock, Network, Play, Plus, RefreshCw, Settings, Square, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { Tunnel, TunnelStatusValue } from "@/ui/types";

function TunnelCard({ tunnel, onAction }: { tunnel: Tunnel; onAction: (id: string, action: string) => void }) {
  const isConnected  = tunnel.status === "CONNECTED";
  const isConnecting = tunnel.status === "CONNECTING";
  const isError      = tunnel.status === "ERROR";

  let statusColor = "text-muted-foreground border-border bg-muted/30";
  if (isConnected)  statusColor = "text-accent-brand border-accent-brand/40 bg-accent-brand/10";
  if (isConnecting) statusColor = "text-blue-400 border-blue-400/40 bg-blue-400/10";
  if (isError)      statusColor = "text-destructive border-destructive/40 bg-destructive/10";

  return (
    <Card className="flex flex-col overflow-hidden p-0 gap-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground"/>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Port {tunnel.sourcePort}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold ${statusColor}`}>
          {isConnecting ? <RefreshCw className="size-3 animate-spin"/> : isConnected ? <Wifi className="size-3"/> : isError ? <AlertCircle className="size-3"/> : tunnel.status === "WAITING" ? <Clock className="size-3"/> : <WifiOff className="size-3"/>}
          {tunnel.status}
        </div>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Destination</span>
          <span className="text-sm font-mono font-semibold truncate" title={`${tunnel.endpointHost}:${tunnel.endpointPort}`}>
            {tunnel.endpointHost}:{tunnel.endpointPort}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground uppercase">{tunnel.mode}</span>
          </div>
        </div>

        {isError && tunnel.reason && (
          <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 text-destructive text-[10px]">
            <AlertCircle className="size-3 mt-0.5 shrink-0"/>
            <span>{tunnel.reason}</span>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          {isConnected ? (
            <Button variant="outline" size="sm" className="flex-1 h-8 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive gap-1.5" onClick={() => onAction(tunnel.id, "stop")}>
              <Square className="size-3"/> Stop
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1 h-8 text-accent-brand border-accent-brand/40 hover:bg-accent-brand/10 hover:text-accent-brand gap-1.5" disabled={isConnecting} onClick={() => onAction(tunnel.id, "start")}>
              {isConnecting ? <RefreshCw className="size-3 animate-spin"/> : <Play className="size-3"/>}
              Start
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Settings className="size-3.5"/>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5"/>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function TunnelTab({ label }: { label: string }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([
    { id: "T-101", hostId: "web-01", sourcePort: 8080, endpointHost: "localhost",                endpointPort: 80,   status: "CONNECTED",    mode: "local"   },
    { id: "T-102", hostId: "web-01", sourcePort: 3000, endpointHost: "localhost",                endpointPort: 3000, status: "DISCONNECTED", mode: "remote"  },
    { id: "T-103", hostId: "web-01", sourcePort: 5432, endpointHost: "db-primary-internal",      endpointPort: 5432, status: "WAITING",      mode: "local"   },
    { id: "T-104", hostId: "web-01", sourcePort: 6379, endpointHost: "redis-cache-01.internal",  endpointPort: 6379, status: "ERROR",        mode: "local",  reason: "Connection timed out (10.0.5.12)" },
    { id: "T-105", hostId: "web-01", sourcePort: 9000, endpointHost: "dynamic-socks5",           endpointPort: 0,    status: "CONNECTED",    mode: "dynamic" },
  ]);

  const handleAction = (id: string, action: string) => {
    if (action === "start") {
      setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "CONNECTING" as TunnelStatusValue } : t));
      setTimeout(() => {
        setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "CONNECTED" as TunnelStatusValue } : t));
        toast.success(`Tunnel ${id} established successfully`);
      }, 1500);
    } else if (action === "stop") {
      setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "DISCONNECTED" as TunnelStatusValue } : t));
      toast.info(`Tunnel ${id} disconnected`);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div className="flex items-center gap-3">
          <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
            <Network className="size-5 text-accent-brand"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-brand"/>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">SSH Tunnels</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0">
          <Button variant="outline" size="default" className="gap-2 font-semibold">
            <Plus className="size-3.5"/>Add Tunnel
          </Button>
          <Separator orientation="vertical" className="h-8 mx-3"/>
          <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tunnels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map(tunnel => (
              <TunnelCard key={tunnel.id} tunnel={tunnel} onAction={handleAction} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
            <Network className="size-16 mb-4"/>
            <span className="text-xl font-bold uppercase tracking-widest">No Tunnels</span>
            <span className="text-xs font-semibold">Configure SSH tunnels for this host</span>
          </div>
        )}
      </div>
    </div>
  );
}
