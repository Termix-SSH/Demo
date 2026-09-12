import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Database,
  ExternalLink,
  KeyRound,
  Network,
  Plus,
  Server,
  Settings,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Kbd } from "@/components/kbd";
import { VersionBadge } from "@/components/version-badge";
import {
  getStatusClasses,
  useStatusColorScheme,
} from "@/hooks/use-status-color-scheme";
import type { Host, TabType } from "@/types/ui-types";
import {
  DEMO_ACTIVITY,
  DEMO_CREDENTIALS,
  DEMO_TUNNELS,
  type DemoActivityItem,
} from "@/demo/demo-data";

/**
 * Copy of the real DashboardTab's default layout: the header bar, then the
 * stats bar, counters bar, quick actions, recent activity and host status
 * cards. The real one is a drag-and-drop configurable grid backed by saved
 * layouts; this keeps the cards and their markup but not the edit mode.
 */

export function DemoDashboard({
  hosts,
  onOpenTab,
  onOpenSingletonTab,
}: {
  hosts: Host[];
  onOpenTab?: (host: Host, type: TabType) => void;
  onOpenSingletonTab?: (type: TabType) => void;
}) {
  const { t } = useTranslation();

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  const hostMetrics = useMemo(() => {
    const map = new Map<
      string,
      { cpu: number | null; ram: number | null; disk: number | null }
    >();
    for (const h of hosts) {
      map.set(h.id, {
        cpu: h.cpu,
        ram: h.ram,
        disk: h.cpu == null ? null : Math.min(96, (h.ram ?? 40) + 8),
      });
    }
    return map;
  }, [hosts]);

  const openTab = onOpenTab ?? (() => {});
  const openSingleton = onOpenSingletonTab ?? (() => {});

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-5 py-3 shrink-0 mx-5 mt-5 gap-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 bg-muted/40 border border-border p-0.5">
            <button className="px-3 py-1 text-sm font-medium bg-background text-foreground shadow-sm transition-colors">
              {t("dashboard.title")}
            </button>
            <button className="px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t("nav.homepage")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground hidden sm:block">
            {todayLabel}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-2 mr-2 bg-muted/50 px-2.5 py-1 rounded-none border border-border">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {t("dashboardTab.commandPalette")}
            </span>
            <div className="flex items-center gap-1">
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
              <span className="text-[10px] text-muted-foreground">+</span>
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
            </div>
          </div>
          {[
            {
              label: t("dashboard.github"),
              href: "https://github.com/Termix-SSH/Termix",
            },
            { label: t("dashboard.docs"), href: "https://docs.termix.site/" },
            {
              label: t("dashboard.discord"),
              href: "https://discord.com/invite/jVQGdvHDrf",
            },
          ].map((link) => (
            <Button
              key={link.label}
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              asChild
            >
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </Button>
          ))}
        </div>
      </Card>

      <div className="flex flex-col flex-1 min-h-0 gap-4 p-5">
        <div className="shrink-0 h-24">
          <StatsBarCard hosts={hosts} />
        </div>
        <div className="shrink-0">
          <CountersBarCard
            hosts={hosts}
            credentialCount={DEMO_CREDENTIALS.length}
            activeTunnelCount={
              DEMO_TUNNELS.filter((tn) => tn.status === "running").length
            }
            onOpenSingletonTab={openSingleton}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2 shrink-0 h-64">
          <QuickActionsCard onOpenSingletonTab={openSingleton} />
          <RecentActivityCard hosts={hosts} onOpenTab={openTab} />
        </div>
        <div className="flex flex-col flex-1 min-h-0">
          <HostStatusCard
            hosts={hosts}
            hostMetrics={hostMetrics}
            onOpenTab={openTab}
          />
        </div>
      </div>
    </div>
  );
}

function StatsBarCard({ hosts }: { hosts: Host[] }) {
  const { t } = useTranslation();
  const online = hosts.filter((h) => h.status === "online").length;
  return (
    <Card className="grid grid-cols-4 divide-x divide-border overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.version")}
        </span>
        <span className="text-xl font-bold text-accent-brand leading-none">
          2.7.1
        </span>
        <VersionBadge status="up_to_date" className="w-fit" />
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.uptime")}
        </span>
        <span className="text-xl font-bold leading-none">9d 3h</span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.database")}
        </span>
        <span className="text-xl font-bold leading-none text-accent-brand">
          {t("dashboard.healthy")}
        </span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboardTab.hostsAvailable", {
            defaultValue: "Hosts Available",
          })}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none">{online}</span>
          <span className="text-base text-muted-foreground leading-none">
            /{hosts.length}
          </span>
        </div>
      </div>
    </Card>
  );
}

function CountersBarCard({
  hosts,
  credentialCount,
  activeTunnelCount,
  onOpenSingletonTab,
}: {
  hosts: Host[];
  credentialCount: number;
  activeTunnelCount: number;
  onOpenSingletonTab: (type: TabType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="grid grid-cols-3 divide-x divide-border overflow-hidden w-full h-full py-0 gap-0">
      <button
        onClick={() => onOpenSingletonTab("host-manager")}
        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer text-left"
      >
        <Server className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">{hosts.length}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.totalHosts")}
        </span>
      </button>
      <button
        onClick={() => onOpenSingletonTab("host-manager")}
        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer text-left"
      >
        <KeyRound className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">{credentialCount}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.totalCredentials")}
        </span>
      </button>
      <button
        onClick={() => onOpenSingletonTab("tunnel")}
        className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer text-left"
      >
        <Network className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">{activeTunnelCount}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboardTab.activeTunnels")}
        </span>
      </button>
    </Card>
  );
}

// The real card lists pinned hosts on the right and falls back to these two
// buttons only when nothing is pinned. The demo always shows the four buttons.
function QuickActionsCard({
  onOpenSingletonTab,
}: {
  onOpenSingletonTab: (type: TabType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <Zap className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
          {t("dashboard.quickActions")}
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 border-r border-border">
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("host-manager:add-host"))
            }
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1"
          >
            <ActionIcon>
              <Plus className="size-3 text-accent-brand" />
            </ActionIcon>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">
                {t("dashboard.addHost")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("dashboardTab.registerNewServer")}
              </span>
            </div>
          </button>
          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("host-manager:add-credential"),
              )
            }
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer flex-1"
          >
            <ActionIcon>
              <KeyRound className="size-3 text-accent-brand" />
            </ActionIcon>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">
                {t("dashboard.addCredential")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("dashboardTab.storeSshKeysOrPasswords")}
              </span>
            </div>
          </button>
        </div>
        <div className="flex flex-col flex-1">
          <button
            onClick={() => onOpenSingletonTab("admin-settings")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1"
          >
            <ActionIcon>
              <Settings className="size-3 text-accent-brand" />
            </ActionIcon>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">
                {t("dashboard.adminSettings")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("dashboardTab.manageUsersAndRoles")}
              </span>
            </div>
          </button>
          <button
            onClick={() => onOpenSingletonTab("user-profile")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer flex-1"
          >
            <ActionIcon>
              <User className="size-3 text-accent-brand" />
            </ActionIcon>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">
                {t("dashboard.userProfile")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {t("dashboardTab.manageYourAccount")}
              </span>
            </div>
          </button>
        </div>
      </div>
    </Card>
  );
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="size-7 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
      {children}
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90
      ? "bg-red-500"
      : value >= 70
        ? "bg-yellow-500"
        : "bg-accent-brand";
  const textColor =
    value >= 90
      ? "text-red-400"
      : value >= 70
        ? "text-yellow-400"
        : "text-accent-brand";
  return (
    <div className="flex flex-col gap-0.5 w-16">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-bold ${textColor}`}>
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="h-0.5 bg-muted w-full">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function HostStatusCard({
  hosts,
  hostMetrics,
  onOpenTab,
}: {
  hosts: Host[];
  hostMetrics: Map<
    string,
    { cpu: number | null; ram: number | null; disk: number | null }
  >;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const { t } = useTranslation();
  const statusScheme = useStatusColorScheme();
  const online = hosts.filter((h) => h.status === "online").length;
  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Database className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            {t("dashboardTab.hostStatus")}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {online}/{hosts.length}{" "}
          {t("dashboardTab.availableLower", { defaultValue: "Available" })}
        </span>
      </div>
      <div className="flex flex-col overflow-auto flex-1">
        {hosts.map((host) => {
          const availability =
            host.status && host.status !== "unknown"
              ? host.status
              : host.online
                ? "online"
                : "offline";
          const metrics = hostMetrics.get(host.id);
          const cpu = metrics?.cpu ?? null;
          const ram = metrics?.ram ?? null;
          const disk = metrics?.disk ?? null;
          const hasMetrics = cpu !== null || ram !== null || disk !== null;
          return (
            <div
              key={host.id}
              onClick={() => onOpenTab(host, "host-metrics")}
              className="flex min-w-0 items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer group/row"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${getStatusClasses(availability, statusScheme, "dot")}`}
                />
                <div className="flex min-w-0 flex-col">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className="truncate text-xs font-semibold"
                      title={host.name}
                    >
                      {host.name}
                    </span>
                    <ExternalLink className="size-2.5 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors shrink-0" />
                  </div>
                  <span
                    className="truncate text-[10px] text-muted-foreground font-mono"
                    title={host.ip}
                  >
                    {host.ip}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {availability === "online" && hasMetrics ? (
                  <div className="hidden sm:flex items-center gap-3">
                    {cpu !== null && (
                      <MetricBar label={t("dashboard.cpu")} value={cpu} />
                    )}
                    {ram !== null && (
                      <MetricBar label={t("dashboard.ram")} value={ram} />
                    )}
                    {disk !== null && (
                      <MetricBar label={t("dashboardTab.disk")} value={disk} />
                    )}
                  </div>
                ) : (
                  <div className="hidden sm:flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground w-16 text-center">
                      -
                    </span>
                    <span className="text-[10px] text-muted-foreground w-16 text-center">
                      -
                    </span>
                    <span className="text-[10px] text-muted-foreground w-16 text-center">
                      -
                    </span>
                  </div>
                )}
                <span
                  className={`text-[10px] px-2 py-0.5 font-semibold border ${getStatusClasses(availability, statusScheme, "badge")}`}
                >
                  {availability === "online"
                    ? t("dashboardTab.online")
                    : t("dashboardTab.offline")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const TYPE_TO_TAB: Record<DemoActivityItem["type"], TabType> = {
  terminal: "terminal",
  file_manager: "files",
  server_stats: "host-metrics",
  tunnel: "tunnel",
  docker: "docker",
  rdp: "rdp",
  vnc: "vnc",
  telnet: "telnet",
};

const TYPE_ICON: Record<DemoActivityItem["type"], React.ReactNode> = {
  terminal: <Terminal className="size-2.5 shrink-0" />,
  file_manager: <Server className="size-2.5 shrink-0" />,
  server_stats: <Activity className="size-2.5 shrink-0" />,
  tunnel: <Network className="size-2.5 shrink-0" />,
  docker: <Server className="size-2.5 shrink-0" />,
  rdp: <Server className="size-2.5 shrink-0" />,
  vnc: <Server className="size-2.5 shrink-0" />,
  telnet: <Terminal className="size-2.5 shrink-0" />,
};

function typeLabel(
  type: DemoActivityItem["type"],
  t: (key: string) => string,
): string {
  switch (type) {
    case "terminal":
      return t("networkGraph.terminal");
    case "file_manager":
      return t("networkGraph.fileManager");
    case "server_stats":
      return t("networkGraph.serverStats");
    case "tunnel":
      return t("networkGraph.tunnel");
    case "docker":
      return t("networkGraph.docker");
    case "rdp":
      return "RDP";
    case "vnc":
      return "VNC";
    case "telnet":
      return "Telnet";
  }
}

function RecentActivityCard({
  hosts,
  onOpenTab,
}: {
  hosts: Host[];
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const { t } = useTranslation();
  const statusScheme = useStatusColorScheme();

  function formatTime(ts: string) {
    const diffMs = Date.now() - new Date(ts).getTime();
    if (diffMs < 0) return t("dashboard.justNow");
    const diff = Math.floor(diffMs / 1000);
    if (diff < 60) return t("dashboard.justNow");
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            {t("dashboard.recentActivity")}
          </span>
        </div>
      </div>
      <div className="flex flex-col overflow-auto flex-1">
        {DEMO_ACTIVITY.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/40 py-8">
            {t("dashboard.noRecentActivity")}
          </div>
        )}
        {DEMO_ACTIVITY.map((item) => {
          const host = hosts.find((h) => h.id === item.hostId);
          return (
            <div
              key={item.id}
              onClick={() => {
                if (host) onOpenTab(host, TYPE_TO_TAB[item.type]);
              }}
              className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`size-1.5 rounded-full shrink-0 ${getStatusClasses(host?.online ?? false, statusScheme, "dot")}`}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate">
                    {item.hostName}
                  </span>
                  <div className="flex items-center gap-1 text-muted-foreground min-w-0">
                    {TYPE_ICON[item.type]}
                    <span className="text-[10px] truncate">
                      {typeLabel(item.type, t)}
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatTime(item.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
