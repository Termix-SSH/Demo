import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Cpu, Database, HardDrive, Info, List, MemoryStick,
  Network, RefreshCw, Server, Settings, Shield, ShieldCheck, UserCheck, UserX,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/ui/shared/SectionCard";

export function StatsTab({ label }: { label: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const generateMetrics = useCallback(() => ({
    cpu: { percent: Math.floor(Math.random() * 60) + 5, cores: 8, load: [Math.random().toFixed(2), Math.random().toFixed(2), Math.random().toFixed(2)] },
    memory: { percent: Math.floor(Math.random() * 40) + 20, totalGiB: 16, usedGiB: 6.4 },
    disk: { percent: Math.floor(Math.random() * 30) + 40, total: "512 GB", used: "210 GB" },
    uptime: "12d 4h 32m",
    system: { hostname: label.toLowerCase().replace(/\s+/g, "-"), os: "Ubuntu 22.04.3 LTS", kernel: "5.15.0-84-generic" },
    network: [
      { name: "eth0", ip: "10.0.1.10", state: "UP" },
      { name: "lo",   ip: "127.0.0.1", state: "UP" },
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

  if (!metrics) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div className="flex items-center gap-3">
          <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
            <Server className="size-5 text-accent-brand"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-brand"/>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Metrics</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0">
          <Button variant="outline" size="default" onClick={refresh} disabled={isRefreshing} className="gap-2 font-semibold">
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}/>
            Refresh
          </Button>
          <Separator orientation="vertical" className="h-8 mx-3"/>
          <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto px-3 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Uptime</span>
              <span className="text-sm font-bold text-accent-brand">{metrics.uptime}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="CPU Usage" icon={<Cpu className="size-3.5"/>}>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-accent-brand">{metrics.cpu.percent.toFixed(1)}%</span>
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
            <div className="h-20 w-full mt-2 bg-muted/20 border border-border/50 relative overflow-hidden">
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                <path
                  d={`M 0 80 Q 20 ${80 - metrics.cpu.percent} 40 70 T 80 60 T 120 ${80 - metrics.cpu.percent * 0.8} T 160 50 T 200 70 T 240 40 T 280 60 T 320 80`}
                  fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-brand/50"
                />
              </svg>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Memory" icon={<MemoryStick className="size-3.5"/>}>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-accent-brand">{metrics.memory.percent.toFixed(1)}%</span>
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

        <SectionCard title="Storage" icon={<HardDrive className="size-3.5"/>}>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-accent-brand">{metrics.disk.percent}%</span>
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
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Network" icon={<Network className="size-3.5"/>}>
          <div className="flex flex-col gap-2 py-1">
            {metrics.network.map((iface: any) => (
              <div key={iface.name} className="flex items-center justify-between p-2 border border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className={`size-1.5 rounded-full ${iface.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground"}`}/>
                  <span className="text-sm font-bold font-mono">{iface.name}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{iface.ip}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-border flex justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">RX</span>
                <span className="text-xs font-mono font-bold">1.2 GB</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">TX</span>
                <span className="text-xs font-mono font-bold">450 MB</span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Top Processes" icon={<List className="size-3.5"/>}>
          <div className="flex flex-col gap-1.5 py-1">
            <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1 border-b border-border">
              <span>PID</span><span>CPU</span><span>MEM</span><span>CMD</span>
            </div>
            {metrics.processes.map((proc: any) => (
              <div key={proc.pid} className="grid grid-cols-4 text-xs font-mono py-1 border-b border-border/50 last:border-0">
                <span className="text-muted-foreground">{proc.pid}</span>
                <span className="text-accent-brand font-bold">{proc.cpu}%</span>
                <span>{proc.mem}%</span>
                <span className="truncate font-semibold" title={proc.command}>{proc.command.split("/").pop()}</span>
              </div>
            ))}
          </div>
        </SectionCard>

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
                <span className="text-[10px] text-muted-foreground uppercase font-bold">{login.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>

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
          </div>
        </SectionCard>

        <SectionCard title="Listening Ports" icon={<Database className="size-3.5"/>}>
          <div className="flex flex-col gap-1.5 py-1">
            <div className="grid grid-cols-3 text-[10px] text-muted-foreground font-bold uppercase pb-1 border-b border-border">
              <span>Port</span><span>Proto</span><span>Service</span>
            </div>
            {[
              { port: 22,   proto: "tcp", service: "sshd"     },
              { port: 80,   proto: "tcp", service: "nginx"    },
              { port: 443,  proto: "tcp", service: "nginx"    },
              { port: 5432, proto: "tcp", service: "postgres" },
            ].map((p, i) => (
              <div key={i} className="grid grid-cols-3 text-xs font-mono py-1 border-b border-border/50 last:border-0">
                <span className="text-accent-brand font-bold">{p.port}</span>
                <span className="text-muted-foreground">{p.proto}</span>
                <span className="font-semibold">{p.service}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
