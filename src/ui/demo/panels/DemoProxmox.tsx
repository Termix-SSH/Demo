import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Clock,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { StatRow } from "@/components/charts";
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
import { getProxmoxStats, type DemoProxmoxSnapshot } from "@/demo/demo-api";
import type { DemoProxmoxNode } from "@/demo/demo-data";

// Mirrors the real ProxmoxStatsTab on the shared panel chrome: node tile strip,
// then the guests as a table or a card grid, then the network/storage/cluster
// row.

function barColor(percent: number | null): string {
  if (percent === null) return "bg-muted-foreground/30";
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-warning";
  return "bg-accent-brand";
}

export function DemoProxmox() {
  const [snapshot, setSnapshot] = useState<DemoProxmoxSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProxmoxStats().then((data) => {
      if (cancelled) return;
      setSnapshot(data);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    setIsRefreshing(true);
    getProxmoxStats().then((data) => {
      setSnapshot(data);
      setIsRefreshing(false);
    });
  }

  if (isLoading || !snapshot) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <RefreshCw className="size-5 animate-spin text-muted-foreground opacity-40" />
      </div>
    );
  }

  const node = snapshot.nodes[0];

  return (
    <PanelShell
      icon={<Server className="size-4" />}
      title={snapshot.cluster.clustered ? snapshot.cluster.name : node.name}
      status={`${node.hostname} ${node.pveVersion}`}
      actions={
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
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      <div className="shrink-0">
        <NodeSummaryStrip nodes={snapshot.nodes} />
      </div>

      <GuestTable guests={snapshot.guests} />

      <div className={`grid shrink-0 grid-cols-1 md:grid-cols-3 ${PANEL.gap}`}>
        <SectionCard
          title="Network Interfaces"
          icon={<Network className="size-3.5" />}
        >
          <div className="divide-y divide-border">
            {snapshot.interfaces.map((iface) => (
              <StatRow
                key={iface.name}
                label={
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${iface.state === "UP" ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
                    />
                    {iface.name}
                  </span>
                }
                value={iface.address}
                mono
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Storage Pools"
          icon={<Database className="size-3.5" />}
        >
          <div className="flex flex-col gap-2.5 py-2">
            {snapshot.storage.map((pool) => (
              <div key={pool.name} className="flex flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-medium">
                    {pool.name}
                  </span>
                  <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {pool.type}
                  </span>
                  {!pool.active && (
                    <span className="shrink-0 text-[10px] italic text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden bg-muted">
                    <div
                      className={`h-full transition-all ${barColor(pool.percent)}`}
                      style={{ width: `${pool.percent}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {pool.usedGiB} / {pool.totalGiB} GiB
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {snapshot.cluster.clustered && (
          <SectionCard
            title="Cluster Health"
            icon={<Network className="size-3.5" />}
          >
            <div className="flex flex-col py-2">
              <div className="flex items-center gap-2 pb-2">
                <span className="text-xs font-medium">
                  {snapshot.cluster.name}
                </span>
                <span
                  className={`size-1.5 shrink-0 rounded-full ${snapshot.cluster.quorate ? "bg-accent-brand" : "bg-destructive"}`}
                />
                <span className="text-[11px] text-muted-foreground">
                  {snapshot.cluster.quorate ? "Quorate" : "Not quorate"}
                </span>
              </div>
              <div className="divide-y divide-border">
                {snapshot.cluster.members.map((member) => (
                  <StatRow
                    key={member.name}
                    label={
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${member.online ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
                        />
                        {member.name}
                      </span>
                    }
                    value={member.online ? "Online" : "Offline"}
                  />
                ))}
              </div>
            </div>
          </SectionCard>
        )}
      </div>
    </PanelShell>
  );
}

function NodeSummaryStrip({ nodes }: { nodes: DemoProxmoxNode[] }) {
  const node = nodes[0];
  return (
    <div className="flex flex-wrap gap-2">
      <Tile
        icon={<Cpu className="size-3.5" />}
        label="CPU"
        percent={node.cpuPercent}
        detail={`${node.name}`}
        history={node.cpuHistory}
      />
      <Tile
        icon={<MemoryStick className="size-3.5" />}
        label="Memory"
        percent={node.memoryPercent}
        detail={node.memoryDetail}
        history={node.memoryHistory}
      />
      <Tile
        icon={<HardDrive className="size-3.5" />}
        label="Disk"
        percent={node.diskPercent}
        detail={node.diskDetail}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2 border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="size-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Uptime
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums">{node.uptime}</span>
        </div>
        <Facts className="text-[11px] text-muted-foreground">
          <span className="truncate">{node.hostname}</span>
          <span className="shrink-0">{node.pveVersion}</span>
        </Facts>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  percent,
  detail,
  history,
}: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  detail: string;
  history?: number[];
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{percent}%</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {detail}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden bg-muted">
        <div
          className={`h-full transition-all ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {history && history.length > 1 && (
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="h-5 w-full text-accent-brand/70"
          aria-hidden="true"
        >
          <polyline
            points={history
              .map((v, i) => {
                const x = (i / (history.length - 1)) * 100;
                const y = 24 - (Math.min(100, Math.max(0, v)) / 100) * 24;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

type TypeFilter = "all" | "qemu" | "lxc";
type StatusFilter = "all" | "running" | "stopped";

function GuestTable({
  guests,
}: {
  guests: DemoProxmoxSnapshot["guests"];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { view, density, setView, setDensity } = usePanelView("proxmox");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((g) => {
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || String(g.vmid).includes(q);
    });
  }, [guests, query, typeFilter, statusFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Guests
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} of {guests.length}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder="Search guests"
            className="w-40"
          />
          <Segmented<TypeFilter>
            value={typeFilter}
            onChange={setTypeFilter}
            options={TYPE_FILTERS}
          />
          <Segmented<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS}
          />
          <ViewToggle
            view={view}
            onView={setView}
            density={density}
            onDensity={setDensity}
          />
        </div>
      </div>

      <DataView
        items={filtered}
        view={view}
        density={density}
        getKey={(g) => String(g.vmid)}
        columns={{ base: 1, md: 2, xl: 3 }}
        listColumns={GUEST_COLUMNS}
        renderCard={(guest) => <GuestCard guest={guest} />}
        empty={
          <EmptyState
            icon={Server}
            title={guests.length === 0 ? "No guests" : "Nothing matches those filters"}
            hint="Try a different search or filter."
          />
        }
      />
    </div>
  );
}

type Guest = DemoProxmoxSnapshot["guests"][number];

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "qemu", label: "VM" },
  { value: "lxc", label: "LXC" },
] as const satisfies readonly { value: TypeFilter; label: string }[];

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "stopped", label: "Stopped" },
] as const satisfies readonly { value: StatusFilter; label: string }[];

function GuestIcon({ guest }: { guest: Guest }) {
  const Icon = guest.type === "lxc" ? Box : Server;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function GuestStatus({ guest }: { guest: Guest }) {
  const running = guest.status === "running";
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`size-1.5 shrink-0 rounded-full ${running ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
      />
      <span className={running ? "text-foreground" : "text-muted-foreground"}>
        {guest.status}
      </span>
    </span>
  );
}

const GUEST_COLUMNS: DataColumn<Guest>[] = [
  {
    key: "name",
    header: "Name",
    width: "minmax(0,1.4fr)",
    cell: (g) => (
      <span className="flex items-center gap-2">
        <GuestIcon guest={g} />
        <span className="truncate font-medium">{g.name}</span>
        <span className="shrink-0 border border-border px-1 text-[9px] uppercase text-muted-foreground">
          {g.type === "lxc" ? "LXC" : "VM"}
        </span>
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: "100px",
    cell: (g) => <GuestStatus guest={g} />,
  },
  {
    key: "vmid",
    header: "ID",
    width: "64px",
    cell: (g) => (
      <span className="tabular-nums text-muted-foreground">{g.vmid}</span>
    ),
  },
  {
    key: "cpu",
    header: "CPU",
    width: "minmax(0,1fr)",
    cell: (g) => <UsageCell percent={g.cpu} />,
  },
  {
    key: "mem",
    header: "Mem",
    width: "minmax(0,1fr)",
    hideBelow: "md",
    cell: (g) => <UsageCell percent={g.memPercent} />,
  },
  {
    key: "uptime",
    header: "Uptime",
    width: "96px",
    hideBelow: "lg",
    cell: (g) => (
      <span className="truncate text-muted-foreground">{g.uptime}</span>
    ),
  },
];

function GuestCard({ guest }: { guest: Guest }) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <GuestIcon guest={guest} />
        <span className="truncate text-sm font-medium">{guest.name}</span>
        <span className="ml-auto shrink-0 text-[10px]">
          <GuestStatus guest={guest} />
        </span>
      </div>
      <Facts className="text-[10px] text-muted-foreground">
        <span>{guest.type === "lxc" ? "LXC" : "VM"}</span>
        <span className="tabular-nums">{guest.vmid}</span>
        <span className="truncate">{guest.uptime}</span>
      </Facts>
      <div className="flex flex-col gap-1">
        <UsageCell percent={guest.cpu} label="CPU" />
        <UsageCell percent={guest.memPercent} label="Mem" />
      </div>
    </div>
  );
}

function UsageCell({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="w-8 shrink-0 text-[10px] uppercase text-muted-foreground">
          {label}
        </span>
      )}
      <div className="h-1.5 w-full overflow-hidden bg-muted">
        <div
          className={`h-full transition-all ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}
