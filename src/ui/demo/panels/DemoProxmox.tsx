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
  Search,
  Server,
} from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { SectionCard } from "@/components/section-card";
import { StatRow } from "@/components/charts";
import { getProxmoxStats, type DemoProxmoxSnapshot } from "@/demo/demo-api";
import type { DemoProxmoxNode } from "@/demo/demo-data";

// Mirrors the real ProxmoxStatsTab: header bar, node tile strip, guest table
// with search and segmented filters, then the network/storage/cluster row.

function barColor(percent: number | null): string {
  if (percent === null) return "bg-muted-foreground/30";
  if (percent >= 90) return "bg-red-500";
  if (percent >= 75) return "bg-yellow-500";
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      <div className="mx-3 mt-3 flex shrink-0 items-center justify-between border border-border bg-card px-3 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center border border-border bg-muted">
            <Server className="size-5 text-accent-brand" />
          </div>
          <h1 className="text-lg font-bold md:text-2xl truncate">
            {snapshot.cluster.clustered ? snapshot.cluster.name : node.name}
          </h1>
        </div>
        <Button
          variant="outline"
          size="default"
          onClick={refresh}
          className="gap-2 font-semibold"
        >
          <RefreshCw
            className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-3">
        <div className="shrink-0">
          <NodeSummaryStrip nodes={snapshot.nodes} />
        </div>

        <GuestTable guests={snapshot.guests} />

        <div className="grid shrink-0 grid-cols-1 gap-3 pb-1 md:grid-cols-3">
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
                        className={`size-1.5 shrink-0 rounded-full ${iface.state === "UP" ? "bg-green-500" : "bg-muted-foreground/50"}`}
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
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-xs font-medium">
                      {pool.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {pool.type}
                    </span>
                    {!pool.active && (
                      <span className="shrink-0 text-[10px] text-muted-foreground italic">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${barColor(pool.percent)}`}
                        style={{ width: `${pool.percent}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
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
                    className={`size-1.5 shrink-0 rounded-full ${snapshot.cluster.quorate ? "bg-green-500" : "bg-red-500"}`}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {snapshot.cluster.quorate ? "Quorate" : "Not Quorate"}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {snapshot.cluster.members.map((member) => (
                    <StatRow
                      key={member.name}
                      label={
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${member.online ? "bg-green-500" : "bg-muted-foreground/50"}`}
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
      </div>
    </div>
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
        <span className="truncate text-[11px] text-muted-foreground">
          {node.hostname} · {node.pveVersion}
        </span>
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
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor(clamped)}`}
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((g) => {
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) || String(g.vmid).includes(q)
      );
    });
  }, [guests, query, typeFilter, statusFilter]);

  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Guests
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {filtered.length} of {guests.length}
        </span>

        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-7 w-40 pl-6 text-xs"
            />
          </div>
          <Segmented<TypeFilter>
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              ["all", "All"],
              ["qemu", "VM"],
              ["lxc", "LXC"],
            ]}
          />
          <Segmented<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ["all", "All"],
              ["running", "Running"],
              ["stopped", "Stopped"],
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center py-16 text-xs text-muted-foreground">
            {guests.length === 0
              ? "No guests"
              : "No guests match your filters"}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold w-24">
                  Status
                </th>
                <th className="px-3 py-2 text-left font-semibold w-16">ID</th>
                <th className="px-3 py-2 text-left font-semibold w-32">CPU</th>
                <th className="px-3 py-2 text-left font-semibold w-32 hidden md:table-cell">
                  Mem
                </th>
                <th className="px-3 py-2 text-left font-semibold w-24 hidden lg:table-cell">
                  Uptime
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => (
                <tr
                  key={guest.vmid}
                  className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/40"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {guest.type === "lxc" ? (
                        <Box className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Server className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium">{guest.name}</span>
                      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                        {guest.type === "lxc" ? "LXC" : "VM"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${guest.status === "running" ? "bg-green-500" : "bg-muted-foreground/50"}`}
                      />
                      <span
                        className={
                          guest.status === "running"
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {guest.status}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {guest.vmid}
                  </td>
                  <td className="px-3 py-2">
                    <UsageCell percent={guest.cpu} />
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <UsageCell percent={guest.memPercent} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">
                    {guest.uptime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UsageCell({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly (readonly [NoInfer<T>, string])[];
}) {
  return (
    <div className="flex overflow-hidden rounded-none border border-border">
      {options.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
            value === key
              ? "bg-accent-brand text-white"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
