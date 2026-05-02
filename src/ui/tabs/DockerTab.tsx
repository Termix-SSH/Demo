import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Activity, ArrowLeft, Box, Cpu, Download, HardDrive, Info,
  List, MemoryStick, Network, Play, Plus, RefreshCw, Search,
  Settings, Square, Terminal, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import { SectionCard } from "@/ui/shared/SectionCard";
import { MOCK_CONTAINERS } from "@/ui/data";
import type { DockerContainer, DockerContainerStatus } from "@/ui/types";

function AdminToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${on ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
    >
      <span className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}/>
    </button>
  );
}

function DockerBadge({ status }: { status: DockerContainerStatus }) {
  let colorClass = "border-border text-muted-foreground";
  if (status === "running") colorClass = "border-accent-brand/40 text-accent-brand bg-accent-brand/10";
  if (status === "paused")  colorClass = "border-yellow-500/40 text-yellow-500 bg-yellow-500/10";
  if (status === "exited")  colorClass = "border-destructive/40 text-destructive bg-destructive/5";

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase tracking-wider ${colorClass}`}>
      {status}
    </span>
  );
}

function DockerContainerCard({ container, onSelect, onAction }: {
  container: DockerContainer;
  onSelect: (id: string) => void;
  onAction: (id: string, action: string, e: React.MouseEvent) => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0 gap-0 group hover:border-accent-brand/40 transition-colors cursor-pointer" onClick={() => onSelect(container.id)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2 min-w-0">
          <Box className={`size-3.5 ${container.status === "running" ? "text-accent-brand" : "text-muted-foreground"}`}/>
          <span className="text-sm font-bold truncate">{container.name}</span>
        </div>
        <DockerBadge status={container.status}/>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Image</span>
          <span className="text-xs font-mono truncate text-foreground/80">{container.image}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">CPU Usage</span>
            <span className="text-xs font-semibold">{container.status === "running" ? `${container.cpu}%` : "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Memory</span>
            <span className="text-xs font-semibold">{container.status === "running" ? container.memory : "—"}</span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 mt-1">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Ports</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {container.ports.length > 0 ? container.ports.map(p => (
              <span key={p} className="text-[10px] font-mono px-1 border border-border bg-muted/30">{p}</span>
            )) : <span className="text-[10px] text-muted-foreground italic">None</span>}
          </div>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-border bg-muted/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-muted-foreground italic">Created {container.created}</span>
        <div className="flex items-center gap-1">
          {container.status !== "running" ? (
            <Button variant="ghost" size="icon-xs" className="text-accent-brand" onClick={(e) => onAction(container.id, "start", e)}><Play className="size-3"/></Button>
          ) : (
            <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={(e) => onAction(container.id, "stop", e)}><Square className="size-3"/></Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={(e) => onAction(container.id, "restart", e)}><RefreshCw className="size-3"/></Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive" onClick={(e) => onAction(container.id, "delete", e)}><Trash2 className="size-3"/></Button>
        </div>
      </div>
    </Card>
  );
}

function DockerLogViewer({ containerName }: { containerName: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const initialLogs = [
      `[${new Date().toISOString()}] INFO: Starting ${containerName}...`,
      `[${new Date().toISOString()}] INFO: Loading configuration from /etc/${containerName}/config.yml`,
      `[${new Date().toISOString()}] DEBUG: Establishing connection to internal mesh...`,
      `[${new Date().toISOString()}] INFO: Service initialized on port 8080`,
      `[${new Date().toISOString()}] WARN: High memory pressure detected in sub-process 42`,
      `[${new Date().toISOString()}] INFO: Incoming request from 10.0.5.12: GET /health`,
      `[${new Date().toISOString()}] INFO: 200 OK - 1.2ms`,
    ];
    setLogs(initialLogs);

    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLogs(prev => [
        ...prev.slice(-49),
        `[${new Date().toISOString()}] INFO: Worker processed batch ${Math.floor(Math.random() * 1000)} - Success`,
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, [containerName, autoRefresh]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center justify-between bg-card border border-border px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Auto Refresh</span>
            <AdminToggle on={autoRefresh} onToggle={() => setAutoRefresh(!autoRefresh)}/>
          </div>
          <Separator orientation="vertical" className="h-4"/>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{logs.length} Lines</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5"><Download className="size-3"/> Download</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setLogs([])}><Trash2 className="size-3"/> Clear</Button>
        </div>
      </div>
      <div className="flex-1 bg-[#111210] border border-border p-3 overflow-auto font-mono text-xs leading-relaxed scrollbar-thin">
        {logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            <span className="text-accent-brand/60">{log.substring(0, 26)}</span>
            <span className="text-foreground/90">{log.substring(26)}</span>
          </div>
        ))}
        {logs.length === 0 && <span className="text-muted-foreground italic">No logs available</span>}
      </div>
    </div>
  );
}

function DockerContainerStats({ container }: { container: DockerContainer }) {
  const [metrics, setMetrics] = useState({
    cpu: container.cpu,
    mem: parseFloat(container.memory) || 0,
    netIn: 1.2, netOut: 0.8, ioRead: 450, ioWrite: 120,
  });

  useEffect(() => {
    if (container.status !== "running") return;
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        cpu:    Math.max(0.1, Math.min(99, prev.cpu + (Math.random() * 2 - 1))),
        mem:    Math.max(1,   prev.mem + (Math.random() * 5 - 2.5)),
        netIn:  prev.netIn  + Math.random() * 0.1,
        netOut: prev.netOut + Math.random() * 0.05,
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, [container]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <SectionCard title="CPU Usage" icon={<Cpu className="size-3.5"/>}>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-accent-brand">{metrics.cpu.toFixed(1)}%</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold">1 Core Assigned</span>
          </div>
          <div className="h-1.5 bg-muted w-full overflow-hidden">
            <div className="h-full bg-accent-brand transition-all duration-500" style={{ width: `${metrics.cpu}%` }}/>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Memory Usage" icon={<MemoryStick className="size-3.5"/>}>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold text-accent-brand">{metrics.mem.toFixed(1)} MB</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Limit: 1.0 GB</span>
          </div>
          <div className="h-1.5 bg-muted w-full overflow-hidden">
            <div className="h-full bg-accent-brand transition-all duration-500" style={{ width: `${(metrics.mem / 1024) * 100}%` }}/>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Network I/O" icon={<Network className="size-3.5"/>}>
        <div className="flex flex-col gap-1 py-1">
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-muted-foreground font-semibold">Inbound</span>
            <span className="text-sm font-mono font-bold">{metrics.netIn.toFixed(2)} GB</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-muted-foreground font-semibold">Outbound</span>
            <span className="text-sm font-mono font-bold text-accent-brand">{metrics.netOut.toFixed(2)} GB</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Block I/O" icon={<HardDrive className="size-3.5"/>}>
        <div className="flex flex-col gap-1 py-1">
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-muted-foreground font-semibold">Read</span>
            <span className="text-sm font-mono font-bold">{metrics.ioRead} MB</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-xs text-muted-foreground font-semibold">Write</span>
            <span className="text-sm font-mono font-bold text-accent-brand">{metrics.ioWrite} MB</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Container Info" icon={<Info className="size-3.5"/>}>
        <div className="flex flex-col gap-1.5 py-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-semibold">Short ID</span>
            <span className="font-mono">{container.id.substring(0, 12)}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-semibold">State</span>
            <DockerBadge status={container.status}/>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function DockerConsole({ containerName }: { containerName: string }) {
  const { instance, ref } = useXTerm();
  const commandBuffer = useRef("");

  useEffect(() => {
    if (!instance || !ref.current) return;

    instance.options.theme = { background: "#111210", foreground: "#ffffff", cursor: "#fb923c" };
    const fitAddon = new FitAddon();
    instance.loadAddon(fitAddon);

    const prompt = `\r\n\x1b[38;2;251;146;60mroot@${containerName}\x1b[0m:\x1b[38;2;96;165;250m/app\x1b[0m# `;
    instance.writeln(`\x1b[1m\x1b[38;2;251;146;60mDocker Exec\x1b[0m - Attached to ${containerName}`);
    instance.write(prompt);

    const disposable = instance.onData((data) => {
      const char = data;
      if (char === "\r") {
        const command = commandBuffer.current.trim();
        instance.write("\r\n");

        if (command === "ls")     instance.writeln("app.js  config.json  node_modules  package.json  public  src");
        else if (command === "ps") { instance.writeln("PID   USER     TIME  COMMAND"); instance.writeln("    1 root      0:00 node app.js"); instance.writeln("   42 root      0:00 sh"); }
        else if (command === "whoami") instance.writeln("root");
        else if (command !== "")  instance.writeln(`sh: ${command}: not found`);

        commandBuffer.current = "";
        instance.write(prompt);
      } else if (char === "") {
        if (commandBuffer.current.length > 0) { commandBuffer.current = commandBuffer.current.slice(0, -1); instance.write("\b \b"); }
      } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
        commandBuffer.current += char;
        instance.write(char);
      }
    });

    const resizeObserver = new ResizeObserver(() => { try { fitAddon.fit(); } catch (e) {} });
    resizeObserver.observe(ref.current);
    setTimeout(() => { try { fitAddon.fit(); } catch (e) {} }, 100);

    return () => { disposable.dispose(); resizeObserver.disconnect(); };
  }, [instance, containerName]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#111210] p-1 border border-border">
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

export function DockerTab({ label }: { label: string }) {
  const [containers, setContainers] = useState<DockerContainer[]>(MOCK_CONTAINERS);
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailTab, setDetailTab] = useState<"logs" | "stats" | "console">("logs");

  const selectedContainer = containers.find(c => c.id === selectedId);

  const filtered = containers.filter(c => {
    const matchesSearch  = c.name.toLowerCase().includes(search.toLowerCase()) || c.image.toLowerCase().includes(search.toLowerCase());
    const matchesStatus  = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAction = (id: string, action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (action === "start") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running" as DockerContainerStatus, cpu: 0.5, memory: "12.4 MB" } : c));
      toast.success(`Started container ${container.name}`);
    } else if (action === "stop") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "exited" as DockerContainerStatus, cpu: 0, memory: "0 B" } : c));
      toast.info(`Stopped container ${container.name}`);
    } else if (action === "restart") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "restarting" as DockerContainerStatus } : c));
      toast.promise(new Promise(resolve => setTimeout(resolve, 1500)), {
        loading: `Restarting ${container.name}...`,
        success: () => {
          setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running" as DockerContainerStatus } : c));
          return `Container ${container.name} restarted successfully`;
        },
        error: "Failed to restart container",
      });
    } else if (action === "delete") {
      setContainers(prev => prev.filter(c => c.id !== id));
      toast.error(`Deleted container ${container.name}`);
    } else if (action === "create") {
      const newId = Math.random().toString(36).substring(2, 12);
      setContainers(prev => [{
        id: newId, name: `new-container-${newId.substring(0, 4)}`,
        image: "alpine:latest", status: "created" as DockerContainerStatus,
        cpu: 0, memory: "0 B", ports: [], created: "just now",
      }, ...prev]);
      toast.success("New container created");
    }
  };

  if (view === "detail" && selectedContainer) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("list")} className="size-8 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4"/>
            </Button>
            <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
              <Box className="size-5 text-accent-brand"/>
            </div>
            <div>
              <h1 className="text-2xl font-bold">{selectedContainer.name}</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">{selectedContainer.image}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DockerBadge status={selectedContainer.status}/>
            <Separator orientation="vertical" className="h-8 mx-2"/>
            <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
          </div>
        </Card>

        <div className="flex flex-col flex-1 min-h-0 px-3 py-3 gap-3">
          <div className="flex gap-1 border-b border-border shrink-0">
            {[
              { id: "logs",    label: "Logs",    icon: <List className="size-3.5"/>     },
              { id: "stats",   label: "Stats",   icon: <Activity className="size-3.5"/> },
              { id: "console", label: "Console", icon: <Terminal className="size-3.5"/> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setDetailTab(t.id as any)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                  detailTab === t.id
                    ? "border-b-accent-brand text-foreground bg-accent-brand/5"
                    : "border-b-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {detailTab === "logs"    && <DockerLogViewer containerName={selectedContainer.name}/>}
            {detailTab === "stats"   && <DockerContainerStats container={selectedContainer}/>}
            {detailTab === "console" && <DockerConsole containerName={selectedContainer.name}/>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div className="flex items-center gap-3">
          <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
            <Box className="size-5 text-accent-brand"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-brand"/>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Docker Manager</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
            <Input placeholder="Search containers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8"/>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-8 px-2 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="exited">Exited</option>
          </select>
          <Separator orientation="vertical" className="h-8 mx-1"/>
          <Button variant="outline" size="sm" className="h-8 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand gap-1.5" onClick={(e) => handleAction("", "create", e)}>
            <Plus className="size-3.5"/> New Container
          </Button>
          <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(container => (
              <DockerContainerCard
                key={container.id}
                container={container}
                onSelect={(id) => { setSelectedId(id); setView("detail"); }}
                onAction={handleAction}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
            <Box className="size-16 mb-4"/>
            <span className="text-xl font-bold uppercase tracking-widest">No Containers</span>
            <span className="text-xs font-semibold">No docker containers found matching your filters</span>
          </div>
        )}
      </div>
    </div>
  );
}
