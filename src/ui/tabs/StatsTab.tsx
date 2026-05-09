import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Check, Cpu, Database, HardDrive, Info, LayoutDashboard, List, MemoryStick,
  Network, RefreshCw, Server, Settings, Shield, ShieldCheck, Unplug, UserCheck, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/ui/shared/SectionCard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const WIDGET_DEFS = [
  { id: "system",    label: "System Info",       description: "Hostname, OS, kernel, uptime"     },
  { id: "cpu",       label: "CPU Usage",         description: "CPU percent, load averages, graph" },
  { id: "memory",    label: "Memory",            description: "RAM usage, swap, cached"           },
  { id: "disk",      label: "Storage",           description: "Disk usage per mount point"        },
  { id: "disk_io",   label: "Disk I/O",          description: "Read/write speeds per device"      },
  { id: "network",   label: "Network",           description: "Interface list and bandwidth"      },
  { id: "processes", label: "Top Processes",     description: "PID, CPU, mem, command"            },
  { id: "logins",    label: "Recent Logins",     description: "Successful and failed login events"},
  { id: "ports",     label: "Listening Ports",   description: "Open ports with process and state" },
  { id: "security",  label: "Security",          description: "Firewall status and policies"      },
] as const;

type WidgetId = typeof WIDGET_DEFS[number]["id"];

function WidgetSettingsDialog({ open, onOpenChange, enabled, onToggle }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enabled: Record<WidgetId, boolean>;
  onToggle: (id: WidgetId) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
              <LayoutDashboard className="size-3.5 text-accent-brand" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-none">Widget Settings</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">Toggle which widgets are visible on this stats view.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border max-h-[60vh] overflow-y-auto">
          {WIDGET_DEFS.map(w => {
            const isOn = enabled[w.id];
            return (
              <button
                key={w.id}
                onClick={() => onToggle(w.id)}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors text-left w-full"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{w.label}</span>
                  <span className="text-xs text-muted-foreground">{w.description}</span>
                </div>
                <div className={`ml-4 shrink-0 size-5 border flex items-center justify-center transition-colors ${isOn ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}>
                  {isOn && <Check className="size-3 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{Object.values(enabled).filter(Boolean).length} of {WIDGET_DEFS.length} widgets enabled</span>
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StatsTab({ label }: { label: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enabled, setEnabled] = useState<Record<WidgetId, boolean>>(
    Object.fromEntries(WIDGET_DEFS.map(w => [w.id, true])) as Record<WidgetId, boolean>
  );

  const generateMetrics = useCallback(() => ({
    cpu: { percent: Math.floor(Math.random() * 60) + 5, cores: 8, load: [Math.random().toFixed(2), Math.random().toFixed(2), Math.random().toFixed(2)] },
    memory: { percent: Math.floor(Math.random() * 40) + 20, totalGiB: 16, usedGiB: 6.4 },
    disk: { percent: Math.floor(Math.random() * 30) + 40, total: "512 GB", used: "210 GB" },
    diskIO: [
      { device: "sda", readMBs: (Math.random() * 50).toFixed(1), writeMBs: (Math.random() * 30).toFixed(1) },
      { device: "sdb", readMBs: (Math.random() * 10).toFixed(1), writeMBs: (Math.random() * 5).toFixed(1)  },
    ],
    uptime: "12d 4h 32m",
    system: {
      hostname: label.toLowerCase().replace(/\s+/g, "-"),
      os: "Ubuntu 22.04.3 LTS",
      kernel: "5.15.0-84-generic",
      arch: "x86_64",
    },
    network: [
      { name: "eth0", ip: "10.0.1.10", state: "UP",   rx: "1.2 GB", tx: "450 MB" },
      { name: "lo",   ip: "127.0.0.1", state: "UP",   rx: "14 MB",  tx: "14 MB"  },
    ],
    processes: [
      { pid: 1234, user: "root",     cpu: 1.2, mem: 0.5, command: "/usr/bin/nginx" },
      { pid: 5678, user: "postgres", cpu: 0.8, mem: 4.2, command: "postgres: writer process" },
      { pid: 9012, user: "deploy",   cpu: 4.5, mem: 1.2, command: "node server.js" },
      { pid: 3456, user: "root",     cpu: 0.1, mem: 0.1, command: "/usr/sbin/sshd" },
    ],
    logins: [
      { user: "admin",  ip: "192.168.1.50", time: "2m ago",  status: "success" },
      { user: "root",   ip: "45.12.33.11",  time: "15m ago", status: "failed"  },
      { user: "deploy", ip: "192.168.1.51", time: "1h ago",  status: "success" },
    ],
    ports: [
      { port: 22,   proto: "tcp", service: "sshd",     pid: 842,  state: "LISTEN" },
      { port: 80,   proto: "tcp", service: "nginx",    pid: 1234, state: "LISTEN" },
      { port: 443,  proto: "tcp", service: "nginx",    pid: 1234, state: "LISTEN" },
      { port: 3000, proto: "tcp", service: "node",     pid: 9012, state: "LISTEN" },
      { port: 5432, proto: "tcp", service: "postgres", pid: 5678, state: "LISTEN" },
    ],
  }), [label]);

  useEffect(() => {
    setMetrics(generateMetrics());
    const interval = setInterval(() => {
      setMetrics((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          cpu:    { ...prev.cpu,    percent: Math.max(5,  Math.min(95, prev.cpu.percent    + (Math.random() * 10 - 5))) },
          memory: { ...prev.memory, percent: Math.max(20, Math.min(90, prev.memory.percent + (Math.random() * 2  - 1))) },
          diskIO: prev.diskIO.map((d: any) => ({ ...d, readMBs: (Math.random() * 50).toFixed(1), writeMBs: (Math.random() * 30).toFixed(1) })),
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [generateMetrics]);

  const refresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setMetrics(generateMetrics());
      setIsRefreshing(false);
      toast.success(`Refreshed stats for ${label}`);
    }, 600);
  };

  const toggleWidget = (id: WidgetId) => setEnabled(prev => ({ ...prev, [id]: !prev[id] }));

  if (!metrics) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <WidgetSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} enabled={enabled} onToggle={toggleWidget} />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
        <Card className="flex-row items-center justify-between px-3 py-3 col-span-full gap-0">
          <div className="flex items-center gap-3">
            <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
              <Server className="size-5 text-accent-brand"/>
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold">{label}</h1>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent-brand"/>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Live Metrics</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0">
            <Button variant="outline" size="default" onClick={refresh} disabled={isRefreshing} className="gap-2 font-semibold">
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}/>
              Refresh
            </Button>
            <Separator orientation="vertical" className="h-8 mx-3"/>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Widget Settings">
              <Settings className="size-4 text-accent-brand"/>
            </Button>
          </div>
        </Card>

        {enabled.system && (
          <SectionCard title="System Info" icon={<Info className="size-3.5"/>}>
            <div className="grid grid-cols-1 gap-y-3 py-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Hostname</span>
                <span className="text-sm font-mono font-semibold">{metrics.system.hostname}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">OS</span>
                <span className="text-sm font-semibold">{metrics.system.os}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Kernel</span>
                <span className="text-sm font-mono text-muted-foreground">{metrics.system.kernel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Architecture</span>
                  <span className="text-sm font-mono">{metrics.system.arch}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Uptime</span>
                  <span className="text-sm font-bold text-accent-brand">{metrics.uptime}</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {enabled.cpu && (
          <SectionCard title="CPU Usage" icon={<Cpu className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-xl md:text-3xl font-bold text-accent-brand">{metrics.cpu.percent.toFixed(1)}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{metrics.cpu.cores} Cores</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Load Avg</span>
                  <div className="text-xs font-mono">{metrics.cpu.load.join("  ")}</div>
                </div>
              </div>
              <div className="h-2 bg-muted w-full overflow-hidden">
                <div className="h-full bg-accent-brand transition-all duration-500" style={{ width: `${metrics.cpu.percent}%` }}/>
              </div>
              <div className="h-16 md:h-20 w-full mt-2 bg-muted/20 border border-border/50 relative overflow-hidden">
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <path
                    d={`M 0 80 Q 20 ${80 - metrics.cpu.percent} 40 70 T 80 60 T 120 ${80 - metrics.cpu.percent * 0.8} T 160 50 T 200 70 T 240 40 T 280 60 T 320 80`}
                    fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-brand/50"
                  />
                </svg>
              </div>
            </div>
          </SectionCard>
        )}

        {enabled.memory && (
          <SectionCard title="Memory" icon={<MemoryStick className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-xl md:text-3xl font-bold text-accent-brand">{metrics.memory.percent.toFixed(1)}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{metrics.memory.usedGiB} / {metrics.memory.totalGiB} GiB</span>
                </div>
              </div>
              <div className="h-2 bg-muted w-full overflow-hidden">
                <div className="h-full bg-accent-brand transition-all duration-500" style={{ width: `${metrics.memory.percent}%` }}/>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="flex flex-col p-2 bg-muted/30 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Swap</span>
                  <span className="text-xs font-semibold">1.2 / 4.0 GiB</span>
                </div>
                <div className="flex flex-col p-2 bg-muted/30 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Cached</span>
                  <span className="text-xs font-semibold">2.4 GiB</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {enabled.disk && (
          <SectionCard title="Storage" icon={<HardDrive className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <span className="text-xl md:text-3xl font-bold text-accent-brand">{metrics.disk.percent}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{metrics.disk.used} / {metrics.disk.total}</span>
                </div>
              </div>
              <div className="h-2 bg-muted w-full overflow-hidden">
                <div className="h-full bg-accent-brand transition-all duration-500" style={{ width: `${metrics.disk.percent}%` }}/>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Filesystem</span>
                  <span className="font-mono">/dev/sda1</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-semibold">Mount Point</span>
                  <span className="font-mono">/</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-muted-foreground font-semibold">Inode Usage</span>
                  <span className="font-mono">12%</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {enabled.disk_io && (
          <SectionCard title="Disk I/O" icon={<Activity className="size-3.5"/>}>
            <div className="flex flex-col gap-2 py-1">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1.5 border-b border-border overflow-x-auto">
                <span>Device</span><span className="text-right">Read MB/s</span><span className="text-right">Write MB/s</span>
              </div>
              {metrics.diskIO.map((d: any) => (
                <div key={d.device} className="grid grid-cols-3 text-xs font-mono py-1 border-b border-border/50 last:border-0">
                  <span className="font-bold text-muted-foreground">/dev/{d.device}</span>
                  <span className="text-right text-accent-brand font-bold">{d.readMBs}</span>
                  <span className="text-right font-semibold">{d.writeMBs}</span>
                </div>
              ))}
              <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2">
                <div className="flex flex-col p-2 bg-muted/30 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Read</span>
                  <span className="text-sm font-bold text-accent-brand">48.2 GB</span>
                </div>
                <div className="flex flex-col p-2 bg-muted/30 border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Write</span>
                  <span className="text-sm font-bold">12.7 GB</span>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {enabled.network && (
          <SectionCard title="Network" icon={<Network className="size-3.5"/>}>
            <div className="flex flex-col gap-2 py-1">
              {metrics.network.map((iface: any) => (
                <div key={iface.name} className="flex flex-col p-2 border border-border bg-muted/30 gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`size-1.5 rounded-full ${iface.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground"}`}/>
                      <span className="text-sm font-bold font-mono">{iface.name}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground uppercase">{iface.state}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                    <span>{iface.ip}</span>
                    <span>↓ {iface.rx} / ↑ {iface.tx}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {enabled.processes && (
          <SectionCard title="Top Processes" icon={<List className="size-3.5"/>}>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1 border-b border-border min-w-0">
                <span>PID</span><span>CPU</span><span>MEM</span><span>CMD</span>
              </div>
              {metrics.processes.map((proc: any) => (
                <div key={proc.pid} className="grid grid-cols-4 text-xs font-mono py-1 border-b border-border/50 last:border-0 min-w-0">
                  <span className="text-muted-foreground">{proc.pid}</span>
                  <span className="text-accent-brand font-bold">{proc.cpu}%</span>
                  <span>{proc.mem}%</span>
                  <span className="truncate font-semibold" title={proc.command}>{proc.command.split("/").pop()}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {enabled.logins && (
          <SectionCard title="Recent Logins" icon={<UserCheck className="size-3.5"/>}>
            <div className="flex flex-col gap-2 py-1">
              {metrics.logins.map((login: any, i: number) => (
                <div key={i} className={`flex items-center justify-between p-2 border ${login.status === "success" ? "border-border bg-muted/30" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      {login.status === "failed"
                        ? <UserX className="size-3 text-destructive"/>
                        : <UserCheck className="size-3 text-accent-brand"/>
                      }
                      <span className={`text-xs font-bold ${login.status === "failed" ? "text-destructive" : ""}`}>{login.user}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{login.ip}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-px border ${login.status === "success" ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10" : "border-destructive/40 text-destructive"}`}>
                      {login.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{login.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {enabled.ports && (
          <SectionCard title="Listening Ports" icon={<Unplug className="size-3.5"/>}>
            <div className="flex flex-col gap-1.5 py-1">
              <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-bold uppercase pb-1 border-b border-border min-w-0">
                <span>Port</span><span>Proto</span><span>Service</span><span className="text-right">PID</span>
              </div>
              {metrics.ports.map((p: any, i: number) => (
                <div key={i} className="grid grid-cols-4 text-xs font-mono py-1 border-b border-border/50 last:border-0 min-w-0">
                  <span className="text-accent-brand font-bold">{p.port}</span>
                  <span className="text-muted-foreground">{p.proto}</span>
                  <span className="font-semibold truncate">{p.service}</span>
                  <span className="text-right text-muted-foreground">{p.pid}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {enabled.security && (
          <SectionCard title="Security" icon={<Shield className="size-3.5"/>}>
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Firewall Status</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 border border-accent-brand/40 bg-accent-brand/10 text-accent-brand text-[10px] font-bold">
                  <ShieldCheck className="size-3"/> ACTIVE
                </div>
              </div>
              <div className="flex flex-col gap-1 bg-muted/30 p-2 border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Default Policy</span>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">Inbound</span>
                  <span className="text-destructive font-bold">DROP</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">Outbound</span>
                  <span className="text-accent-brand font-bold">ACCEPT</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">Fail2Ban</span>
                <span className="text-xs font-bold text-accent-brand">Running</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">AppArmor</span>
                <span className="text-xs font-bold text-accent-brand">Enforcing</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">SELinux</span>
                <span className="text-xs font-bold text-muted-foreground">Disabled</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-semibold">Root Login</span>
                <span className="text-xs font-bold text-destructive">Permitted</span>
              </div>
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  );
}
