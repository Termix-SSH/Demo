import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Thermometer,
  Unplug,
  UserCheck,
  UserX,
  WifiOff,
} from "lucide-react";
import type { Host } from "@/types/ui-types";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { SectionCard } from "@/components/section-card";
import { Facts, PANEL, PanelShell } from "@/components/panel-layout";
import { useAreaPreferences } from "@/contexts/UiPreferencesContext";
import { MiniStat, RadialGauge, Sparkline, StatRow } from "@/components/charts";
import { LineChart } from "@/components/charts/LineChart";
import { getHostMetrics, getMetricsHistory } from "@/demo/demo-api";
import type { DemoHostMetrics as Metrics } from "@/demo/demo-data";

// Mirrors the real HostMetricsTab on the shared panel chrome: a masonry of
// cards built from the shared chart primitives. Column count comes from the
// hostMetrics preference, so Simple gets one column and Advanced four. The real
// view also lets you drag, resize and add cards.

const HISTORY_LEN = 30;
const TICK_MS = 1000;

type HistoryTab = "live" | "1h" | "6h" | "24h" | "7d";

const TABS: HistoryTab[] = ["live", "1h", "6h", "24h", "7d"];

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** CSS multi-column, since these cards are genuinely ragged in height. */
const COLUMN_CLASS: Record<number, string> = {
  1: "columns-1",
  2: "columns-1 md:columns-2",
  3: "columns-1 md:columns-2 lg:columns-3",
  4: "columns-1 md:columns-2 lg:columns-3 xl:columns-4",
};

export function DemoHostMetrics({ host }: { host: Host }) {
  const { columns } = useAreaPreferences("hostMetrics");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Live series, pushed each tick so the gauges and sparklines move.
  const [cpuSeries, setCpuSeries] = useState<number[]>([]);
  const [memSeries, setMemSeries] = useState<number[]>([]);
  const [diskSeries, setDiskSeries] = useState<number[]>([]);
  const drift = useRef({ cpu: 0, mem: 0, disk: 0 });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getHostMetrics(host.id).then((data) => {
      if (cancelled) return;
      const base = {
        ...data,
        cpu: { ...data.cpu, percent: host.cpu ?? data.cpu.percent },
        memory: { ...data.memory, percent: host.ram ?? data.memory.percent },
        system: { ...data.system, hostname: host.name },
      };
      setMetrics(base);
      drift.current = {
        cpu: base.cpu.percent,
        mem: base.memory.percent,
        disk: base.disk.percent,
      };
      setCpuSeries(
        Array.from({ length: HISTORY_LEN }, () =>
          clamp(base.cpu.percent + rand(-8, 8), 0, 100),
        ),
      );
      setMemSeries(
        Array.from({ length: HISTORY_LEN }, () =>
          clamp(base.memory.percent + rand(-4, 4), 0, 100),
        ),
      );
      setDiskSeries(
        Array.from({ length: HISTORY_LEN }, () =>
          clamp(base.disk.percent + rand(-1, 1), 0, 100),
        ),
      );
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [host.id, host.cpu, host.ram, host.name]);

  useEffect(() => {
    if (isLoading || host.status === "offline") return;
    const id = setInterval(() => {
      const d = drift.current;
      d.cpu = clamp(d.cpu + rand(-6, 6), 2, 98);
      d.mem = clamp(d.mem + rand(-2, 2), 10, 96);
      d.disk = clamp(d.disk + rand(-0.4, 0.4), 5, 99);
      setCpuSeries((prev) => [...prev.slice(1), d.cpu]);
      setMemSeries((prev) => [...prev.slice(1), d.mem]);
      setDiskSeries((prev) => [...prev.slice(1), d.disk]);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [isLoading, host.status]);

  function refresh() {
    setIsRefreshing(true);
    getHostMetrics(host.id).then(() => setIsRefreshing(false));
  }

  if (host.status === "offline") {
    return (
      <MetricsShell host={host} onRefresh={refresh} isRefreshing={isRefreshing}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Server className="size-10 opacity-30" />
          <p className="text-sm font-semibold">Server offline</p>
          <p className="text-xs text-muted-foreground">
            The host did not respond to the last check.
          </p>
        </div>
      </MetricsShell>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <RefreshCw className="size-5 animate-spin text-muted-foreground opacity-40" />
      </div>
    );
  }

  const cpuNow = cpuSeries[cpuSeries.length - 1] ?? metrics.cpu.percent;
  const memNow = memSeries[memSeries.length - 1] ?? metrics.memory.percent;
  const diskNow = diskSeries[diskSeries.length - 1] ?? metrics.disk.percent;
  const memUsed = (metrics.memory.totalGiB * memNow) / 100;

  return (
    <MetricsShell host={host} onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className={PANEL.body}>
        {/* Masonry via CSS columns so cards pack against each other instead of
            leaving a stranded column beside the wider ones. */}
        <div
          className={`${COLUMN_CLASS[columns] ?? COLUMN_CLASS[3]} gap-2 [&>*]:mb-2 [&>*]:break-inside-avoid`}
        >
          <GaugeCard
            hostId={host.id}
            title="CPU"
            icon={<Cpu className="size-3.5" />}
            percent={cpuNow}
            series={cpuSeries}
            caption={`${metrics.cpu.cores} cores`}
            stats={[
              ["1 min", metrics.cpu.load[0].toFixed(2)],
              ["5 min", metrics.cpu.load[1].toFixed(2)],
              ["15 min", metrics.cpu.load[2].toFixed(2)],
            ]}
          />

          <GaugeCard
            hostId={host.id}
            title="Memory"
            icon={<MemoryStick className="size-3.5" />}
            percent={memNow}
            series={memSeries}
            stats={[
              [
                "Used",
                `${memUsed.toFixed(1)}/${metrics.memory.totalGiB.toFixed(1)}G`,
              ],
              [
                "Free",
                `${(metrics.memory.totalGiB - memUsed).toFixed(1)}G`,
              ],
            ]}
          />

          <GaugeCard
            hostId={host.id}
            title="Disk"
            icon={<HardDrive className="size-3.5" />}
            percent={diskNow}
            series={diskSeries}
            stats={[
              ["Used", `${metrics.disk.usedHuman}/${metrics.disk.totalHuman}`],
              ["Free", metrics.disk.availableHuman],
            ]}
          />

          <SectionCard title="Network" icon={<Network className="size-3.5" />}>
            <div className="flex flex-col gap-2 py-2">
              {metrics.interfaces.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <WifiOff className="size-6 opacity-40" />
                  <span className="text-xs text-muted-foreground">
                    No interfaces
                  </span>
                </div>
              ) : (
                metrics.interfaces.map((iface) => (
                  <div
                    key={iface.name}
                    className="flex flex-col gap-1 border border-border bg-muted/30 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${iface.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
                      />
                      <span className="text-xs font-semibold">
                        {iface.name}
                      </span>
                      <span className="border border-border px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">
                        {iface.state}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {iface.ip}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                      <span>↓ {iface.rxRate}</span>
                      <span>↑ {iface.txRate}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Uptime" icon={<Clock className="size-3.5" />}>
            <div className="flex flex-col gap-1 py-3">
              <span className="text-2xl font-bold leading-none text-accent-brand md:text-3xl">
                {metrics.uptime.formatted}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {metrics.uptime.seconds.toLocaleString()} seconds
              </span>
            </div>
          </SectionCard>

          <SectionCard title="System" icon={<Server className="size-3.5" />}>
            <div className="divide-y divide-border">
              <StatRow label="Hostname" value={metrics.system.hostname} mono />
              <StatRow label="OS" value={metrics.system.os} />
              <StatRow label="Kernel" value={metrics.system.kernel} mono />
              <StatRow label="Arch" value={metrics.system.arch} mono />
              <StatRow label="Address" value={host.ip} mono />
            </div>
          </SectionCard>

          <SectionCard
            title="Login Stats"
            icon={<UserCheck className="size-3.5" />}
          >
            <div className="flex flex-col gap-1.5 py-2">
              {metrics.logins.map((login, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between border p-2 ${login.success ? "border-border bg-muted/30" : "border-destructive/30 bg-destructive/5"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {login.success ? (
                      <UserCheck className="size-3.5 shrink-0 text-accent-brand" />
                    ) : (
                      <UserX className="size-3.5 shrink-0 text-destructive" />
                    )}
                    <span className="text-xs font-semibold truncate">
                      {login.user}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                      {login.ip}
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(login.time).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Processes" icon={<Cpu className="size-3.5" />}>
            <div className="flex flex-col py-1">
              <span className="py-1.5 text-[11px] text-muted-foreground">
                {metrics.processes.total} total, {metrics.processes.running}{" "}
                running
              </span>
              <div className="divide-y divide-border">
                {metrics.processes.top.map((proc) => (
                  <StatRow
                    key={proc.pid}
                    label={
                      <span className="font-mono">
                        {proc.pid} {proc.command}
                      </span>
                    }
                    value={
                      <Facts className="justify-end">
                        <span>{proc.cpu}% cpu</span>
                        <span>{proc.mem}% mem</span>
                      </Facts>
                    }
                  />
                ))}
              </div>
            </div>
          </SectionCard>

          <PortsCard ports={metrics.ports} />

          <SectionCard
            title="Firewall"
            icon={<ShieldCheck className="size-3.5" />}
          >
            <div className="flex flex-col gap-1 py-3">
              <Facts
                className={`text-xs font-semibold uppercase tracking-wide ${metrics.firewall.status === "active" ? "text-accent-brand" : "text-muted-foreground"}`}
              >
                <span>{metrics.firewall.status}</span>
                <span>{metrics.firewall.type}</span>
              </Facts>
              <span className="text-[11px] text-muted-foreground">
                {metrics.firewall.chains} chains, {metrics.firewall.rules} rules
              </span>
            </div>
          </SectionCard>

          <SectionCard
            title="Temperature"
            icon={<Thermometer className="size-3.5" />}
          >
            <div className="flex flex-col gap-2 py-2">
              <span className="text-3xl font-semibold tabular-nums">
                {metrics.temperature.highestCelsius.toFixed(1)}°C
              </span>
              <div className="divide-y divide-border">
                {metrics.temperature.sensors.map((sensor) => (
                  <StatRow
                    key={sensor.label}
                    label={sensor.label}
                    value={`${sensor.celsius.toFixed(1)}°C`}
                  />
                ))}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </MetricsShell>
  );
}

function MetricsShell({
  host,
  onRefresh,
  isRefreshing,
  children,
}: {
  host: Host;
  onRefresh: () => void;
  isRefreshing: boolean;
  children: React.ReactNode;
}) {
  return (
    <PanelShell
      icon={<Server className="size-4" />}
      title={host.name}
      status={`${host.username}@${host.ip}:${host.port}`}
      actions={
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          title="Refresh"
          className="text-accent-brand"
        >
          <RefreshCw
            className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      }
    >
      {children}
    </PanelShell>
  );
}

function GaugeCard({
  hostId,
  title,
  icon,
  percent,
  series,
  caption,
  stats,
}: {
  hostId: string;
  title: string;
  icon: React.ReactNode;
  percent: number;
  series: number[];
  caption?: string;
  stats: [string, string][];
}) {
  const [tab, setTab] = useState<HistoryTab>("live");
  const [history, setHistory] = useState<number[] | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (tab === "live") return;
    let cancelled = false;
    setIsLoadingHistory(true);
    getMetricsHistory(hostId, tab).then((data) => {
      if (cancelled) return;
      setHistory(data);
      setIsLoadingHistory(false);
    });
    return () => {
      cancelled = true;
    };
  }, [hostId, tab]);

  const timestamps = useMemo(() => {
    if (!history) return [];
    const step = tab === "1h" ? 60_000 : tab === "6h" ? 300_000 : 900_000;
    const end = Date.now();
    return history.map((_, i) =>
      new Date(end - (history.length - 1 - i) * step).toISOString(),
    );
  }, [history, tab]);

  return (
    <SectionCard
      title={title}
      icon={icon}
      action={<CardTimeTabs value={tab} onChange={setTab} />}
    >
      <div className="py-2">
        {tab === "live" ? (
          <div className="flex items-center gap-4">
            <RadialGauge value={percent} caption={caption} size={110} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {stats.map(([label, value]) => (
                  <MiniStat key={label} caption={label} value={value} />
                ))}
              </div>
              <Sparkline data={series} domain={[0, 100]} height={48} />
            </div>
          </div>
        ) : isLoadingHistory || !history ? (
          <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : (
          <LineChart
            height={160}
            domain={[0, 100]}
            timestamps={timestamps}
            yFormatter={(v) => `${v.toFixed(0)}%`}
            series={[
              {
                key: title.toLowerCase(),
                label: title,
                color: "var(--accent-brand)",
                data: history,
              },
            ]}
          />
        )}
      </div>
    </SectionCard>
  );
}

function CardTimeTabs({
  value,
  onChange,
}: {
  value: HistoryTab;
  onChange: (next: HistoryTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors border ${
            value === tab
              ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function PortsCard({ ports }: { ports: Metrics["ports"] }) {
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("all");

  const filtered = ports.filter((p) => {
    if (protocol !== "all" && p.protocol !== protocol) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      String(p.port).includes(q) || p.process.toLowerCase().includes(q)
    );
  });

  return (
    <SectionCard
      title="Listening Ports"
      icon={<Unplug className="size-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter"
              className="h-7 w-28 pl-6 text-xs"
            />
          </div>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="h-7 px-1.5 text-[11px] bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All</option>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
      }
    >
      <div className="flex flex-col py-2">
        <div className="grid grid-cols-[3.5rem_3rem_1fr_4rem] gap-2 border-b border-border pb-1 text-[10px] font-bold uppercase text-muted-foreground">
          <span>Port</span>
          <span>Proto</span>
          <span>Process</span>
          <span className="text-right">Addr</span>
        </div>
        {filtered.length === 0 ? (
          <span className="py-3 text-xs italic text-muted-foreground">
            No ports match.
          </span>
        ) : (
          filtered.map((port) => (
            <div
              key={`${port.port}-${port.protocol}`}
              className="grid grid-cols-[3.5rem_3rem_1fr_4rem] gap-2 overflow-hidden border-b border-border/50 py-1 font-mono text-xs last:border-0"
            >
              <span className="font-bold text-accent-brand">{port.port}</span>
              <span className="uppercase text-muted-foreground">
                {port.protocol}
              </span>
              <span className="truncate">{port.process}</span>
              <span className="truncate text-right text-muted-foreground">
                {port.address}
              </span>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
