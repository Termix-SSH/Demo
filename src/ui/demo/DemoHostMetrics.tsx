import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  Cpu,
  Gauge,
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
import { TabStrip } from "@/sidebar/HostManagerTabs";
import {
  Facts,
  PANEL,
  PanelShell,
  ViewToggle,
} from "@/components/panel-layout";
import { DataView, type DataColumn } from "@/components/data-view";
import { usePanelView } from "@/hooks/use-panel-view";
import { useAreaPreferences } from "@/contexts/UiPreferencesContext";
import { MiniStat, RadialGauge, Sparkline, StatRow } from "@/components/charts";
import { LineChart } from "@/components/charts/LineChart";
import { getHostMetrics, getMetricsHistory } from "@/demo/demo-api";
import type { DemoHostMetrics as Metrics } from "@/demo/demo-data";
import { UsagePair } from "@/demo/panels/resource-bits";
import { usageColor } from "@/demo/panels/usage-color";
import { CardMasonry } from "@/demo/panels/card-masonry";

// Mirrors the real HostMetricsTab, rebuilt to match DemoProxmox: the same panel
// chrome, the same TabStrip, and the same grid/table toggle. The old version was
// one long masonry of every card at once, which had no way to scan a single kind
// of thing. Resources, Network and System are now separate tabs, and the
// repeating collections render as dense tables in list mode.

const HISTORY_LEN = 30;
const TICK_MS = 1000;

type HistoryTab = "live" | "1h" | "6h" | "24h" | "7d";

const TABS: HistoryTab[] = ["live", "1h", "6h", "24h", "7d"];

type MetricsTab = "resources" | "network" | "system";

const METRICS_TABS = [
  { id: "resources", label: "Resources", icon: <Gauge className="size-3" /> },
  { id: "network", label: "Network", icon: <Network className="size-3" /> },
  { id: "system", label: "System", icon: <Server className="size-3" /> },
];

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function DemoHostMetrics({ host }: { host: Host }) {
  const { columns } = useAreaPreferences("hostMetrics");
  const { view, density, setView, setDensity } = usePanelView("hostMetrics");
  const [tab, setTab] = useState<MetricsTab>("resources");
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

  const shellProps = {
    host,
    onRefresh: refresh,
    isRefreshing,
    tab,
    onTabChange: setTab,
    view,
    density,
    onView: setView,
    onDensity: setDensity,
  };

  if (host.status === "offline") {
    return (
      <MetricsShell {...shellProps} showControls={false}>
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
  const list = view === "list";

  return (
    <MetricsShell {...shellProps}>
      <div className={PANEL.body}>
        {tab === "resources" && (
          <CardMasonry stack={list} columns={columns}>
            {list ? (
              <SectionCard
                title="Resources"
                icon={<Gauge className="size-3.5" />}
              >
                <div className="flex flex-col gap-2 py-2">
                  <UsagePair label="CPU" percent={cpuNow} />
                  <UsagePair label="Memory" percent={memNow} />
                  <UsagePair label="Disk" percent={diskNow} />
                  <div className="divide-y divide-border pt-1">
                    <StatRow
                      label="Cores"
                      value={String(metrics.cpu.cores)}
                    />
                    <StatRow
                      label="Load"
                      value={metrics.cpu.load
                        .map((l) => l.toFixed(2))
                        .join("  ")}
                      mono
                    />
                    <StatRow
                      label="Memory used"
                      value={`${memUsed.toFixed(1)} / ${metrics.memory.totalGiB.toFixed(1)} GiB`}
                      mono
                    />
                    <StatRow
                      label="Disk used"
                      value={`${metrics.disk.usedHuman} / ${metrics.disk.totalHuman}`}
                      mono
                    />
                  </div>
                </div>
              </SectionCard>
            ) : (
              <>
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
                    ["Free", `${(metrics.memory.totalGiB - memUsed).toFixed(1)}G`],
                  ]}
                />
                <GaugeCard
                  hostId={host.id}
                  title="Disk"
                  icon={<HardDrive className="size-3.5" />}
                  percent={diskNow}
                  series={diskSeries}
                  stats={[
                    [
                      "Used",
                      `${metrics.disk.usedHuman}/${metrics.disk.totalHuman}`,
                    ],
                    ["Free", metrics.disk.availableHuman],
                  ]}
                />
              </>
            )}

            <SectionCard title="Processes" icon={<Cpu className="size-3.5" />}>
              <ProcessBody metrics={metrics} list={list} density={density} />
            </SectionCard>

            <SectionCard
              title="Temperature"
              icon={<Thermometer className="size-3.5" />}
            >
              <div className="flex flex-col gap-2 py-2">
                <span
                  className={`text-3xl font-semibold tabular-nums ${usageColor(metrics.temperature.highestCelsius)}`}
                >
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
          </CardMasonry>
        )}

        {tab === "network" && (
          <CardMasonry stack={list} columns={columns}>
            <SectionCard title="Interfaces" icon={<Network className="size-3.5" />}>
              <InterfaceBody metrics={metrics} list={list} density={density} />
            </SectionCard>

            <PortsCard ports={metrics.ports} list={list} density={density} />

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
                  {metrics.firewall.chains} chains, {metrics.firewall.rules}{" "}
                  rules
                </span>
              </div>
            </SectionCard>
          </CardMasonry>
        )}

        {tab === "system" && (
          <CardMasonry stack={list} columns={columns}>
            <SectionCard title="System" icon={<Server className="size-3.5" />}>
              <div className="divide-y divide-border">
                <StatRow label="Hostname" value={metrics.system.hostname} mono />
                <StatRow label="OS" value={metrics.system.os} />
                <StatRow label="Kernel" value={metrics.system.kernel} mono />
                <StatRow label="Arch" value={metrics.system.arch} mono />
                <StatRow label="Address" value={host.ip} mono />
              </div>
            </SectionCard>

            <SectionCard title="Uptime" icon={<Clock className="size-3.5" />}>
              <div className="flex flex-col gap-1 py-3">
                <span className="text-2xl font-bold leading-none text-accent-brand md:text-3xl">
                  {metrics.uptime.formatted}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {metrics.uptime.seconds.toLocaleString()} seconds
                </span>
              </div>
            </SectionCard>

            <SectionCard
              title="Login Stats"
              icon={<UserCheck className="size-3.5" />}
            >
              <LoginBody metrics={metrics} list={list} density={density} />
            </SectionCard>
          </CardMasonry>
        )}
      </div>
    </MetricsShell>
  );
}


type Iface = Metrics["interfaces"][number];
type Proc = Metrics["processes"]["top"][number];
type Login = Metrics["logins"][number];
type Port = Metrics["ports"][number];

const IFACE_COLUMNS: DataColumn<Iface>[] = [
  {
    key: "name",
    header: "Interface",
    width: "minmax(0,1fr)",
    cell: (i) => (
      <span className="flex items-center gap-1.5">
        <span
          className={`size-1.5 shrink-0 rounded-full ${i.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
        />
        <span className="truncate font-medium">{i.name}</span>
      </span>
    ),
  },
  {
    key: "state",
    header: "State",
    width: "70px",
    cell: (i) => (
      <span className="text-[10px] uppercase text-muted-foreground">
        {i.state}
      </span>
    ),
  },
  {
    key: "ip",
    header: "Address",
    width: "minmax(0,1fr)",
    cell: (i) => <span className="truncate font-mono text-[11px]">{i.ip}</span>,
  },
  {
    key: "rx",
    header: "In",
    width: "90px",
    align: "end",
    cell: (i) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {i.rxRate}
      </span>
    ),
  },
  {
    key: "tx",
    header: "Out",
    width: "90px",
    align: "end",
    hideBelow: "md",
    cell: (i) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {i.txRate}
      </span>
    ),
  },
];

function InterfaceBody({
  metrics,
  list,
  density,
}: {
  metrics: Metrics;
  list: boolean;
  density: "comfortable" | "compact";
}) {
  if (metrics.interfaces.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <WifiOff className="size-6 opacity-40" />
        <span className="text-xs text-muted-foreground">No interfaces</span>
      </div>
    );
  }

  if (list) {
    return (
      <div className="py-2">
        <DataView
          items={metrics.interfaces}
          view="list"
          density={density}
          getKey={(i) => i.name}
          columns={{ base: 1 }}
          listColumns={IFACE_COLUMNS}
          renderCard={() => null}
          empty={null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {metrics.interfaces.map((iface) => (
        <div
          key={iface.name}
          className="flex flex-col gap-1 border border-border bg-muted/30 p-2"
        >
          <div className="flex items-center gap-2">
            <span
              className={`size-1.5 rounded-full ${iface.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
            />
            <span className="text-xs font-semibold">{iface.name}</span>
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
      ))}
    </div>
  );
}

const PROC_COLUMNS: DataColumn<Proc>[] = [
  {
    key: "pid",
    header: "PID",
    width: "70px",
    cell: (p) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {p.pid}
      </span>
    ),
  },
  {
    key: "command",
    header: "Command",
    width: "minmax(0,1fr)",
    cell: (p) => <span className="truncate font-mono">{p.command}</span>,
  },
  {
    key: "cpu",
    header: "CPU",
    width: "minmax(0,110px)",
    cell: (p) => <UsagePair percent={p.cpu} />,
  },
  {
    key: "mem",
    header: "Mem",
    width: "minmax(0,110px)",
    hideBelow: "md",
    cell: (p) => <UsagePair percent={p.mem} />,
  },
];

function ProcessBody({
  metrics,
  list,
  density,
}: {
  metrics: Metrics;
  list: boolean;
  density: "comfortable" | "compact";
}) {
  const caption = (
    <span className="py-1.5 text-[11px] text-muted-foreground">
      {metrics.processes.total} total, {metrics.processes.running} running
    </span>
  );

  if (list) {
    return (
      <div className="flex flex-col py-2">
        {caption}
        <DataView
          items={metrics.processes.top}
          view="list"
          density={density}
          getKey={(p) => String(p.pid)}
          columns={{ base: 1 }}
          listColumns={PROC_COLUMNS}
          renderCard={() => null}
          empty={null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col py-1">
      {caption}
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
  );
}

const LOGIN_COLUMNS: DataColumn<Login>[] = [
  {
    key: "user",
    header: "User",
    width: "minmax(0,1fr)",
    cell: (l) => (
      <span className="flex items-center gap-2">
        {l.success ? (
          <UserCheck className="size-3.5 shrink-0 text-accent-brand" />
        ) : (
          <UserX className="size-3.5 shrink-0 text-destructive" />
        )}
        <span className="truncate font-medium">{l.user}</span>
      </span>
    ),
  },
  {
    key: "ip",
    header: "Address",
    width: "minmax(0,1fr)",
    cell: (l) => <span className="truncate font-mono text-[11px]">{l.ip}</span>,
  },
  {
    key: "time",
    header: "Time",
    width: "90px",
    align: "end",
    cell: (l) => (
      <span className="text-[11px] text-muted-foreground">
        {new Date(l.time).toLocaleTimeString()}
      </span>
    ),
  },
];

function LoginBody({
  metrics,
  list,
  density,
}: {
  metrics: Metrics;
  list: boolean;
  density: "comfortable" | "compact";
}) {
  if (list) {
    return (
      <div className="py-2">
        <DataView
          items={metrics.logins}
          view="list"
          density={density}
          getKey={(l) => `${l.user}-${l.time}`}
          columns={{ base: 1 }}
          listColumns={LOGIN_COLUMNS}
          renderCard={() => null}
          empty={null}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {metrics.logins.map((login, i) => (
        <div
          key={i}
          className={`flex items-center justify-between border p-2 ${login.success ? "border-border bg-muted/30" : "border-destructive/30 bg-destructive/5"}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {login.success ? (
              <UserCheck className="size-3.5 shrink-0 text-accent-brand" />
            ) : (
              <UserX className="size-3.5 shrink-0 text-destructive" />
            )}
            <span className="truncate text-xs font-semibold">{login.user}</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {login.ip}
            </span>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {new Date(login.time).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricsShell({
  host,
  onRefresh,
  isRefreshing,
  tab,
  onTabChange,
  view,
  density,
  onView,
  onDensity,
  showControls = true,
  children,
}: {
  host: Host;
  onRefresh: () => void;
  isRefreshing: boolean;
  tab: MetricsTab;
  onTabChange: (next: MetricsTab) => void;
  view: "grid" | "list";
  density: "comfortable" | "compact";
  onView: (next: "grid" | "list") => void;
  onDensity: (next: "comfortable" | "compact") => void;
  showControls?: boolean;
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
      toolbar={
        showControls ? (
          <>
            <TabStrip
              tabs={METRICS_TABS}
              activeTab={tab}
              onTabChange={(id) => onTabChange(id as MetricsTab)}
            />
            <div className="ml-auto flex items-center gap-2">
              <ViewToggle
                view={view}
                onView={onView}
                density={density}
                onDensity={onDensity}
              />
            </div>
          </>
        ) : undefined
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
            <RadialGauge
              value={percent}
              caption={caption}
              size={110}
              colorClassName={usageColor(percent)}
            />
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
          className={`border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
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

const PORT_COLUMNS: DataColumn<Port>[] = [
  {
    key: "port",
    header: "Port",
    width: "70px",
    cell: (p) => (
      <span className="font-mono font-bold tabular-nums text-accent-brand">
        {p.port}
      </span>
    ),
  },
  {
    key: "protocol",
    header: "Proto",
    width: "60px",
    cell: (p) => (
      <span className="font-mono text-[11px] uppercase text-muted-foreground">
        {p.protocol}
      </span>
    ),
  },
  {
    key: "process",
    header: "Process",
    width: "minmax(0,1fr)",
    cell: (p) => <span className="truncate font-mono">{p.process}</span>,
  },
  {
    key: "address",
    header: "Address",
    width: "minmax(0,100px)",
    align: "end",
    hideBelow: "md",
    cell: (p) => (
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {p.address}
      </span>
    ),
  },
];

function PortsCard({
  ports,
  list,
  density,
}: {
  ports: Metrics["ports"];
  list: boolean;
  density: "comfortable" | "compact";
}) {
  const [query, setQuery] = useState("");
  const [protocol, setProtocol] = useState("all");

  const filtered = ports.filter((p) => {
    if (protocol !== "all" && p.protocol !== protocol) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return String(p.port).includes(q) || p.process.toLowerCase().includes(q);
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
            className="h-7 border border-border bg-background px-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All</option>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
          </select>
        </div>
      }
    >
      <div className="py-2">
        {filtered.length === 0 ? (
          <span className="py-3 text-xs italic text-muted-foreground">
            No ports match.
          </span>
        ) : (
          <DataView
            items={filtered}
            view="list"
            density={list ? density : "compact"}
            getKey={(p) => `${p.port}-${p.protocol}`}
            columns={{ base: 1 }}
            listColumns={PORT_COLUMNS}
            renderCard={() => null}
            empty={null}
          />
        )}
      </div>
    </SectionCard>
  );
}
