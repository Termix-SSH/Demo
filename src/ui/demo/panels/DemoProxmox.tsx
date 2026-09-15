import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Database,
  Gauge,
  Network,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { MiniStat, Sparkline, StatRow } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { TabStrip } from "@/sidebar/HostManagerTabs";
import {
  Facts,
  PANEL,
  PanelSearch,
  PanelShell,
  Segmented,
  ViewToggle,
} from "@/components/panel-layout";
import { DataView, type DataColumn } from "@/components/data-view";
import { CardMasonry } from "./card-masonry";
import { usePanelView } from "@/hooks/use-panel-view";
import { getProxmoxStats, type DemoProxmoxSnapshot } from "@/demo/demo-api";
import type { DemoProxmoxNode } from "@/demo/demo-data";
import { Meter, UsagePair } from "./resource-bits";
import { usageColor } from "./usage-color";

// Mirrors the real ProxmoxStatsTab, rebuilt on the shared panel chrome. The
// guest list used to sit wedged between the node tiles and the storage cards
// with its own controls buried mid-page; the three now live on their own tabs
// so only one thing competes for the body at a time, and the guest controls
// ride in the shell's toolbar like every other panel.

type ProxmoxTab = "overview" | "guests" | "storage";

const PROXMOX_TABS = [
  { id: "overview", label: "Overview", icon: <Gauge className="size-3" /> },
  { id: "guests", label: "Guests", icon: <Server className="size-3" /> },
  { id: "storage", label: "Storage", icon: <Database className="size-3" /> },
];

type TypeFilter = "all" | "qemu" | "lxc";
type StatusFilter = "all" | "running" | "stopped";

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

export function DemoProxmox() {
  const [snapshot, setSnapshot] = useState<DemoProxmoxSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<ProxmoxTab>("overview");

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { view, density, setView, setDensity } = usePanelView("proxmox");

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

  const guests = useMemo(() => snapshot?.guests ?? [], [snapshot]);

  const filteredGuests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((g) => {
      if (typeFilter !== "all" && g.type !== typeFilter) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || String(g.vmid).includes(q);
    });
  }, [guests, query, typeFilter, statusFilter]);

  if (isLoading || !snapshot) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <RefreshCw className="size-5 animate-spin text-muted-foreground opacity-40" />
      </div>
    );
  }

  const node = snapshot.nodes[0];
  const running = guests.filter((g) => g.status === "running").length;

  return (
    <PanelShell
      icon={<Server className="size-4" />}
      title={snapshot.cluster.clustered ? snapshot.cluster.name : node.name}
      status={
        tab === "guests"
          ? `${running} of ${guests.length} running`
          : `${node.hostname} ${node.pveVersion}`
      }
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
      toolbar={
        <>
          <TabStrip
            tabs={PROXMOX_TABS}
            activeTab={tab}
            onTabChange={(id) => setTab(id as ProxmoxTab)}
          />
          {tab === "guests" && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <PanelSearch
                value={query}
                onChange={setQuery}
                placeholder="Search guests"
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
              <span className="hidden text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums sm:inline">
                {filteredGuests.length} of {guests.length}
              </span>
              <ViewToggle
                view={view}
                onView={setView}
                density={density}
                onDensity={setDensity}
              />
            </div>
          )}
        </>
      }
      scroll={tab !== "guests"}
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {tab === "overview" && <Overview snapshot={snapshot} />}

      {tab === "guests" && (
        <DataView
          items={filteredGuests}
          view={view}
          density={density}
          getKey={(g) => String(g.vmid)}
          columns={{ base: 1, md: 2, xl: 3 }}
          listColumns={GUEST_COLUMNS}
          renderCard={(guest) => <GuestCard guest={guest} />}
          empty={
            <EmptyState
              icon={Server}
              title={
                guests.length === 0
                  ? "No guests"
                  : "Nothing matches those filters"
              }
              hint="Try a different search or status filter."
            />
          }
        />
      )}

      {tab === "storage" && <Storage snapshot={snapshot} />}
    </PanelShell>
  );
}

/** Node health plus the cluster, which is what "how is the host doing" means. */
function Overview({ snapshot }: { snapshot: DemoProxmoxSnapshot }) {
  return (
    <CardMasonry columns={2}>
      {snapshot.nodes.map((node) => (
        <NodeCard key={node.name} node={node} />
      ))}

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
                  <Dot on={iface.state === "UP"} />
                  {iface.name}
                </span>
              }
              value={iface.address}
              mono
            />
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
              <Dot on={snapshot.cluster.quorate} />
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
                      <Dot on={member.online} />
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
    </CardMasonry>
  );
}

function NodeCard({ node }: { node: DemoProxmoxNode }) {
  return (
    <SectionCard
      title={node.name}
      icon={<Server className="size-3.5" />}
      action={
        <Facts className="text-[10px] text-muted-foreground">
          <span>{node.pveVersion}</span>
          <span>up {node.uptime}</span>
        </Facts>
      }
    >
      <div className="flex flex-col gap-3 py-2">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat
            caption="CPU"
            value={`${node.cpuPercent}%`}
            valueClassName={usageColor(node.cpuPercent)}
          />
          <MiniStat
            caption="Memory"
            value={`${node.memoryPercent}%`}
            valueClassName={usageColor(node.memoryPercent)}
          />
          <MiniStat
            caption="Disk"
            value={`${node.diskPercent}%`}
            valueClassName={usageColor(node.diskPercent)}
          />
        </div>

        <Sparkline data={node.cpuHistory} domain={[0, 100]} height={40} />

        <div className="flex flex-col gap-1.5">
          <UsagePair label="Memory" percent={node.memoryPercent} detail={node.memoryDetail} />
          <UsagePair label="Disk" percent={node.diskPercent} detail={node.diskDetail} />
        </div>
      </div>
    </SectionCard>
  );
}

function Storage({ snapshot }: { snapshot: DemoProxmoxSnapshot }) {
  return (
    <SectionCard title="Storage Pools" icon={<Database className="size-3.5" />}>
      <div className="flex flex-col gap-3 py-2">
        {snapshot.storage.map((pool) => (
          <div key={pool.name} className="flex flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-medium">{pool.name}</span>
              <span className="shrink-0 border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                {pool.type}
              </span>
              {!pool.active && (
                <span className="shrink-0 text-[10px] italic text-muted-foreground">
                  Inactive
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {pool.usedGiB} / {pool.totalGiB} GiB
              </span>
            </div>
            <Meter percent={pool.percent} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

type Guest = DemoProxmoxSnapshot["guests"][number];

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`size-1.5 shrink-0 rounded-full ${on ? "bg-accent-brand" : "bg-muted-foreground/50"}`}
    />
  );
}

function GuestIcon({ guest }: { guest: Guest }) {
  const Icon = guest.type === "lxc" ? Box : Server;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function GuestStatus({ guest }: { guest: Guest }) {
  const running = guest.status === "running";
  return (
    <span className="flex items-center gap-1.5">
      <Dot on={running} />
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
    key: "node",
    header: "Node",
    width: "90px",
    hideBelow: "lg",
    cell: (g) => (
      <span className="truncate text-muted-foreground">{g.node}</span>
    ),
  },
  {
    key: "cpu",
    header: "CPU",
    width: "minmax(0,1fr)",
    cell: (g) => <UsagePair percent={g.cpu} />,
  },
  {
    key: "mem",
    header: "Mem",
    width: "minmax(0,1fr)",
    hideBelow: "md",
    cell: (g) => <UsagePair percent={g.memPercent} />,
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
        <span className="truncate">{guest.node}</span>
        <span className="truncate">{guest.uptime}</span>
      </Facts>
      <div className="flex flex-col gap-1">
        <UsagePair label="CPU" percent={guest.cpu} />
        <UsagePair label="Mem" percent={guest.memPercent} />
      </div>
    </div>
  );
}
