import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Box,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Info,
  List,
  MemoryStick,
  Network,
  Pause,
  Play,
  PlayCircle,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/input";
import { Separator } from "@/components/separator";
import { SectionCard } from "@/components/section-card";
import { FakeSwitch } from "@/components/section-card";
import {
  getContainerLogs,
  getContainerStats,
  getDockerContainers,
  getDockerInfo,
} from "@/demo/demo-api";
import type { DemoContainer, DemoContainerStats } from "@/demo/demo-data";

// Mirrors the real DockerManager: a header card over a responsive card grid.
// Clicking a container swaps the whole view for a detail page, exactly as the
// real one does, rather than opening a side panel.

type StateFilter = "all" | "running" | "paused" | "exited" | "restarting";

const BADGE_CLASS: Record<string, string> = {
  running: "border-accent-brand/40 text-accent-brand bg-accent-brand/10",
  paused: "border-yellow-500/40 text-yellow-500 bg-yellow-500/10",
  exited: "border-destructive/40 text-destructive bg-destructive/5",
  restarting: "border-blue-400/40 text-blue-400 bg-blue-400/10",
};

function DockerBadge({ state }: { state: string }) {
  const color = BADGE_CLASS[state] ?? "border-border text-muted-foreground";
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase tracking-wider ${color}`}
    >
      {state}
    </span>
  );
}

export function DemoDocker() {
  const [containers, setContainers] = useState<DemoContainer[]>([]);
  const [info, setInfo] = useState<{ runtime: string; version: string } | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDockerContainers(), getDockerInfo()]).then(
      ([rows, dockerInfo]) => {
        if (cancelled) return;
        setContainers(rows);
        setInfo(dockerInfo);
        setIsLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    setIsRefreshing(true);
    getDockerContainers().then((rows) => {
      setContainers(rows);
      setIsRefreshing(false);
    });
  }

  function setState(id: string, state: DemoContainer["state"], status: string) {
    setContainers((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, state, status, cpu: state === "running" ? c.cpu || 0.4 : 0 }
          : c,
      ),
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return containers.filter((c) => {
      if (stateFilter !== "all" && c.state !== stateFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q)
      );
    });
  }, [containers, query, stateFilter]);

  const selected = containers.find((c) => c.id === selectedId) ?? null;

  if (selected) {
    return (
      <ContainerDetail
        container={selected}
        onBack={() => setSelectedId(null)}
        onSetState={setState}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background h-full">
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
        <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 gap-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
              <Box className="size-5 text-accent-brand" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <h1 className="text-2xl font-bold leading-none">Docker</h1>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent-brand" />
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold truncate">
                  {info ? `${info.runtime} v${info.version}` : "Docker Manager"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-40 md:w-56 hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search containers"
                className="pl-8 h-8"
              />
            </div>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as StateFilter)}
              className="h-8 px-2 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All</option>
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="exited">Exited</option>
              <option value="restarting">Restarting</option>
            </select>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              title="Refresh"
              className="text-accent-brand"
            >
              <RefreshCw
                className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <a
              href="https://docs.termix.site"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center size-9 text-muted-foreground hover:text-foreground transition-colors"
              title="Documentation"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full opacity-40 py-20 gap-3">
            <RefreshCw className="size-8 animate-spin" />
            <span className="text-xs font-semibold">Loading containers…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
            <Box className="size-16 mb-4" />
            <span className="text-xl font-bold uppercase tracking-widest">
              {containers.length === 0
                ? "No containers found"
                : "No containers match filters"}
            </span>
            <span className="text-xs font-semibold mt-1">
              {containers.length === 0
                ? "Start a container on this host to see it here."
                : "Try a different search or status filter."}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((container) => (
              <ContainerCard
                key={container.id}
                container={container}
                onOpen={() => setSelectedId(container.id)}
                onSetState={setState}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContainerCard({
  container,
  onOpen,
  onSetState,
}: {
  container: DemoContainer;
  onOpen: () => void;
  onSetState: (
    id: string,
    state: DemoContainer["state"],
    status: string,
  ) => void;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function act(
    kind: string,
    state: DemoContainer["state"],
    status: string,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    setActing(kind);
    timer.current = setTimeout(() => {
      onSetState(container.id, state, status);
      setActing(null);
    }, 550);
  }

  const running = container.state === "running";
  const paused = container.state === "paused";
  const ports = container.ports ? container.ports.split(", ") : [];

  return (
    <Card
      onClick={onOpen}
      className="flex flex-col overflow-hidden p-0 gap-0 group hover:border-accent-brand/40 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Box
            className={`size-3.5 shrink-0 ${running ? "text-accent-brand" : "text-muted-foreground"}`}
          />
          <span className="text-sm font-bold truncate">{container.name}</span>
        </div>
        <DockerBadge state={container.state} />
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            Image
          </span>
          <span className="text-xs font-mono truncate">{container.image}</span>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            Ports
          </span>
          {ports.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {ports.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="text-[10px] font-mono px-1 border border-border bg-muted/30"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">
              No ports
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border bg-muted/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-muted-foreground italic font-mono">
          {container.id.substring(0, 12)}
        </span>
        <div className="flex items-center gap-0.5">
          {running ? (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Stop"
              className="text-destructive"
              onClick={(e) =>
                act("stop", "exited", "Exited (0) just now", e)
              }
            >
              {acting === "stop" ? <Spinner /> : <Square className="size-3" />}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Start"
              onClick={(e) => act("start", "running", "Up just now", e)}
            >
              {acting === "start" ? <Spinner /> : <Play className="size-3" />}
            </Button>
          )}
          {(running || paused) && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={paused ? "Unpause" : "Pause"}
              onClick={(e) =>
                paused
                  ? act("unpause", "running", "Up just now", e)
                  : act("pause", "paused", "Paused just now", e)
              }
            >
              {acting === "pause" || acting === "unpause" ? (
                <Spinner />
              ) : paused ? (
                <PlayCircle className="size-3" />
              ) : (
                <Pause className="size-3" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Restart"
            disabled={container.state === "exited"}
            onClick={(e) => act("restart", "running", "Up just now", e)}
          >
            {acting === "restart" ? <Spinner /> : <RotateCw className="size-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Remove"
            className="text-destructive"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Spinner() {
  return <RefreshCw className="size-3 animate-spin" />;
}

type DetailTab = "logs" | "stats" | "console";

function ContainerDetail({
  container,
  onBack,
  onSetState,
}: {
  container: DemoContainer;
  onBack: () => void;
  onSetState: (
    id: string,
    state: DemoContainer["state"],
    status: string,
  ) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("logs");

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-background h-full">
      <div className="flex flex-col flex-1 min-h-0 px-3 py-3 gap-3">
        <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 gap-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={onBack} title="Back">
              <ArrowLeft className="size-4" />
            </Button>
            <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
              <Box className="size-5 text-accent-brand" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <h1 className="text-2xl font-bold leading-none truncate">
                {container.name}
              </h1>
              <span className="text-xs font-mono text-muted-foreground truncate">
                {container.image}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DockerBadge state={container.state} />
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant="ghost"
              size="icon"
              className="text-accent-brand"
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </Card>

        <div className="flex gap-1 border-b border-border shrink-0">
          <TabButton
            active={tab === "logs"}
            onClick={() => setTab("logs")}
            icon={<List className="size-4" />}
            label="Logs"
          />
          <TabButton
            active={tab === "stats"}
            onClick={() => setTab("stats")}
            icon={<Activity className="size-4" />}
            label="Stats"
          />
          <TabButton
            active={tab === "console"}
            onClick={() => setTab("console")}
            icon={<TerminalIcon className="size-4" />}
            label="Console"
          />
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          {tab === "logs" && <LogViewer container={container} />}
          {tab === "stats" && <ContainerStats container={container} />}
          {tab === "console" && (
            <ConsolePlaceholder container={container} onSetState={onSetState} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
        active
          ? "border-b-accent-brand text-foreground bg-accent-brand/5"
          : "border-b-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function logColor(line: string): string {
  if (line.includes("ERROR")) return "text-destructive";
  if (line.includes("WARN")) return "text-yellow-400/90";
  if (line.includes("DEBUG")) return "text-muted-foreground/60";
  return "text-foreground/90";
}

function LogViewer({ container }: { container: DemoContainer }) {
  const [lines, setLines] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [timestamps, setTimestamps] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tail, setTail] = useState("100");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getContainerLogs(container.id).then((rows) => {
      if (cancelled) return;
      setLines(rows);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [container.id]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = q
      ? lines.filter((l) => l.toLowerCase().includes(q))
      : lines;
    const limit = tail === "all" ? rows.length : Number(tail);
    return rows.slice(-limit);
  }, [lines, filter, tail]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <div className="flex items-center justify-between bg-card border border-border px-3 py-2 gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <FakeSwitch checked={autoRefresh} onChange={setAutoRefresh} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Auto Refresh
          </span>
          <Separator orientation="vertical" className="h-5 mx-1" />
          <FakeSwitch checked={timestamps} onChange={setTimestamps} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Timestamps
          </span>
          <Separator orientation="vertical" className="h-5 mx-1" />
          <select
            value={tail}
            onChange={(e) => setTail(e.target.value)}
            className="h-7 px-2 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
            <option value="all">All</option>
          </select>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {visible.length}/{lines.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative w-40">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter"
              className="pl-8 h-7 text-xs"
            />
          </div>
          <Button variant="ghost" size="icon-sm" title="Refresh">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Download">
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Clear"
            onClick={() => setLines([])}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-muted border border-border p-3 overflow-auto font-mono text-xs leading-relaxed min-h-0">
        {isLoading ? (
          <span className="text-muted-foreground italic">Loading logs…</span>
        ) : visible.length === 0 ? (
          <span className="text-muted-foreground italic">
            {filter ? `No logs matching "${filter}"` : "No logs available"}
          </span>
        ) : (
          visible.map((line, i) => {
            const split = line.indexOf(" ");
            const stamp = line.slice(0, split);
            const rest = line.slice(split + 1);
            return (
              <div key={i} className="whitespace-pre-wrap break-all">
                {timestamps && (
                  <span className="text-accent-brand/50">{stamp} </span>
                )}
                <span className={logColor(line)}>{rest}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ContainerStats({ container }: { container: DemoContainer }) {
  const [stats, setStats] = useState<DemoContainerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getContainerStats(container.id).then((s) => {
      if (cancelled) return;
      setStats(s ?? null);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [container.id]);

  if (container.state !== "running") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
        <Activity className="size-16 opacity-20" />
        <span className="text-sm font-semibold">Container not running</span>
        <span className="text-xs text-muted-foreground">
          Start the container to collect live stats.
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 opacity-40">
        <RefreshCw className="size-6 animate-spin" />
        <span className="text-xs font-semibold">Loading stats…</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No stats available
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <SectionCard title="CPU Usage" icon={<Cpu className="size-3.5" />}>
          <div className="flex flex-col gap-2 py-2">
            <span className="text-3xl font-bold text-accent-brand tabular-nums">
              {stats.cpuPercent.toFixed(1)}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Current
            </span>
            <Meter percent={stats.cpuPercent} />
          </div>
        </SectionCard>

        <SectionCard
          title="Memory Usage"
          icon={<MemoryStick className="size-3.5" />}
        >
          <div className="flex flex-col gap-2 py-2">
            <span className="text-3xl font-bold text-accent-brand tabular-nums">
              {stats.memoryPercent}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {stats.memoryUsed} / {stats.memoryLimit}
            </span>
            <Meter percent={stats.memoryPercent} />
          </div>
        </SectionCard>

        <SectionCard title="Network IO" icon={<Network className="size-3.5" />}>
          <div className="flex flex-col py-2">
            <Row label="Input" value={stats.netInput} />
            <Row label="Output" value={stats.netOutput} accent />
          </div>
        </SectionCard>

        <SectionCard title="Block IO" icon={<HardDrive className="size-3.5" />}>
          <div className="flex flex-col py-2">
            <Row label="Read" value={stats.blockRead} />
            <Row label="Write" value={stats.blockWrite} accent />
            <Row label="PIDs" value={String(stats.pids)} />
          </div>
        </SectionCard>

        <SectionCard
          title="Container Information"
          icon={<Info className="size-3.5" />}
        >
          <div className="flex flex-col py-2">
            <Row label="Name" value={container.name} />
            <Row label="ID" value={container.id.substring(0, 12)} />
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="shrink-0 text-muted-foreground">State</span>
              <DockerBadge state={container.state} />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Meter({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 bg-muted w-full overflow-hidden">
      <div
        className="h-full bg-accent-brand transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`min-w-0 truncate text-right font-mono font-semibold ${accent ? "text-accent-brand" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ConsolePlaceholder({
  container,
  onSetState,
}: {
  container: DemoContainer;
  onSetState: (
    id: string,
    state: DemoContainer["state"],
    status: string,
  ) => void;
}) {
  if (container.state !== "running") {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
        <TerminalIcon className="size-16 opacity-20" />
        <span className="text-sm font-semibold">Container not running</span>
        <span className="text-xs text-muted-foreground">
          Start the container to access its console.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            onSetState(container.id, "running", "Up just now")
          }
        >
          <Play className="size-3" />
          Start container
        </Button>
      </div>
    );
  }

  return (
    <Card className="flex flex-col flex-1 min-h-0 p-0 gap-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 gap-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="size-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Shell
          </span>
          <select
            className="h-7 px-2 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
            defaultValue="bash"
          >
            <option value="bash">bash</option>
            <option value="sh">sh</option>
            <option value="ash">ash</option>
          </select>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Power className="size-3" />
          Connect
        </Button>
      </div>
      <div className="flex flex-col items-center justify-center flex-1 gap-2 bg-muted/30 text-center">
        <TerminalIcon className="size-10 opacity-20" />
        <span className="text-sm font-semibold">Not connected</span>
        <span className="text-xs text-muted-foreground max-w-xs">
          Attaching a shell to a container is not part of this demo.
        </span>
      </div>
    </Card>
  );
}
