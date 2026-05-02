import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Clock, Network, Play, Plus, RefreshCw, Settings, Square, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { Tunnel, TunnelStatusValue } from "@/ui/types";
import { hosts } from "@/ui/data";

function TunnelCard({ tunnel, onAction, onDelete }: {
  tunnel: Tunnel;
  onAction: (id: string, action: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
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
            {tunnel.mode === "dynamic" ? "SOCKS5 Proxy" : `${tunnel.endpointHost}:${tunnel.endpointPort}`}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground uppercase">{tunnel.mode}</span>
            <span className="text-[10px] text-muted-foreground">→ localhost:{tunnel.sourcePort}</span>
          </div>
        </div>

        {isError && tunnel.reason && (
          <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 text-destructive text-[10px]">
            <AlertCircle className="size-3 mt-0.5 shrink-0"/>
            <span>{tunnel.reason}</span>
          </div>
        )}

        {showSettings && (
          <div className="border border-border bg-muted/20 p-3 flex flex-col gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold">Host</span>
              <span className="font-mono">{tunnel.hostId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold">Mode</span>
              <span className="uppercase font-bold">{tunnel.mode}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-semibold">Local Port</span>
              <span className="font-mono">{tunnel.sourcePort}</span>
            </div>
            {tunnel.mode !== "dynamic" && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Remote Host</span>
                  <span className="font-mono">{tunnel.endpointHost}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Remote Port</span>
                  <span className="font-mono">{tunnel.endpointPort}</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-1">
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
          <Button
            variant={showSettings ? "secondary" : "ghost"}
            size="icon"
            className={`h-8 w-8 ${showSettings ? "bg-accent-brand/10 text-accent-brand" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setShowSettings(s => !s)}
          >
            <Settings className="size-3.5"/>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(tunnel.id)}>
            <Trash2 className="size-3.5"/>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function NewTunnelDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (tunnel: Tunnel) => void;
}) {
  const [form, setForm] = useState({
    hostId: hosts[0]?.name ?? "",
    mode: "local" as "local" | "remote" | "dynamic",
    sourcePort: "",
    endpointHost: "localhost",
    endpointPort: "",
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleAdd = () => {
    if (!form.sourcePort) { toast.error("Local port is required"); return; }
    if (form.mode !== "dynamic" && (!form.endpointHost || !form.endpointPort)) {
      toast.error("Remote host and port are required");
      return;
    }
    const newTunnel: Tunnel = {
      id: `T-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      hostId: form.hostId,
      sourcePort: parseInt(form.sourcePort),
      endpointHost: form.mode === "dynamic" ? "dynamic-socks5" : form.endpointHost,
      endpointPort: form.mode === "dynamic" ? 0 : parseInt(form.endpointPort),
      status: "DISCONNECTED",
      mode: form.mode,
    };
    onAdd(newTunnel);
    onOpenChange(false);
    toast.success("Tunnel configured — click Start to connect");
    setForm({ hostId: hosts[0]?.name ?? "", mode: "local", sourcePort: "", endpointHost: "localhost", endpointPort: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-none border-border bg-card p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
              <Network className="size-3.5 text-accent-brand" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-none">New Tunnel</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">Configure a new SSH tunnel for port forwarding.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Host</label>
            <select
              value={form.hostId}
              onChange={e => set("hostId", e.target.value)}
              className="h-9 px-2.5 text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-accent-brand/50 rounded-none"
            >
              {hosts.map(h => <option key={h.id} value={h.name}>{h.name} ({h.address})</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tunnel Mode</label>
            <div className="grid grid-cols-3 gap-1">
              {(["local", "remote", "dynamic"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => set("mode", m)}
                  className={`py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                    form.mode === m
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {form.mode === "local" && "Forward a local port to a remote host/port via SSH."}
              {form.mode === "remote" && "Expose a local port on the remote server."}
              {form.mode === "dynamic" && "Create a SOCKS5 proxy through the SSH connection."}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Local Port</label>
            <Input
              type="number"
              placeholder="e.g. 8080"
              value={form.sourcePort}
              onChange={e => set("sourcePort", e.target.value)}
              className="rounded-none bg-muted/50 border-border text-sm h-9"
            />
          </div>

          {form.mode !== "dynamic" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Remote Host</label>
                <Input
                  placeholder="localhost"
                  value={form.endpointHost}
                  onChange={e => set("endpointHost", e.target.value)}
                  className="rounded-none bg-muted/50 border-border text-sm h-9"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Remote Port</label>
                <Input
                  type="number"
                  placeholder="e.g. 80"
                  value={form.endpointPort}
                  onChange={e => set("endpointPort", e.target.value)}
                  className="rounded-none bg-muted/50 border-border text-sm h-9"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-none text-[10px] font-bold uppercase tracking-widest">Cancel</Button>
          <Button
            variant="outline"
            className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none text-[10px] font-bold uppercase tracking-widest gap-1.5"
            onClick={handleAdd}
          >
            <Network className="size-3" /> Add Tunnel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const [newTunnelOpen, setNewTunnelOpen] = useState(false);

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

  const handleDelete = (id: string) => {
    setTunnels(prev => prev.filter(t => t.id !== id));
    toast.error("Tunnel removed");
  };

  const connectedCount = tunnels.filter(t => t.status === "CONNECTED").length;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <NewTunnelDialog open={newTunnelOpen} onOpenChange={setNewTunnelOpen} onAdd={t => setTunnels(prev => [t, ...prev])} />

      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div className="flex items-center gap-3">
          <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
            <Network className="size-5 text-accent-brand"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-brand"/>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                {connectedCount}/{tunnels.length} Active
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0">
          <Button variant="outline" size="default" className="gap-2 font-semibold" onClick={() => setNewTunnelOpen(true)}>
            <Plus className="size-3.5"/>New Tunnel
          </Button>
          <Separator orientation="vertical" className="h-8 mx-3"/>
          <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tunnels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map(tunnel => (
              <TunnelCard key={tunnel.id} tunnel={tunnel} onAction={handleAction} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <div className="opacity-10 flex flex-col items-center gap-4">
              <Network className="size-16"/>
              <span className="text-xl font-bold uppercase tracking-widest">No Tunnels</span>
            </div>
            <Button
              variant="outline"
              className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 gap-2"
              onClick={() => setNewTunnelOpen(true)}
            >
              <Plus className="size-3.5"/> Configure First Tunnel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
