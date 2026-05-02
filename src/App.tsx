import Logo from "@/assets/icon.svg?react"
import {Separator} from "@/components/ui/separator";
import {Button} from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Cloud,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderSearch,
  Globe,
  Hammer,
  HardDrive,
  Info,
  KeyRound,
  Languages,
  LayoutDashboard,
  List,
  Lock,
  MemoryStick,
  Menu,
  Monitor,
  Moon,
  MoreHorizontal,
  Network,
  Palette,
  Pencil,
  ArrowLeft,
  ArrowRight,
  Download,
  Filter,
  PlayCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Square,
  Sun,
  Tag,
  Terminal,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserX,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
  Check,
  Pin,
  ListChecks,
} from "lucide-react";
import {Input} from "@/components/ui/input";
import CytoscapeComponent from "react-cytoscapejs";
import {useState, useRef, useCallback, useEffect} from "react";
import type React from "react";
import {Card} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {Toaster} from "@/components/ui/sonner";
import {toast} from "sonner";
import { Auth, getStoredAuth, clearStoredAuth } from "@/Auth";
import { useXTerm } from 'react-xtermjs'
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from '@xterm/addon-fit';
import { FileManager } from "@/FileManager";
import { CommandPalette } from "@/CommandPalette";
import { Kbd, KbdKey, KbdSeparator } from "@/components/ui/kbd";

type Host = {
  id: string;
  name: string;
  user: string;
  address: string;
  port: number;
  folder: string;
  online: boolean;
  cpu: number;
  ram: number;
  lastAccess: string;
  tags?: string[];
  authType: "password" | "key" | "credential" | "none" | "opkssh";
  credentialId?: string;
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  notes?: string;
  macAddress?: string;
  pin?: boolean;

  // Terminal
  enableTerminal: boolean;
  terminalConfig?: {
    cursorBlink: boolean;
    cursorStyle: "block" | "underline" | "bar";
    fontSize: number;
    fontFamily: string;
    letterSpacing: number;
    lineHeight: number;
    theme: string;
    scrollback: number;
    bellStyle: "none" | "sound" | "visual" | "both";
    rightClickSelectsWord: boolean;
    fastScrollModifier: "alt" | "ctrl" | "shift";
    fastScrollSensitivity: number;
    minimumContrastRatio: number;
    backspaceMode: "normal" | "control-h";
    agentForwarding: boolean;
    autoMosh: boolean;
    moshCommand: string;
    autoTmux: boolean;
    sudoPasswordAutoFill: boolean;
    sudoPassword?: string;
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
    environmentVariables: { key: string; value: string }[];
  };

  // Advanced / Proxy
  useSocks5?: boolean;
  socks5Host?: string;
  socks5Port?: number;
  socks5Username?: string;
  socks5Password?: string;
  socks5ProxyChain?: { host: string; port: number; type: 4 | 5 | "http"; username?: string; password?: string }[];
  jumpHosts?: { hostId: string }[];
  portKnockSequence?: { port: number; protocol: "tcp" | "udp"; delay: number }[];

  // Tunnels
  enableTunnel: boolean;
  serverTunnels: {
    mode: "local" | "remote" | "dynamic";
    bindHost?: string;
    targetHost?: string;
    sourcePort: number;
    endpointHost: string;
    endpointPort: number;
    maxRetries: number;
    retryInterval: number;
    autoStart: boolean;
  }[];

  // File Manager
  enableFileManager: boolean;
  defaultPath?: string;

  // Docker
  enableDocker: boolean;

  // Stats
  statsConfig?: {
    statusCheckEnabled: boolean;
    statusCheckInterval: number;
    useGlobalStatusInterval: boolean;
    metricsEnabled: boolean;
    metricsInterval: number;
    useGlobalMetricsInterval: boolean;
    enabledWidgets: string[];
  };
  quickActions: { name: string; snippetId: string }[];

  // Remote Desktop (RDP/VNC/Telnet)
  connectionType: "ssh" | "rdp" | "vnc" | "telnet";
  domain?: string;
  security?: string;
  ignoreCert?: boolean;
  guacamoleConfig?: Record<string, any>;
};

type Credential = {
  id: string;
  name: string;
  username: string;
  type: "password" | "key";
  value?: string;
  publicKey?: string;
  passphrase?: string;
  description?: string;
  folder?: string;
  tags?: string[];
};

type HostFolder = {
  name: string;
  children: (Host | HostFolder)[];
};

type TabType =
  "dashboard"
  | "terminal"
  | "stats"
  | "files"
  | "host-manager"
  | "user-profile"
  | "admin-settings"
  | "docker"
  | "tunnel";

type TunnelStatusValue = "CONNECTED" | "CONNECTING" | "DISCONNECTING" | "DISCONNECTED" | "ERROR" | "WAITING";
type TunnelMode = "local" | "remote" | "dynamic";

type Tunnel = {
  id: string;
  hostId: string;
  sourcePort: number;
  endpointHost: string;
  endpointPort: number;
  status: TunnelStatusValue;
  mode: TunnelMode;
  reason?: string;
  retryCount?: number;
  maxRetries?: number;
};

type Tab = {
  id: string;
  type: TabType;
  label: string;
};

function isFolder(item: Host | HostFolder): item is HostFolder {
  return "children" in item;
}

function tabIcon(type: TabType) {
  switch (type) {
    case "dashboard":
      return <LayoutDashboard className="size-3.5"/>;
    case "terminal":
      return <Terminal className="size-3.5"/>;
    case "stats":
      return <Server className="size-3.5"/>;
    case "files":
      return <FolderSearch className="size-3.5"/>;
    case "host-manager":
      return <Server className="size-3.5"/>;
    case "user-profile":
      return <User className="size-3.5"/>;
    case "admin-settings":
      return <Settings className="size-3.5"/>;
    case "docker":
      return <Box className="size-3.5"/>;
    case "tunnel":
      return <Network className="size-3.5"/>;
  }
}

const hosts: Host[] = [
  {
    id: "1",
    name: "web-01",
    user: "deploy",
    address: "10.0.1.10",
    port: 22,
    folder: "Production / Web Servers",
    online: true,
    cpu: 12,
    ram: 34,
    lastAccess: "2m ago",
    tags: ["nginx", "frontend"],
    authType: "password",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: true,
    enableFileManager: true,
    enableDocker: false,
    quickActions: []
  },
  {
    id: "2",
    name: "web-02",
    user: "deploy",
    address: "10.0.1.11",
    port: 22,
    folder: "Production / Web Servers",
    online: true,
    cpu: 8,
    ram: 27,
    lastAccess: "12m ago",
    tags: ["nginx"],
    authType: "key",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: false,
    enableFileManager: true,
    enableDocker: false,
    quickActions: []
  },
  {
    id: "3",
    name: "db-primary",
    user: "postgres",
    address: "10.0.2.10",
    port: 5432,
    folder: "Production",
    online: true,
    cpu: 45,
    ram: 71,
    lastAccess: "5m ago",
    tags: ["postgres", "critical"],
    authType: "credential",
    credentialId: "c1",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: true,
    enableFileManager: false,
    enableDocker: true,
    quickActions: []
  },
  {
    id: "4",
    name: "db-replica",
    user: "postgres",
    address: "10.0.2.11",
    port: 5432,
    folder: "Production",
    online: false,
    cpu: 0,
    ram: 0,
    lastAccess: "31m ago",
    authType: "credential",
    credentialId: "c1",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: false,
    enableFileManager: false,
    enableDocker: false,
    quickActions: []
  },
  {
    id: "5",
    name: "stage-web",
    user: "deploy",
    address: "10.1.1.10",
    port: 22,
    folder: "Staging",
    online: true,
    cpu: 3,
    ram: 18,
    lastAccess: "25m ago",
    tags: ["staging"],
    authType: "password",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: true,
    enableFileManager: true,
    enableDocker: true,
    quickActions: []
  },
  {
    id: "6",
    name: "stage-db",
    user: "postgres",
    address: "10.1.2.10",
    port: 5432,
    folder: "Staging",
    online: false,
    cpu: 0,
    ram: 0,
    lastAccess: "45m ago",
    authType: "password",
    connectionType: "ssh",
    enableTerminal: true,
    enableTunnel: false,
    enableFileManager: false,
    enableDocker: false,
    quickActions: []
  },
];

const MOCK_CREDENTIALS: Credential[] = [
  {
    id: "c1",
    name: "Prod Database Admin",
    username: "postgres",
    type: "password",
    description: "Main production DB credentials"
  },
  {
    id: "c2",
    name: "Deployment Key",
    username: "deploy",
    type: "key",
    description: "SSH key for automated deployments"
  },
  {
    id: "c3",
    name: "Backup Service",
    username: "backup_user",
    type: "password",
    description: "Used by nightly backup cron jobs"
  },
  {
    id: "c4",
    name: "Staging Root",
    username: "root",
    type: "key",
    description: "Root access for staging cluster"
  },
];

const hostTree: HostFolder = {
  name: "root",
  children: [
    {
      name: "Production",
      children: [
        {
          name: "Web Servers",
          children: hosts.filter(h => h.folder === "Production / Web Servers"),
        },
        ...hosts.filter(h => h.folder === "Production"),
      ],
    },
    {
      name: "Staging",
      children: hosts.filter(h => h.folder === "Staging"),
    },
  ],
};

const recentActivity = [...hosts]
  .sort((a, b) => a.lastAccess.localeCompare(b.lastAccess))
  .map(h => ({host: h.name, action: "Terminal", time: h.lastAccess, online: h.online}));

const hostStatuses = hosts;

const DASHBOARD_TAB: Tab = {id: "dashboard", type: "dashboard", label: "Dashboard"};

type DashboardCardId = "stats_bar" | "counters_bar" | "quick_actions" | "host_status" | "recent_activity" | "network_graph";

type DashboardCardConfig = {
  id: DashboardCardId;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

const DASHBOARD_CARDS: DashboardCardConfig[] = [
  { id: "stats_bar",       label: "Status Bar",      description: "Version, uptime, database health, hosts online",  defaultEnabled: true  },
  { id: "counters_bar",    label: "Counters Bar",     description: "Total hosts, credentials, and tunnels count",     defaultEnabled: true  },
  { id: "quick_actions",   label: "Quick Actions",    description: "Shortcuts to add hosts, credentials, settings",   defaultEnabled: true  },
  { id: "host_status",     label: "Host Status",      description: "Live status list with CPU/RAM per host",          defaultEnabled: true  },
  { id: "recent_activity", label: "Recent Activity",  description: "Feed of recent connection events",                defaultEnabled: true  },
  { id: "network_graph",   label: "Network Graph",    description: "Visual map of host network topology",             defaultEnabled: false },
];

function DashboardSettingsDialog({
  open,
  onOpenChange,
  enabled,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enabled: Record<DashboardCardId, boolean>;
  onToggle: (id: DashboardCardId) => void;
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
              <DialogTitle className="text-base font-bold leading-none">Dashboard Settings</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">Toggle which cards are visible on your dashboard.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border">
          {DASHBOARD_CARDS.map((card) => {
            const isOn = enabled[card.id];
            return (
              <button
                key={card.id}
                onClick={() => onToggle(card.id)}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left w-full"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{card.label}</span>
                  <span className="text-xs text-muted-foreground">{card.description}</span>
                </div>
                <div className={`ml-4 shrink-0 size-5 border flex items-center justify-center transition-colors ${isOn ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}>
                  {isOn && <Check className="size-3 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{Object.values(enabled).filter(Boolean).length} of {DASHBOARD_CARDS.length} cards enabled</span>
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DEMO_GRAPH_ELEMENTS = [
  { data: { id: "gw",  label: "gateway",    ip: "10.0.0.1:22",  status: "online"  }, position: { x: 300, y: 200 } },
  { data: { id: "s1",  label: "web-01",     ip: "10.0.1.10:22", status: "online"  }, position: { x: 120, y: 80  } },
  { data: { id: "s2",  label: "db-primary", ip: "10.0.1.20:22", status: "online"  }, position: { x: 480, y: 80  } },
  { data: { id: "s3",  label: "cache-01",   ip: "10.0.1.30:22", status: "online"  }, position: { x: 500, y: 320 } },
  { data: { id: "s4",  label: "worker-01",  ip: "10.0.1.40:22", status: "online"  }, position: { x: 100, y: 320 } },
  { data: { id: "s5",  label: "db-replica", ip: "10.0.1.50:22", status: "offline" }, position: { x: 300, y: 360 } },
  { data: { id: "e1",  source: "gw", target: "s1" } },
  { data: { id: "e2",  source: "gw", target: "s2" } },
  { data: { id: "e3",  source: "gw", target: "s3" } },
  { data: { id: "e4",  source: "gw", target: "s4" } },
  { data: { id: "e5",  source: "gw", target: "s5" } },
  { data: { id: "e6",  source: "s2", target: "s5" } },
];

function NetworkGraphCard() {
  const cyRef = useRef<any>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: any } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const buildNodeStyle = useCallback((ele: any) => {
    const isGateway = ele.data("id") === "gw";
    const isOnline = ele.data("status") === "online";
    const name = ele.data("label") || "";
    const ip = ele.data("ip") || "";

    const statusColor = isOnline ? "rgb(251,146,60)" : "rgb(100,116,139)";
    const bgColor = "#09090b";
    const textColor = "#f1f5f9";
    const dimColor = "#64748b";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72">
      <defs>
        <filter id="sh" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <rect x="2" y="2" width="156" height="68" rx="4"
        fill="${bgColor}"
        stroke="${isGateway ? "rgba(251,146,60,0.8)" : statusColor}"
        stroke-width="${isGateway ? "2" : "1.5"}"
        filter="url(#sh)"
      />
      ${isGateway ? `<rect x="2" y="2" width="156" height="68" rx="4" fill="rgba(251,146,60,0.04)"/>` : ""}
      <circle cx="18" cy="36" r="4" fill="${statusColor}" opacity="0.9"/>
      <text x="32" y="30" font-family="monospace" font-size="12" font-weight="700" fill="${textColor}">${name}</text>
      <text x="32" y="48" font-family="monospace" font-size="10" fill="${dimColor}">${ip}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }, []);

  const handleCyInit = useCallback((cy: any) => {
    cyRef.current = cy;

    cy.style()
      .selector("node")
      .style({
        label: "",
        width: "160px",
        height: "72px",
        shape: "round-rectangle",
        "border-width": "0px",
        "background-opacity": 0,
        "background-image": buildNodeStyle,
        "background-fit": "contain",
      })
      .selector("edge")
      .style({
        width: "1.5px",
        "line-color": "#2a2a2c",
        "curve-style": "bezier",
        "target-arrow-shape": "none",
      })
      .selector("node:selected")
      .style({
        "overlay-color": "#fb923c",
        "overlay-opacity": 0.08,
        "overlay-padding": "4px",
      })
      .update();

    cy.nodes().ungrabify();

    cy.on("tap", (evt: any) => {
      if (evt.target === cy) setContextMenu(null);
    });

    cy.on("cxttap tap", "node", (evt: any) => {
      evt.stopPropagation();
      const node = evt.target;
      setContextMenu({
        visible: true,
        x: evt.originalEvent.clientX,
        y: evt.originalEvent.clientY,
        node: node.data(),
      });
    });

    cy.on("zoom pan", () => setContextMenu(null));
  }, [buildNodeStyle]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  return (
    <Card className="flex flex-col overflow-hidden py-0 gap-0 flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Network Graph</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{DEMO_GRAPH_ELEMENTS.filter(e => !e.data.source).length} nodes</span>
          <Button variant="ghost" size="sm" className="text-xs h-auto py-0.5 px-2" onClick={() => cyRef.current?.fit()}>
            <RefreshCw className="size-3" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {contextMenu?.visible && (
          <div
            ref={contextMenuRef}
            className="fixed z-[200] min-w-[160px] shadow-2xl p-1 flex flex-col gap-0.5 bg-card border border-border"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-1.5 border-b border-border mb-0.5">
              <span className="text-xs font-bold font-mono">{contextMenu.node.label}</span>
              <span className="text-[10px] text-muted-foreground block">{contextMenu.node.ip}</span>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left w-full">
              <Terminal className="size-3" />Terminal
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left w-full">
              <Server className="size-3" />Server Stats
            </button>
          </div>
        )}
        <CytoscapeComponent
          elements={DEMO_GRAPH_ELEMENTS}
          style={{ width: "100%", height: "100%" }}
          layout={{ name: "preset" }}
          cy={handleCyInit}
          wheelSensitivity={1.5}
          minZoom={0.3}
          maxZoom={2.5}
        />
        <div className="absolute bottom-2 left-3 flex items-center gap-3 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-brand inline-block" />
            <span className="text-[10px] text-muted-foreground font-mono">Online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/50 inline-block" />
            <span className="text-[10px] text-muted-foreground font-mono">Offline</span>
          </div>
        </div>
        <div className="absolute top-2 right-3 pointer-events-none">
          <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">Demo</span>
        </div>
      </div>
    </Card>
  );
}

function DashboardTab({ onOpenSingletonTab, onOpenTab }: {
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const defaultEnabled = Object.fromEntries(
    DASHBOARD_CARDS.map((c) => [c.id, c.defaultEnabled])
  ) as Record<DashboardCardId, boolean>;

  const [enabled, setEnabled] = useState<Record<DashboardCardId, boolean>>(defaultEnabled);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggle = (id: DashboardCardId) => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const hasRight = enabled.recent_activity || enabled.network_graph;
  const mainColClass = hasRight ? "flex w-3/4 flex-col gap-3 min-h-0" : "flex w-full flex-col gap-3 min-h-0";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <DashboardSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} enabled={enabled} onToggle={toggle} />
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Thursday, May 1, 2026</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-2 mr-2 bg-muted/50 px-3 py-1.5 rounded-md border border-border">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quick Actions</span>
            <div className="flex items-center gap-1">
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
              <span className="text-[10px] text-muted-foreground">+</span>
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href="https://discord.com" target="_blank" rel="noreferrer">Discord</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">Support</Button>
          <Separator orientation="vertical" className="mx-1"/>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Dashboard Settings">
            <LayoutDashboard className="size-4 text-accent-brand"/>
          </Button>
        </div>
      </Card>
      <div className="flex flex-row flex-1 min-h-0 px-3 py-3 gap-3">
        <div className={mainColClass}>

          {/* Row 1: Status Bar */}
          {enabled.stats_bar && (
            <Card className="grid grid-cols-4 divide-x divide-border overflow-hidden shrink-0 py-0 gap-0">
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
                <span className="text-3xl font-bold text-accent-brand">v1.0.0</span>
                <span className="text-xs bg-accent-brand/20 text-accent-brand px-1.5 py-0.5 w-fit font-semibold">STABLE</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Uptime</span>
                <span className="text-3xl font-bold">6d 3h</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
                <span className="text-3xl font-bold text-accent-brand">Healthy</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Hosts Online</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{hostStatuses.filter(h => h.online).length}</span>
                  <span className="text-xl text-muted-foreground">/{hostStatuses.length}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Row 2: Counters */}
          {enabled.counters_bar && (
            <Card className={`grid divide-x divide-border overflow-hidden shrink-0 py-0 gap-0 ${enabled.stats_bar ? "grid-cols-3" : "grid-cols-4"}`}>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <Server className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">{hostStatuses.length}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Total Hosts</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <KeyRound className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">2</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Credentials</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <Network className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">5</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Tunnels</span>
              </div>
              {!enabled.stats_bar && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Activity className="size-4 text-muted-foreground shrink-0"/>
                  <span className="text-xl font-bold text-accent-brand">Healthy</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
                </div>
              )}
            </Card>
          )}

          {/* Row 3: Quick Actions */}
          {enabled.quick_actions && (
            <Card className="flex flex-col overflow-hidden shrink-0 py-0 gap-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                <Zap className="size-3.5 text-muted-foreground"/>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Quick Actions</span>
              </div>
              <div className="flex flex-1">
                <div className="flex flex-col flex-1 border-r border-border">
                  <button
                    onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-host")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <Plus className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Add Host</span>
                      <span className="text-xs text-muted-foreground">Register a new server</span>
                    </div>
                  </button>
                  <button
                    onClick={() => onOpenSingletonTab("admin-settings")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <Settings className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Admin Settings</span>
                      <span className="text-xs text-muted-foreground">Configure the application</span>
                    </div>
                  </button>
                </div>
                <div className="flex flex-col flex-1">
                  <button
                    onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-credential")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <KeyRound className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Add Credential</span>
                      <span className="text-xs text-muted-foreground">Store SSH key or password</span>
                    </div>
                  </button>
                  <button
                    onClick={() => onOpenSingletonTab("user-profile")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <User className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">User Profile</span>
                      <span className="text-xs text-muted-foreground">Manage your account</span>
                    </div>
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* Row 4: Host Status */}
          {enabled.host_status && (
            <Card className="flex flex-col overflow-hidden flex-1 min-h-0 py-0 gap-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 text-muted-foreground"/>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Host Status</span>
                </div>
                <span className="text-xs text-muted-foreground">{hostStatuses.filter(h => h.online).length}/{hostStatuses.length} online</span>
              </div>
              <div className="flex flex-col overflow-auto flex-1">
                {hostStatuses.map((host, i) => (
                  <div key={i} onClick={() => onOpenTab(host, "stats")} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className={`size-2 rounded-full shrink-0 ${host.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{host.name}</span>
                        <span className="text-xs text-muted-foreground">{host.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {host.online ? (
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col gap-1 w-20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">CPU</span>
                              <span className="text-xs font-bold text-accent-brand">{host.cpu}%</span>
                            </div>
                            <div className="h-1 bg-muted w-full">
                              <div className="h-full bg-accent-brand" style={{width: `${host.cpu}%`}}/>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 w-20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">RAM</span>
                              <span className="text-xs font-bold text-accent-brand">{host.ram}%</span>
                            </div>
                            <div className="h-1 bg-muted w-full">
                              <div className="h-full bg-accent-brand" style={{width: `${host.ram}%`}}/>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                          <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                        </div>
                      )}
                      <span className={`text-xs px-2.5 py-1 font-semibold border ${host.online ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10" : "border-border text-muted-foreground"}`}>
                        {host.online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column: Recent Activity + Network Graph */}
        {hasRight && (
          <div className={`w-1/4 min-h-0 flex flex-col gap-3 ${enabled.recent_activity && enabled.network_graph ? "h-full" : ""}`}>
            {enabled.recent_activity && (
              <Card className={`flex flex-col overflow-hidden py-0 gap-0 ${enabled.network_graph ? "flex-1 min-h-0" : "h-full"}`}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <Activity className="size-3.5 text-muted-foreground"/>
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Recent Activity</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-auto py-0.5 px-2 text-accent-brand">Clear</Button>
                </div>
                <div className="flex flex-col overflow-auto flex-1">
                  {recentActivity.map((item, i) => (
                    <div key={i} onClick={() => { const h = hosts.find(x => x.name === item.host); if (h) onOpenTab(h, "terminal"); }} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <span className={`size-1.5 rounded-full shrink-0 ${item.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold truncate max-w-24">{item.host}</span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Terminal className="size-3"/>
                            <span className="text-xs">{item.action}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {enabled.network_graph && <NetworkGraphCard />}
          </div>
        )}
      </div>
    </div>
  );
}

function TerminalTab({label}: { label: string }) {
  const { instance, ref } = useXTerm()
  const commandBuffer = useRef("");

  useEffect(() => {
    if (!instance || !ref.current) return;

    // Set theme
    instance.options.theme = {
      background: '#111210',
      foreground: '#ffffff',
      cursor: '#fb923c',
    };

    // Initialize and load fit addon
    const fitAddon = new FitAddon();
    instance.loadAddon(fitAddon);

    const prompt = `\r\n\x1b[38;2;251;146;60muser@${label.toLowerCase().replace(/\s+/g, "-")}\x1b[0m:\x1b[38;2;96;165;250m~\x1b[0m$ `;

    instance.writeln(`\x1b[1m\x1b[38;2;251;146;60mTermix\x1b[0m v1.0.0 (SSH: ${label})`);
    instance.writeln('Type "help" for a list of commands.');
    instance.write(prompt);

    const disposable = instance.onData((data) => {
      const char = data;
      if (char === "\r") { // Enter
        const command = commandBuffer.current.trim();
        instance.write("\r\n");

        if (command === "help") {
          instance.writeln("Available commands: help, ls, clear, whoami, exit");
        } else if (command === "ls") {
          instance.writeln("apps  configs  documents  logs  scripts");
        } else if (command === "clear") {
          instance.clear();
        } else if (command === "whoami") {
          instance.writeln("user");
        } else if (command === "exit") {
          instance.writeln("Connection closed.");
        } else if (command !== "") {
          instance.writeln(`-bash: ${command}: command not found`);
        }

        commandBuffer.current = "";
        instance.write(prompt);
      } else if (char === "\u007f") { // Backspace (DEL)
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          instance.write("\b \b");
        }
      } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) { // Printable chars
        commandBuffer.current += char;
        instance.write(char);
      }
    })

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        console.error('Fit error:', e);
      }
    });
    resizeObserver.observe(ref.current);

    // Initial fit
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {}
    }, 100);

    return () => {
      disposable.dispose();
      resizeObserver.disconnect();
    }
  }, [instance]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#111210] p-1">
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function StatsTab({label}: { label: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const generateMetrics = useCallback(() => {
    return {
      cpu: {
        percent: Math.floor(Math.random() * 60) + 5,
        cores: 8,
        load: [Math.random().toFixed(2), Math.random().toFixed(2), Math.random().toFixed(2)]
      },
      memory: {
        percent: Math.floor(Math.random() * 40) + 20,
        totalGiB: 16,
        usedGiB: 6.4
      },
      disk: {
        percent: Math.floor(Math.random() * 30) + 40,
        total: "512 GB",
        used: "210 GB"
      },
      uptime: "12d 4h 32m",
      system: {
        hostname: label.toLowerCase().replace(/\s+/g, "-"),
        os: "Ubuntu 22.04.3 LTS",
        kernel: "5.15.0-84-generic"
      },
      network: [
        { name: "eth0", ip: "10.0.1.10", state: "UP" },
        { name: "lo", ip: "127.0.0.1", state: "UP" }
      ],
      processes: [
        { pid: 1234, user: "root", cpu: 1.2, mem: 0.5, command: "/usr/bin/nginx" },
        { pid: 5678, user: "postgres", cpu: 0.8, mem: 4.2, command: "postgres: writer process" },
        { pid: 9012, user: "deploy", cpu: 4.5, mem: 1.2, command: "node server.js" },
        { pid: 3456, user: "root", cpu: 0.1, mem: 0.1, command: "/usr/sbin/sshd" },
      ],
      logins: [
        { user: "admin", ip: "192.168.1.50", time: "2m ago", status: "success" },
        { user: "root", ip: "45.12.33.11", time: "15m ago", status: "failed" },
        { user: "deploy", ip: "192.168.1.51", time: "1h ago", status: "success" },
      ]
    };
  }, [label]);

  useEffect(() => {
    setMetrics(generateMetrics());
    const interval = setInterval(() => {
      setMetrics((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          cpu: { ...prev.cpu, percent: Math.max(5, Math.min(95, prev.cpu.percent + (Math.random() * 10 - 5))) },
          memory: { ...prev.memory, percent: Math.max(20, Math.min(90, prev.memory.percent + (Math.random() * 2 - 1))) }
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
        {/* System Overview */}
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

        {/* CPU Usage */}
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
              <div className="h-full bg-accent-brand transition-all duration-500" style={{width: `${metrics.cpu.percent}%`}}/>
            </div>
            <div className="h-20 w-full mt-2 bg-muted/20 border border-border/50 relative overflow-hidden">
               <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                 <path
                   d={`M 0 80 Q 20 ${80 - metrics.cpu.percent} 40 70 T 80 60 T 120 ${80 - metrics.cpu.percent * 0.8} T 160 50 T 200 70 T 240 40 T 280 60 T 320 80`}
                   fill="none"
                   stroke="currentColor"
                   strokeWidth="1.5"
                   className="text-accent-brand/50"
                 />
               </svg>
            </div>
          </div>
        </SectionCard>

        {/* Memory Usage */}
        <SectionCard title="Memory" icon={<MemoryStick className="size-3.5"/>}>
           <div className="flex flex-col gap-4 py-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-accent-brand">{metrics.memory.percent.toFixed(1)}%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{metrics.memory.usedGiB} / {metrics.memory.totalGiB} GiB</span>
              </div>
            </div>
            <div className="h-2 bg-muted w-full overflow-hidden">
              <div className="h-full bg-accent-brand transition-all duration-500" style={{width: `${metrics.memory.percent}%`}}/>
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

        {/* Disk Usage */}
        <SectionCard title="Storage" icon={<HardDrive className="size-3.5"/>}>
           <div className="flex flex-col gap-4 py-2">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-accent-brand">{metrics.disk.percent}%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{metrics.disk.used} / {metrics.disk.total}</span>
              </div>
            </div>
            <div className="h-2 bg-muted w-full overflow-hidden">
              <div className="h-full bg-accent-brand transition-all duration-500" style={{width: `${metrics.disk.percent}%`}}/>
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

        {/* Network */}
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

        {/* Processes */}
        <SectionCard title="Top Processes" icon={<List className="size-3.5"/>}>
           <div className="flex flex-col gap-1.5 py-1">
             <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-bold uppercase tracking-wider pb-1 border-b border-border">
                <span>PID</span>
                <span>CPU</span>
                <span>MEM</span>
                <span>CMD</span>
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

        {/* Login Stats */}
        <SectionCard title="Recent Logins" icon={<UserCheck className="size-3.5"/>}>
           <div className="flex flex-col gap-2 py-1">
              {metrics.logins.map((login: any, i: number) => (
                <div key={i} className={`flex items-center justify-between p-2 border ${login.status === "success" ? "border-border bg-muted/30" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                       {login.status === "failed" ? <UserX className="size-3 text-destructive"/> : <UserCheck className="size-3 text-accent-brand"/>}
                       <span className={`text-xs font-bold ${login.status === "failed" ? "text-destructive" : ""}`}>{login.user}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{login.ip}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">{login.time}</span>
                </div>
              ))}
           </div>
        </SectionCard>

        {/* Security / Firewall */}
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

        {/* Ports */}
        <SectionCard title="Listening Ports" icon={<Database className="size-3.5"/>}>
            <div className="flex flex-col gap-1.5 py-1">
               <div className="grid grid-cols-3 text-[10px] text-muted-foreground font-bold uppercase pb-1 border-b border-border">
                  <span>Port</span>
                  <span>Proto</span>
                  <span>Service</span>
               </div>
               {[
                 { port: 22, proto: "tcp", service: "sshd" },
                 { port: 80, proto: "tcp", service: "nginx" },
                 { port: 443, proto: "tcp", service: "nginx" },
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

function FilesTab({label}: { label: string }) {
  return (
    <FileManager label={label} />
  );
}

const HOST_TABS = [
  { id: "general", label: "General", icon: <Settings className="size-3.5" /> },
  { id: "terminal", label: "Terminal", icon: <Terminal className="size-3.5" /> },
  { id: "tunnels", label: "Tunnels", icon: <Network className="size-3.5" /> },
  { id: "docker", label: "Docker", icon: <Box className="size-3.5" /> },
  { id: "files", label: "Files", icon: <FolderSearch className="size-3.5" /> },
  { id: "stats", label: "Stats & Actions", icon: <Activity className="size-3.5" /> },
  { id: "remote", label: "Remote Desktop", icon: <Monitor className="size-3.5" /> },
  { id: "sharing", label: "Sharing", icon: <Share2 className="size-3.5" /> },
];

const CREDENTIAL_TABS = [
  { id: "general", label: "General", icon: <Info className="size-3.5" /> },
  { id: "auth", label: "Authentication", icon: <Lock className="size-3.5" /> },
];

function HostManagerTab() {
  const [section, setSection] = useState<"hosts" | "credentials">("hosts");
  const [editingHost, setEditingHost] = useState<Host | "new" | null>(null);
  const [editingCredential, setEditingCredential] = useState<Credential | "new" | null>(null);

  useEffect(() => {
    const handleAddHost = () => { setSection("hosts"); setEditingHost("new"); setEditingCredential(null); };
    const handleAddCredential = () => { setSection("credentials"); setEditingCredential("new"); setEditingHost(null); };
    window.addEventListener("host-manager:add-host", handleAddHost);
    window.addEventListener("host-manager:add-credential", handleAddCredential);
    return () => {
      window.removeEventListener("host-manager:add-host", handleAddHost);
      window.removeEventListener("host-manager:add-credential", handleAddCredential);
    };
  }, []);
  const [activeHostTab, setActiveHostTab] = useState("general");
  const [activeCredentialTab, setActiveCredentialTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["Production", "Production / Web Servers", "Staging"]));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(new Set());
  const [editingFolderName, setEditingFolderName] = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState("");
  const [draggedHost, setDraggedHost] = useState<Host | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allHosts = hosts;

  const filteredHosts = allHosts.filter(h =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredCredentials = MOCK_CREDENTIALS.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = Array.from(new Set(allHosts.map(h => h.folder))).sort();

  const pinnedHosts = filteredHosts.filter(h => h.pin);
  const hostsByFolder = folders.reduce<Record<string, Host[]>>((acc, folder) => {
    acc[folder] = filteredHosts.filter(h => h.folder === folder && !h.pin);
    return acc;
  }, {});

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const toggleHostSelection = (id: string) => {
    setSelectedHostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportHosts = () => {
    const data = JSON.stringify({ hosts: allHosts }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "termix-hosts.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Hosts exported successfully");
  };

  const credentialFolders = Array.from(new Set(MOCK_CREDENTIALS.map(c => c.folder || "Uncategorized"))).sort();

  const navContent = () => {
    if (editingHost) {
      const connectionType = editingHost === "new" ? "ssh" : editingHost.connectionType;
      return (
        <>
          <button
            onClick={() => { setEditingHost(null); setActiveHostTab("general"); }}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l-2 border-transparent"
          >
            <ArrowLeft className="size-3.5" />
            Back to Hosts
          </button>
          <Separator className="my-1 opacity-50" />
          {HOST_TABS.map(tab => {
            const isDisabled =
              (connectionType !== "ssh" && ["terminal", "tunnels", "docker", "files"].includes(tab.id)) ||
              (connectionType === "ssh" && tab.id === "remote");
            return (
              <button
                key={tab.id}
                disabled={isDisabled}
                onClick={() => setActiveHostTab(tab.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  activeHostTab === tab.id && !isDisabled
                    ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </>
      );
    }

    if (editingCredential) {
      return (
        <>
          <button
            onClick={() => { setEditingCredential(null); setActiveCredentialTab("general"); }}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l-2 border-transparent"
          >
            <ArrowLeft className="size-3.5" />
            Back to Credentials
          </button>
          <Separator className="my-1 opacity-50" />
          {CREDENTIAL_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveCredentialTab(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                activeCredentialTab === tab.id
                  ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </>
      );
    }

    return (
      <>
        <button
          onClick={() => { setSection("hosts"); setEditingCredential(null); setSearchQuery(""); }}
          className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
            section === "hosts"
              ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
          }`}
        >
          <Server className="size-3.5"/>
          Hosts
          <span className="ml-auto text-[10px] font-bold text-muted-foreground/60">{allHosts.length}</span>
        </button>
        <button
          onClick={() => { setSection("credentials"); setEditingHost(null); setSearchQuery(""); }}
          className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
            section === "credentials"
              ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
              : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
          }`}
        >
          <KeyRound className="size-3.5"/>
          Credentials
          <span className="ml-auto text-[10px] font-bold text-muted-foreground/60">{MOCK_CREDENTIALS.length}</span>
        </button>
      </>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Host Manager</h1>
          <p className="text-xs text-muted-foreground">
            {allHosts.filter(h => h.online).length}/{allHosts.length} online · {MOCK_CREDENTIALS.length} credentials
          </p>
        </div>
        {!editingHost && !editingCredential && (
          <div className="flex items-center gap-2">
            {section === "hosts" && (
              <>
                {selectionMode ? (
                  <>
                    <span className="text-xs text-muted-foreground">{selectedHostIds.size} selected</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setSelectionMode(false); setSelectedHostIds(new Set()); }}>
                      <X className="size-3.5 mr-1" />Cancel
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                      onClick={() => toast.success(`Deleted ${selectedHostIds.size} hosts`)}>
                      <Trash2 className="size-3.5 mr-1" />Delete Selected
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectionMode(true)}>
                      <ListChecks className="size-3.5 mr-1" />Select
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) toast.success("Hosts imported successfully"); }} />
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="size-3.5 mr-1" />Import
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleExportHosts}>
                      <Download className="size-3.5 mr-1" />Export
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                      onClick={() => { setEditingHost("new"); setActiveHostTab("general"); }}>
                      <Plus className="size-3.5 mr-1.5"/>Add Host
                    </Button>
                  </>
                )}
              </>
            )}
            {section === "credentials" && (
              <Button variant="outline" size="sm" className="h-7 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                onClick={() => { setEditingCredential("new"); setActiveCredentialTab("general"); }}>
                <Plus className="size-3.5 mr-1.5"/>Add Credential
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-row flex-1 min-h-0 overflow-hidden px-3 py-3 gap-3">
        {/* Left Nav */}
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">
            {navContent()}
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
          {section === "hosts" && (
            editingHost ? (
              <HostEditor
                host={editingHost === "new" ? null : editingHost}
                activeTab={activeHostTab}
                onBack={() => { setEditingHost(null); setActiveHostTab("general"); }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {/* Search & filter bar */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                    <Input placeholder="Search hosts, addresses, tags..." className="pl-8 h-9 text-xs"
                      value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={() => {
                    const allOpen = folders.every(f => expandedFolders.has(f));
                    setExpandedFolders(allOpen ? new Set() : new Set(folders));
                  }}>
                    {folders.every(f => expandedFolders.has(f)) ? <ChevronUp className="size-3.5 mr-1.5"/> : <ChevronDown className="size-3.5 mr-1.5"/>}
                    {folders.every(f => expandedFolders.has(f)) ? "Collapse All" : "Expand All"}
                  </Button>
                </div>

                {/* Pinned hosts */}
                {pinnedHosts.length > 0 && (
                  <div className="flex flex-col border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border">
                      <Pin className="size-3 text-accent-brand"/>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent-brand">Pinned</span>
                    </div>
                    {pinnedHosts.map(host => (
                      <HostRow key={host.id} host={host} selectionMode={selectionMode}
                        selected={selectedHostIds.has(host.id)}
                        onToggleSelect={() => toggleHostSelection(host.id)}
                        onEdit={() => { setEditingHost(host); setActiveHostTab("general"); }}
                        onDelete={() => toast.success(`Deleted ${host.name}`)} />
                    ))}
                  </div>
                )}

                {/* Folder groups */}
                {folders.map(folder => {
                  const folderHosts = hostsByFolder[folder] || [];
                  if (folderHosts.length === 0 && !searchQuery) return null;
                  if (folderHosts.length === 0 && searchQuery) return null;
                  const isExpanded = expandedFolders.has(folder);
                  const isOver = dragOverFolder === folder;
                  const onlineCount = folderHosts.filter(h => h.online).length;

                  return (
                    <div key={folder} className={`flex flex-col border overflow-hidden transition-colors ${isOver ? "border-accent-brand/60 bg-accent-brand/5" : "border-border"}`}
                      onDragOver={e => { e.preventDefault(); setDragOverFolder(folder); }}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverFolder(null);
                        if (draggedHost) {
                          toast.success(`Moved ${draggedHost.name} to ${folder}`);
                          setDraggedHost(null);
                        }
                      }}
                    >
                      {/* Folder header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border group/folder">
                        <button className="flex items-center gap-2 flex-1 text-left" onClick={() => toggleFolder(folder)}>
                          <ChevronRight className={`size-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}/>
                          {isExpanded ? <FolderOpen className="size-3.5 text-accent-brand/70"/> : <Folder className="size-3.5 text-accent-brand/70"/>}
                          {editingFolderName === folder ? (
                            <input
                              autoFocus
                              value={editingFolderValue}
                              onChange={e => setEditingFolderValue(e.target.value)}
                              onBlur={() => { setEditingFolderName(null); toast.success(`Folder renamed to ${editingFolderValue}`); }}
                              onKeyDown={e => { if (e.key === "Enter") { setEditingFolderName(null); toast.success(`Folder renamed to ${editingFolderValue}`); } if (e.key === "Escape") setEditingFolderName(null); }}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] font-bold uppercase tracking-widest bg-background border border-accent-brand/60 px-1 outline-none text-foreground"
                            />
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{folder}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60 ml-0.5">{onlineCount}/{folderHosts.length}</span>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); setEditingFolderName(folder); setEditingFolderValue(folder); }}>
                            <Pencil className="size-3"/>
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive"
                            onClick={e => { e.stopPropagation(); toast.success(`Deleted folder ${folder}`); }}>
                            <Trash2 className="size-3"/>
                          </Button>
                        </div>
                      </div>

                      {/* Hosts */}
                      {isExpanded && folderHosts.map(host => (
                        <HostRow key={host.id} host={host} selectionMode={selectionMode}
                          selected={selectedHostIds.has(host.id)}
                          onToggleSelect={() => toggleHostSelection(host.id)}
                          onEdit={() => { setEditingHost(host); setActiveHostTab("general"); }}
                          onDelete={() => toast.success(`Deleted ${host.name}`)}
                          onDragStart={() => setDraggedHost(host)}
                          onDragEnd={() => setDraggedHost(null)} />
                      ))}
                    </div>
                  );
                })}

                {filteredHosts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border">
                    <Server className="size-10 text-muted-foreground/30 mb-3"/>
                    <span className="text-sm font-semibold text-muted-foreground">No hosts found</span>
                    <span className="text-xs text-muted-foreground/60 mt-1">
                      {searchQuery ? "Try a different search term" : "Add your first host to get started"}
                    </span>
                    {!searchQuery && (
                      <Button variant="outline" size="sm" className="mt-4 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10"
                        onClick={() => { setEditingHost("new"); setActiveHostTab("general"); }}>
                        <Plus className="size-3.5 mr-1.5"/>Add Host
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {section === "credentials" && (
            editingCredential ? (
              <CredentialEditorView
                credential={editingCredential === "new" ? null : editingCredential}
                activeTab={activeCredentialTab}
                onBack={() => { setEditingCredential(null); setActiveCredentialTab("general"); }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                  <Input placeholder="Search credentials..." className="pl-8 h-9 text-xs"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>

                {credentialFolders.map(folder => {
                  const creds = filteredCredentials.filter(c => (c.folder || "Uncategorized") === folder);
                  if (creds.length === 0) return null;
                  return (
                    <div key={folder} className="flex flex-col border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border">
                        <Folder className="size-3.5 text-accent-brand/70"/>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{folder}</span>
                        <span className="text-[10px] text-muted-foreground/60">{creds.length}</span>
                      </div>
                      {creds.map(cred => {
                        const usedByHosts = allHosts.filter(h => h.credentialId === cred.id);
                        return (
                          <div key={cred.id} className="flex items-center justify-between px-3 py-3 border-b border-border last:border-0 hover:bg-muted/30 group">
                            <div className="flex items-center gap-3">
                              <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
                                {cred.type === "key" ? <Shield className="size-3.5 text-accent-brand"/> : <Lock className="size-3.5 text-accent-brand"/>}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{cred.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 font-bold border ${cred.type === "key" ? "border-accent-brand/30 text-accent-brand bg-accent-brand/10" : "border-border text-muted-foreground"}`}>
                                    {cred.type === "key" ? "SSH KEY" : "PASSWORD"}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">{cred.username}
                                  {usedByHosts.length > 0 && <span className="ml-2 text-[10px] text-muted-foreground/60">· used by {usedByHosts.length} host{usedByHosts.length !== 1 ? "s" : ""}</span>}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {cred.type === "key" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => { navigator.clipboard.writeText(`ssh-copy-id -i ~/.ssh/id_rsa.pub ${cred.username}@<host>`); toast.success("Deploy command copied"); }}>
                                  <Copy className="size-3 mr-1"/>Deploy
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="size-7"
                                onClick={() => { setEditingCredential(cred); setActiveCredentialTab("general"); }}>
                                <Pencil className="size-3.5"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => toast.success(`Deleted ${cred.name}`)}>
                                <Trash2 className="size-3.5"/>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {filteredCredentials.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border text-center">
                    <KeyRound className="size-10 text-muted-foreground/30 mb-3"/>
                    <span className="text-sm font-semibold text-muted-foreground">No credentials found</span>
                    <Button variant="outline" size="sm" className="mt-4 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10"
                      onClick={() => { setEditingCredential("new"); setActiveCredentialTab("general"); }}>
                      <Plus className="size-3.5 mr-1.5"/>Add Credential
                    </Button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function HostRow({ host, selectionMode, selected, onToggleSelect, onEdit, onDelete, onDragStart, onDragEnd }: {
  host: Host;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={!!onDragStart && !selectionMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center justify-between px-3 py-2.5 border-b border-border last:border-0 group transition-colors ${
        selected ? "bg-accent-brand/5" : "hover:bg-muted/40"
      } ${onDragStart && !selectionMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {selectionMode && (
          <button onClick={onToggleSelect} className="shrink-0">
            <div className={`size-4 border-2 flex items-center justify-center transition-colors ${selected ? "border-accent-brand bg-accent-brand" : "border-border bg-background"}`}>
              {selected && <Check className="size-2.5 text-background"/>}
            </div>
          </button>
        )}
        <div className={`size-2 rounded-full shrink-0 ${host.online ? "bg-accent-brand shadow-[0_0_4px_rgba(251,146,60,0.6)]" : "bg-muted-foreground/30"}`}/>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{host.name}</span>
            {host.pin && <Pin className="size-3 text-accent-brand/60 shrink-0"/>}
            <span className={`text-[9px] px-1.5 py-0.5 font-bold border shrink-0 ${
              host.connectionType === "ssh" ? "border-border text-muted-foreground" :
              host.connectionType === "rdp" ? "border-blue-400/30 text-blue-400" :
              "border-border text-muted-foreground"
            }`}>{host.connectionType.toUpperCase()}</span>
          </div>
          <span className="text-xs text-muted-foreground truncate">{host.user}@{host.address}:{host.port}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 ml-2">
          {host.tags?.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 border border-border bg-muted/30 text-muted-foreground lowercase">{tag}</span>
          ))}
          {(host.tags?.length || 0) > 3 && <span className="text-[10px] text-muted-foreground">+{(host.tags?.length || 0) - 3}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Connection metrics shown when online */}
        {host.online && (
          <div className="hidden lg:flex items-center gap-3 mr-2">
            <div className="flex flex-col gap-0.5 w-16">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">CPU</span>
                <span className="text-[10px] font-bold text-accent-brand">{host.cpu}%</span>
              </div>
              <div className="h-0.5 bg-muted w-full"><div className="h-full bg-accent-brand" style={{width: `${host.cpu}%`}}/></div>
            </div>
            <div className="flex flex-col gap-0.5 w-16">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">RAM</span>
                <span className="text-[10px] font-bold text-accent-brand">{host.ram}%</span>
              </div>
              <div className="h-0.5 bg-muted w-full"><div className="h-full bg-accent-brand" style={{width: `${host.ram}%`}}/></div>
            </div>
          </div>
        )}

        {/* Quick actions (hover) */}
        {!selectionMode && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {host.enableTerminal && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open Terminal">
                <Terminal className="size-3.5"/>
              </Button>
            )}
            {host.enableFileManager && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open File Manager">
                <FolderSearch className="size-3.5"/>
              </Button>
            )}
            {host.enableDocker && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open Docker">
                <Box className="size-3.5"/>
              </Button>
            )}
            <Separator orientation="vertical" className="h-4 mx-0.5"/>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Edit Host" onClick={onEdit}>
              <Pencil className="size-3.5"/>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="size-3.5"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => toast.success("Host cloned")}>
                  <Copy className="size-3.5 mr-2"/>Clone Host
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(`${host.user}@${host.address}`); toast.success("Copied to clipboard"); }}>
                  <Copy className="size-3.5 mr-2"/>Copy Address
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="size-3.5 mr-2"/>Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Last access */}
        <span className="text-[10px] text-muted-foreground/60 w-14 text-right shrink-0">{host.lastAccess}</span>
      </div>
    </div>
  );
}

function HostEditor({ host, activeTab, onBack }: { host: Host | null, activeTab: string, onBack: () => void }) {
  const [authMethod, setAuthMethod] = useState(host?.authType || "password");
  const [connectionType, setConnectionType] = useState(host?.connectionType || "ssh");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {activeTab === "general" && (
          <>
            <SectionCard title="Connection Details" icon={<Globe className="size-3.5" />}>
               <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Connection Type</label>
                    <div className="flex gap-2">
                      {["ssh", "rdp", "vnc", "telnet"].map(t => (
                        <button
                          key={t}
                          onClick={() => setConnectionType(t as any)}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                            connectionType === t
                              ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    <div className="flex flex-col gap-1.5 col-span-8">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Address / IP</label>
                      <Input placeholder="10.0.0.1 or example.com" defaultValue={host?.address || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
                      <Input type="number" placeholder="22" defaultValue={host?.port || 22} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MAC Address</label>
                      <Input placeholder="AA:BB:CC:DD:EE:FF" defaultValue={host?.macAddress || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Organization Name</label>
                      <Input placeholder="e.g. Web Server Production" defaultValue={host?.name || ""} />
                    </div>
                  </div>
               </div>
            </SectionCard>

            <SectionCard title="Authentication" icon={<Shield className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                 <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Auth Method</label>
                    <div className="flex gap-2">
                      {["password", "key", "credential", "none", "opkssh"].map(m => (
                        <button
                          key={m}
                          onClick={() => setAuthMethod(m as any)}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                            authMethod === m
                              ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 mt-1">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                      <Input placeholder="root" defaultValue={host?.user || ""} />
                    </div>
                    {authMethod === "password" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                        <Input type="password" placeholder="••••••••" defaultValue={host?.password || ""} />
                      </div>
                    )}
                    {authMethod === "key" && (
                      <>
                        <div className="flex flex-col gap-1.5 col-span-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Private Key</label>
                          <textarea
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                            rows={5}
                            defaultValue={host?.key || ""}
                            className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Passphrase</label>
                          <Input type="password" placeholder="Optional" defaultValue={host?.keyPassword || ""} />
                        </div>
                      </>
                    )}
                    {authMethod === "credential" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stored Credential</label>
                        <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                          <option>Select a credential...</option>
                          {MOCK_CREDENTIALS.map(c => (
                            <option key={c.id} value={c.id} selected={host?.credentialId === c.id}>{c.name} ({c.username})</option>
                          ))}
                        </select>
                      </div>
                    )}
                 </div>

                 <SettingRow label="Force Keyboard Interactive" description="Force manual password entry even if keys are present">
                   <FakeSwitch />
                 </SettingRow>
              </div>
            </SectionCard>

            <SectionCard title="Proxy & Bastion" icon={<Network className="size-3.5" />}>
              <div className="flex flex-col gap-4 py-3">
                 <SettingRow label="Use SOCKS5 Proxy" description="Route connection through a proxy server">
                   <FakeSwitch defaultChecked={host?.useSocks5} />
                 </SettingRow>

                 <div className="flex flex-col gap-3 p-3 bg-muted/20 border border-border">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Proxy Chain</span>
                       <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Node</Button>
                    </div>
                    <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 p-2 bg-background border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground">1.</span>
                          <Input className="h-7 text-xs flex-1" placeholder="Host" defaultValue="proxy.internal" />
                          <Input className="h-7 text-xs w-20" placeholder="Port" defaultValue="1080" />
                          <Button variant="ghost" size="icon" className="size-7 text-destructive"><Trash2 className="size-3.5" /></Button>
                       </div>
                    </div>
                 </div>

                 <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jump Host Chain</span>
                       <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Jump</Button>
                    </div>
                    <div className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 p-2 bg-background border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground">1.</span>
                          <select className="flex h-7 flex-1 border border-border bg-background px-2 py-0 text-xs outline-none focus:ring-1 focus:ring-ring">
                             <option>Select a server...</option>
                             {hosts.map(h => <option key={h.id}>{h.name}</option>)}
                          </select>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive"><Trash2 className="size-3.5" /></Button>
                       </div>
                    </div>
                 </div>
              </div>
            </SectionCard>

            <SectionCard title="Organization & Advanced" icon={<Tag className="size-3.5" />}>
               <div className="grid grid-cols-2 gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Folder</label>
                    <Input placeholder="e.g. Production" defaultValue={host?.folder || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</label>
                    <Input placeholder="space separated" defaultValue={host?.tags?.join(" ") || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5 col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Private Notes</label>
                    <textarea rows={3} placeholder="Details about this server..." className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring" defaultValue={host?.notes || ""} />
                  </div>
                  <SettingRow label="Pin to Top" description="Always show this host at the top of the list">
                    <FakeSwitch defaultChecked={host?.pin} />
                  </SettingRow>
               </div>

               <div className="flex flex-col gap-3 border-t border-border pt-4 pb-2">
                  <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port Knocking Sequence</span>
                     <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Knock</Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                     <div className="flex items-center gap-1.5 p-1.5 bg-muted/30 border border-border">
                        <Input className="h-7 text-xs w-16" placeholder="Port" />
                        <select className="h-7 text-[10px] bg-background border border-border"><option>TCP</option><option>UDP</option></select>
                        <Input className="h-7 text-xs w-14" placeholder="Delay" />
                        <button className="text-destructive p-1"><X className="size-3"/></button>
                     </div>
                  </div>
               </div>
            </SectionCard>
          </>
        )}

        {activeTab === "terminal" && (
           <>
             <SectionCard title="Terminal Appearance" icon={<Palette className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Preview</label>
                      <div className="h-32 w-full bg-[#111210] border border-border rounded flex items-center justify-center font-mono text-xs text-green-400">
                         user@host:~$ ls -la<br/>
                         total 0<br/>
                         drwxr-xr-x  2 user user  64 May  1 2026 .<br/>
                         drwxr-xr-x 10 user user 320 May  1 2026 ..
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color Theme</label>
                        <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                          <option>Termix Dark</option>
                          <option>One Dark</option>
                          <option>Monokai</option>
                          <option>Dracula</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Family</label>
                        <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring font-mono">
                          <option>JetBrains Mono</option>
                          <option>Fira Code</option>
                          <option>Source Code Pro</option>
                          <option>Courier New</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Size</label>
                        <Input type="number" defaultValue={14} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cursor Style</label>
                        <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                          <option>Block</option>
                          <option>Underline</option>
                          <option>Bar</option>
                        </select>
                      </div>
                   </div>

                   <SettingRow label="Cursor Blinking" description="Enable blinking animation for the terminal cursor">
                     <FakeSwitch defaultChecked={true} />
                   </SettingRow>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Letter Spacing</label>
                        <Input type="number" step="0.1" defaultValue={0} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Line Height</label>
                        <Input type="number" step="0.1" defaultValue={1.2} />
                      </div>
                   </div>
                </div>
             </SectionCard>

             <SectionCard title="Behavior & Advanced" icon={<Zap className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                   <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scrollback Buffer</label>
                      <Input type="number" defaultValue={10000} />
                      <span className="text-[10px] text-muted-foreground">Maximum number of lines kept in history</span>
                   </div>

                   <SettingRow label="SSH Agent Forwarding" description="Pass your local SSH keys to this host">
                      <FakeSwitch />
                   </SettingRow>
                   <SettingRow label="Enable Auto-Mosh" description="Prefer Mosh over SSH if available">
                      <FakeSwitch />
                   </SettingRow>
                   <SettingRow label="Enable Auto-Tmux" description="Automatically launch or attach to tmux session">
                      <FakeSwitch />
                   </SettingRow>
                   <SettingRow label="Sudo Password Auto-fill" description="Automatically provide sudo password when prompted">
                      <FakeSwitch />
                   </SettingRow>

                   <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Environment Variables</span>
                         <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Variable</Button>
                      </div>
                      <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-2">
                            <Input className="h-7 text-xs flex-1" placeholder="KEY" defaultValue="NODE_ENV" />
                            <Input className="h-7 text-xs flex-1" placeholder="VALUE" defaultValue="production" />
                            <button className="text-destructive"><X className="size-4"/></button>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Keepalive Interval</label>
                        <Input type="number" defaultValue={30} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max Keepalive Misses</label>
                        <Input type="number" defaultValue={3} />
                      </div>
                   </div>
                </div>
             </SectionCard>
           </>
        )}

        {activeTab === "tunnels" && (
          <SectionCard title="Port Forwarding (SSH Tunnels)" icon={<Network className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-3">
               <SettingRow label="Enable Tunneling" description="Global toggle for SSH tunnel functionality">
                 <FakeSwitch defaultChecked={true} />
               </SettingRow>

               <div className="flex flex-col gap-3 mt-2">
                  <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active Tunnels (S2S)</span>
                     <Button variant="outline" size="sm" className="h-7 text-xs border-accent-brand/40 text-accent-brand"><Plus className="size-3.5 mr-1.5" /> Add Tunnel</Button>
                  </div>

                  <div className="flex flex-col gap-3">
                     {[1].map(i => (
                        <div key={i} className="flex flex-col gap-3 p-3 border border-border bg-muted/20 relative">
                           <button className="absolute top-2 right-2 text-destructive"><Trash2 className="size-3.5"/></button>
                           <div className="grid grid-cols-3 gap-3">
                              <div className="flex flex-col gap-1">
                                 <label className="text-[10px] font-bold text-muted-foreground">Mode</label>
                                 <select className="h-7 text-xs bg-background border border-border"><option>Remote (R2L)</option><option>Local (L2R)</option><option>Dynamic (SOCKS)</option></select>
                              </div>
                              <div className="flex flex-col gap-1">
                                 <label className="text-[10px] font-bold text-muted-foreground">Source Port</label>
                                 <Input className="h-7 text-xs" defaultValue="8080" />
                              </div>
                              <div className="flex flex-col gap-1">
                                 <label className="text-[10px] font-bold text-muted-foreground">Endpoint Host</label>
                                 <Input className="h-7 text-xs" defaultValue="localhost" />
                              </div>
                           </div>
                           <div className="flex items-center justify-between mt-1">
                              <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-muted-foreground">Auto-start</span>
                                    <FakeSwitch />
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <div className="size-1.5 rounded-full bg-accent-brand" />
                                    <span className="text-[10px] font-bold text-accent-brand uppercase tracking-widest">Connected</span>
                                 </div>
                              </div>
                              <Button variant="outline" size="sm" className="h-7 text-xs">Disconnect</Button>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "docker" && (
          <SectionCard title="Docker Integration" icon={<Box className="size-3.5"/>}>
             <div className="flex flex-col gap-4 py-3">
                <SettingRow label="Enable Docker Support" description="Monitor containers and images on this host via Docker socket">
                  <FakeSwitch />
                </SettingRow>
                <div className="flex flex-col gap-1.5">
                   <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Docker Endpoint</label>
                   <Input defaultValue="/var/run/docker.sock" />
                   <span className="text-[10px] text-muted-foreground">Unix socket or TCP endpoint (e.g. tcp://127.0.0.1:2375)</span>
                </div>
             </div>
          </SectionCard>
        )}

        {activeTab === "files" && (
          <SectionCard title="File Manager Settings" icon={<FolderSearch className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-3">
               <SettingRow label="Enable File Manager" description="Browse and manage files over SFTP">
                 <FakeSwitch defaultChecked={true} />
               </SettingRow>
               <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Starting Path</label>
                  <Input placeholder="/home/user" defaultValue={host?.defaultPath || "~"} />
               </div>
               <SettingRow label="Show Hidden Files" description="Always show files starting with a dot">
                 <FakeSwitch defaultChecked={true} />
               </SettingRow>
            </div>
          </SectionCard>
        )}

        {activeTab === "stats" && (
          <>
            <SectionCard title="Monitoring Config" icon={<Activity className="size-3.5"/>}>
               <div className="flex flex-col gap-4 py-3">
                  <SettingRow label="Status Checks" description="Periodically ping the host to check availability">
                    <FakeSwitch defaultChecked={true} />
                  </SettingRow>
                  <SettingRow label="Metrics Collection" description="Collect CPU, RAM, and Disk usage data">
                    <FakeSwitch defaultChecked={true} />
                  </SettingRow>

                  <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Check Interval</label>
                        <div className="flex gap-2">
                           <Input type="number" defaultValue={60} className="flex-1" />
                           <select className="h-9 bg-background border border-border text-xs"><option>Seconds</option><option>Minutes</option></select>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Metrics Interval</label>
                        <div className="flex gap-2">
                           <Input type="number" defaultValue={30} className="flex-1" />
                           <select className="h-9 bg-background border border-border text-xs"><option>Seconds</option><option>Minutes</option></select>
                        </div>
                      </div>
                   </div>

                   <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Enabled Widgets</label>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                         {["CPU Usage", "Memory Usage", "Disk Usage", "Network Traffic", "System Info", "Process List", "Login History", "Firewall Status"].map(w => (
                            <div key={w} className="flex items-center gap-2">
                               <FakeSwitch defaultChecked={true} />
                               <span className="text-xs">{w}</span>
                            </div>
                         ))}
                      </div>
                   </div>
               </div>
            </SectionCard>

            <SectionCard title="Quick Actions" icon={<Zap className="size-3.5" />}>
               <div className="flex flex-col gap-4 py-3">
                  <div className="flex items-center justify-between">
                     <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Snippet Assignments</span>
                     <Button variant="outline" size="sm" className="h-7 text-xs border-accent-brand/40 text-accent-brand"><Plus className="size-3.5 mr-1.5" /> Add Action</Button>
                  </div>
                  <div className="flex flex-col gap-2">
                     <div className="flex items-center gap-2 p-2 bg-muted/20 border border-border">
                        <Input className="h-8 text-xs flex-1" placeholder="Action Name" defaultValue="Restart Nginx" />
                        <select className="flex h-8 flex-1 border border-border bg-background px-2 text-xs outline-none">
                           <option>System Update</option>
                           <option>Clear Logs</option>
                           <option>Check SSL</option>
                        </select>
                        <button className="text-destructive"><Trash2 className="size-3.5"/></button>
                     </div>
                  </div>
               </div>
            </SectionCard>
          </>
        )}

        {activeTab === "remote" && (
           <SectionCard title="Remote Desktop Config" icon={<Monitor className="size-3.5" />}>
              <div className="flex flex-col gap-4 py-3">
                 {connectionType === "rdp" && (
                    <div className="flex flex-col gap-4">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Domain</label>
                             <Input placeholder="WORKGROUP" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security Mode</label>
                             <select className="h-9 bg-background border border-border text-xs"><option>Any</option><option>NLA</option><option>TLS</option><option>RDP</option></select>
                          </div>
                       </div>
                       <SettingRow label="Ignore Certificate" description="Allow connections to servers with self-signed certificates">
                          <FakeSwitch defaultChecked={true} />
                       </SettingRow>
                    </div>
                 )}

                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Settings</label>
                    <div className="grid grid-cols-3 gap-3">
                       <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold">Width</span>
                          <Input className="h-8 text-xs" placeholder="Auto" />
                       </div>
                       <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold">Height</span>
                          <Input className="h-8 text-xs" placeholder="Auto" />
                       </div>
                       <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-muted-foreground font-bold">DPI</span>
                          <Input className="h-8 text-xs" defaultValue="96" />
                       </div>
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 pt-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Performance & Audio</label>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                       <SettingRow label="Enable Audio">
                          <FakeSwitch defaultChecked={true} />
                       </SettingRow>
                       <SettingRow label="Wallpaper">
                          <FakeSwitch />
                       </SettingRow>
                       <SettingRow label="Theming">
                          <FakeSwitch />
                       </SettingRow>
                       <SettingRow label="Font Smoothing">
                          <FakeSwitch defaultChecked={true} />
                       </SettingRow>
                    </div>
                 </div>
              </div>
           </SectionCard>
        )}

        {activeTab === "sharing" && (
           <SectionCard title="Resource Sharing" icon={<Share2 className="size-3.5" />}>
              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                 <Users className="size-12 mb-4 text-accent-brand" />
                 <span className="text-sm font-semibold uppercase tracking-widest">Collaborative Access</span>
                 <span className="text-xs">Sharing requires an active Team subscription</span>
              </div>
           </SectionCard>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-3 mb-6">
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
        <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand px-8" onClick={() => {
          toast.success("Host configuration saved");
          onBack();
        }}>
          Save Host
        </Button>
      </div>
    </div>
  );
}

function CredentialEditorView({ credential, activeTab, onBack }: { credential: Credential | null, activeTab: string, onBack: () => void }) {
  const [type, setType] = useState(credential?.type || "password");

  return (
    <div className="flex flex-col gap-3">
      {activeTab === "general" && (
        <SectionCard title="Basic Information" icon={<Info className="size-3.5"/>}>
          <div className="grid grid-cols-2 gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Friendly Name</label>
              <Input placeholder="e.g. Production SSH Key" defaultValue={credential?.name || ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Folder</label>
              <Input placeholder="e.g. Server Keys" defaultValue={credential?.folder || ""} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
              <Input placeholder="Optional details..." defaultValue={credential?.description || ""} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</label>
              <Input placeholder="space separated" defaultValue={credential?.tags?.join(" ") || ""} />
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === "auth" && (
        <SectionCard title="Authentication Details" icon={<Lock className="size-3.5"/>}>
          <div className="flex flex-col gap-4 py-3">
             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
                <div className="flex gap-2">
                  {["password", "key"].map(m => (
                    <button
                      key={m}
                      onClick={() => setType(m as any)}
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                        type === m
                          ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "key" ? "SSH Private Key" : "Password"}
                    </button>
                  ))}
                </div>
             </div>

             <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                <Input placeholder="e.g. root or deploy" defaultValue={credential?.username || ""} />
             </div>

             {type === "password" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                  <Input type="password" placeholder="••••••••" defaultValue={credential?.value || ""} />
                </div>
             )}

             {type === "key" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Private Key</label>
                    <textarea
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      rows={8}
                      defaultValue={credential?.value || ""}
                      className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Public Key (Optional)</label>
                    <textarea
                      placeholder="ssh-rsa AAAAB3Nza..."
                      rows={3}
                      defaultValue={credential?.publicKey || ""}
                      className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Passphrase (Optional)</label>
                    <Input type="password" placeholder="••••••••" defaultValue={credential?.passphrase || ""} />
                  </div>
                </div>
             )}
          </div>
        </SectionCard>
      )}

      <div className="flex justify-end gap-3 mt-3">
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
        <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand px-8" onClick={() => {
          toast.success("Credential saved");
          onBack();
        }}>
          Save Credential
        </Button>
      </div>
    </div>
  );
}

type UserProfileSection = "account" | "appearance" | "security";

function SettingRow({label, badge, description, children}: {
  label: string;
  badge?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          {badge &&
            <span className="text-[10px] font-bold text-yellow-500 border border-yellow-500/40 px-1">{badge}</span>}
        </div>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      <div className="shrink-0 ml-8">{children}</div>
    </div>
  );
}

function FakeSwitch({defaultChecked = false}: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      onClick={() => setOn(o => !o)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${on ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function SectionCard({title, icon, children}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      <div className="px-4 py-1">
        {children}
      </div>
    </div>
  );
}

const ACCENT_COLORS = [
  { id: "orange",  label: "Orange",  value: "oklch(0.75 0.15 55)" },
  { id: "blue",    label: "Blue",    value: "oklch(0.60 0.18 240)" },
  { id: "green",   label: "Green",   value: "oklch(0.65 0.18 145)" },
  { id: "purple",  label: "Purple",  value: "oklch(0.60 0.18 290)" },
  { id: "pink",    label: "Pink",    value: "oklch(0.65 0.18 340)" },
  { id: "cyan",    label: "Cyan",    value: "oklch(0.65 0.14 195)" },
] as const;
type AccentColorId = (typeof ACCENT_COLORS)[number]["id"];

function applyAccentColor(id: AccentColorId) {
  const color = ACCENT_COLORS.find(c => c.id === id);
  if (color) document.documentElement.style.setProperty("--accent-brand", color.value);
}

function UserProfileTab() {
  const [section, setSection] = useState<UserProfileSection>("account");
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [themeChoice, setThemeChoice] = useState("dark");
  const [accentColor, setAccentColor] = useState<AccentColorId>(
    () => (localStorage.getItem("termix-accent") as AccentColorId) ?? "orange"
  );

  function handleAccentChange(id: AccentColorId) {
    setAccentColor(id);
    localStorage.setItem("termix-accent", id);
    applyAccentColor(id);
  }

  const SECTIONS: { id: UserProfileSection; label: string; icon: React.ReactNode }[] = [
    {id: "account", label: "Account", icon: <User className="size-3.5"/>},
    {id: "appearance", label: "Appearance", icon: <Palette className="size-3.5"/>},
    {id: "security", label: "Security", icon: <Shield className="size-3.5"/>},
  ];

  const THEMES = [
    {id: "light", label: "Light", icon: <Sun className="size-3.5"/>},
    {id: "dark", label: "Dark", icon: <Moon className="size-3.5"/>},
    {id: "system", label: "System", icon: <Monitor className="size-3.5"/>},
    {id: "dracula", label: "Dracula", icon: <Palette className="size-3.5"/>},
    {id: "catppuccin", label: "Catppuccin", icon: <Palette className="size-3.5"/>},
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">User Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your account, appearance, and security</p>
        </div>
      </Card>

      <div className="flex flex-row min-h-0 flex-1 overflow-hidden px-3 py-3 gap-3">
        {/* Left nav */}
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  section === s.id
                    ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </Card>

          <Card className="flex flex-col overflow-hidden py-0 gap-0 mt-auto">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("termix:logout"))}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
            >
              <X className="size-3.5"/>
              Logout
            </button>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>*]:shrink-0 gap-3">

          {/* ACCOUNT */}
          {section === "account" && (
            <>
              <SectionCard title="Account Info" icon={<User className="size-3.5"/>}>
                <div className="grid grid-cols-2 gap-x-8 py-2">
                  <div className="flex flex-col py-2">
                    <span
                      className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Username</span>
                    <span className="text-base font-semibold mt-0.5">Username</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Role</span>
                    <div className="flex gap-1.5 mt-0.5 flex-wrap">
                      <span
                        className="inline-flex items-center px-2 py-0.5 text-xs font-semibold border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">Administrator</span>
                    </div>
                  </div>
                  <div className="flex flex-col py-2">
                    <span
                      className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Auth Method</span>
                    <span className="text-base font-semibold mt-0.5">Local</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Two-Factor Auth</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      {totpEnabled
                        ? <><ShieldCheck className="size-4 text-accent-brand"/><span
                          className="text-base font-semibold text-accent-brand">Enabled</span></>
                        : <span className="text-base font-semibold text-muted-foreground">Disabled</span>
                      }
                    </span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span
                      className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
                    <span className="text-base font-semibold mt-0.5 text-accent-brand">v1.0.0</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Danger Zone" icon={<AlertCircle className="size-3.5"/>}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-destructive">Delete Account</span>
                    <span className="text-xs text-muted-foreground">Permanently delete your account and all data</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 ml-8"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Account
                  </Button>
                </div>
              </SectionCard>
            </>
          )}

          {/* APPEARANCE */}
          {section === "appearance" && (
            <>
              <SectionCard title="Language & Localization" icon={<Languages className="size-3.5"/>}>
                <SettingRow label="Language" description="Select your preferred display language">
                  <select
                    className="px-2.5 py-1.5 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring">
                    <option>English</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Spanish</option>
                  </select>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Theme" icon={<Palette className="size-3.5"/>}>
                <div className="flex flex-col gap-2 py-3">
                  <span className="text-xs text-muted-foreground">Select your preferred color theme</span>
                  <div className="grid grid-cols-5 gap-2 mt-1">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setThemeChoice(t.id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-2.5 border text-xs font-semibold transition-colors ${
                          themeChoice === t.id
                            ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Accent Color" icon={<Palette className="size-3.5"/>}>
                <div className="flex flex-col gap-2 py-3">
                  <span className="text-xs text-muted-foreground">Choose the accent color used throughout the app</span>
                  <div className="grid grid-cols-6 gap-2 mt-1">
                    {ACCENT_COLORS.map(ac => (
                      <button
                        key={ac.id}
                        onClick={() => handleAccentChange(ac.id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-2 border text-xs font-semibold transition-colors ${
                          accentColor === ac.id
                            ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span
                          className="size-4 rounded-full border border-border/50"
                          style={{ background: ac.value }}
                        />
                        {ac.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="File Manager" icon={<FolderSearch className="size-3.5"/>}>
                <SettingRow label="File Color Coding" description="Color-code files by type in the file manager">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Terminal" icon={<Terminal className="size-3.5"/>}>
                <SettingRow label="Command Autocomplete" description="Show autocomplete suggestions while typing">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Command History Tracking" description="Track commands run in terminal sessions">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Terminal Syntax Highlighting" badge="BETA"
                            description="Highlight syntax in terminal output">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Command Palette Shortcut" description="Enable the command palette keyboard shortcut">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
                <SettingRow label="Terminal Session Persistence" badge="BETA"
                            description="Keep terminal sessions alive between reconnects">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Host Sidebar" icon={<Server className="size-3.5"/>}>
                <SettingRow label="Show Host Tags" description="Display tags on hosts in the sidebar">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Snippets" icon={<Play className="size-3.5"/>}>
                <SettingRow label="Default Folders Collapsed" description="Collapse snippet folders by default">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
                <SettingRow label="Confirm Before Execution"
                            description="Show a confirmation dialog before running a snippet">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Updates" icon={<RefreshCw className="size-3.5"/>}>
                <SettingRow label="Disable Update Checks"
                            description="Stop Termix from checking for new versions on startup">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>
            </>
          )}

          {/* SECURITY */}
          {section === "security" && (
            <>
              <SectionCard title="Two-Factor Authentication" icon={<Shield className="size-3.5"/>}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">TOTP Authenticator</span>
                    <span className="text-xs text-muted-foreground">
                      {totpEnabled ? "Two-factor authentication is currently enabled on your account" : "Add an extra layer of security using an authenticator app"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`shrink-0 ml-8 ${totpEnabled ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" : "border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"}`}
                    onClick={() => {
                      if (totpEnabled) setTotpEnabled(false);
                      else setShowTotpSetup(true);
                    }}
                  >
                    {totpEnabled ? "Disable TOTP" : "Enable TOTP"}
                  </Button>
                </div>
                {showTotpSetup && !totpEnabled && (
                  <div className="border border-border bg-muted/20 p-4 mb-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setup TOTP</span>
                      <button onClick={() => setShowTotpSetup(false)}
                              className="text-muted-foreground hover:text-foreground">
                        <X className="size-3.5"/>
                      </button>
                    </div>
                    <div className="flex items-center justify-center p-4 bg-background border border-border">
                      <div
                        className="size-32 bg-muted flex items-center justify-center text-xs text-muted-foreground">QR
                        Code
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground text-center">Scan the QR code with your authenticator app, then enter the 6-digit code below</span>
                    <Input placeholder="000000" className="text-center font-mono tracking-widest text-lg h-10"/>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1"
                              onClick={() => setShowTotpSetup(false)}>Cancel</Button>
                      <Button variant="outline" size="sm"
                              className="flex-1 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                              onClick={() => {
                                setTotpEnabled(true);
                                setShowTotpSetup(false);
                              }}>
                        <CheckCircle2 className="size-3.5"/>Verify & Enable
                      </Button>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Change Password" icon={<Lock className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Current
                      Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Current password" className="pr-9"/>
                      <button onClick={() => setShowPassword(o => !o)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">New
                      Password</label>
                    <Input type="password" placeholder="New password"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Confirm New
                      Password</label>
                    <Input type="password" placeholder="Confirm new password"/>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm"
                            className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                      <KeyRound className="size-3.5"/>Update Password
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {/* Delete account dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Delete Account</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action is permanent and cannot be undone. All your data will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
              <span className="text-xs text-destructive">All sessions, hosts, credentials, and settings associated with your account will be permanently deleted.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Confirm
                Password</label>
              <Input type="password" placeholder="Enter your password to confirm"/>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="size-3.5"/>Delete Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AdminSection = "general" | "oidc" | "users" | "sessions" | "roles" | "database" | "api-keys";

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  {id: "general", label: "General", icon: <Settings className="size-3.5"/>},
  {id: "oidc", label: "OIDC", icon: <Shield className="size-3.5"/>},
  {id: "users", label: "Users", icon: <User className="size-3.5"/>},
  {id: "sessions", label: "Sessions", icon: <Activity className="size-3.5"/>},
  {id: "roles", label: "Roles", icon: <KeyRound className="size-3.5"/>},
  {id: "database", label: "Database", icon: <Database className="size-3.5"/>},
  {id: "api-keys", label: "API Keys", icon: <Network className="size-3.5"/>},
];

const MOCK_USERS = [
  {id: "1", username: "admin", isAdmin: true, isOidc: false, passwordHash: "x"},
  {id: "2", username: "deploy", isAdmin: false, isOidc: false, passwordHash: "x"},
  {id: "3", username: "oidcuser", isAdmin: false, isOidc: true, passwordHash: null},
  {id: "4", username: "dualuser", isAdmin: false, isOidc: true, passwordHash: "x"},
];

const MOCK_SESSIONS = [
  {
    id: "s1",
    username: "admin",
    deviceInfo: "Chrome 124 / Windows",
    createdAt: "2026-05-01 08:00",
    lastActiveAt: "2m ago",
    expiresAt: "2026-05-08 08:00",
    isCurrentSession: true
  },
  {
    id: "s2",
    username: "deploy",
    deviceInfo: "Firefox 125 / Linux",
    createdAt: "2026-04-30 14:22",
    lastActiveAt: "1h ago",
    expiresAt: "2026-05-07 14:22",
    isCurrentSession: false
  },
  {
    id: "s3",
    username: "oidcuser",
    deviceInfo: "Safari / iOS",
    createdAt: "2026-04-29 09:11",
    lastActiveAt: "2d ago",
    expiresAt: "2026-05-06 09:11",
    isCurrentSession: false
  },
];

const MOCK_ROLES = [
  {
    id: "r1",
    name: "administrator",
    displayName: "Administrator",
    description: "Full access to all resources",
    isSystem: true
  },
  {id: "r2", name: "operator", displayName: "Operator", description: "Can manage hosts and terminals", isSystem: false},
  {id: "r3", name: "viewer", displayName: "Viewer", description: "Read-only access to stats", isSystem: false},
];

const MOCK_API_KEYS = [
  {
    id: "k1",
    name: "CI Pipeline",
    username: "deploy",
    tokenPrefix: "tmx_ci_abc1",
    createdAt: "2026-04-01T00:00:00Z",
    expiresAt: null,
    lastUsedAt: "2026-05-01T10:00:00Z",
    isActive: true
  },
  {
    id: "k2",
    name: "Monitoring",
    username: "admin",
    tokenPrefix: "tmx_mon_xyz9",
    createdAt: "2026-03-15T00:00:00Z",
    expiresAt: "2026-06-15T00:00:00Z",
    lastUsedAt: "2026-05-01T09:55:00Z",
    isActive: true
  },
];

function AdminToggle({on, onToggle}: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${on ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}/>
    </button>
  );
}

function AdminSettingsTab() {
  const [section, setSection] = useState<AdminSection>("general");
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [allowPasswordLogin, setAllowPasswordLogin] = useState(true);
  const [allowPasswordReset, setAllowPasswordReset] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("24");
  const [statusInterval, setStatusInterval] = useState("60");
  const [metricsInterval, setMetricsInterval] = useState("30");
  const [guacEnabled, setGuacEnabled] = useState(false);
  const [guacUrl, setGuacUrl] = useState("guacd:4822");
  const [logLevel, setLogLevel] = useState("info");
  const [importFile, setImportFile] = useState<string | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<typeof MOCK_USERS[0] | null>(null);
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);
  const [linkAccountTarget, setLinkAccountTarget] = useState<{ id: string; username: string } | null>(null);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-xs text-muted-foreground">Manage users, authentication, sessions, and security</p>
        </div>
      </Card>

      <div className="flex flex-row flex-1 min-h-0 overflow-hidden px-3 py-3 gap-3">
        {/* Left nav */}
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">
            {ADMIN_SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  section === s.id
                    ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>*]:shrink-0 gap-3">

          {/* GENERAL */}
          {section === "general" && (
            <>
              <SectionCard title="Registration & Login" icon={<User className="size-3.5"/>}>
                <SettingRow label="Allow User Registration" description="Let new users create accounts on their own">
                  <AdminToggle on={allowRegistration} onToggle={() => setAllowRegistration(o => !o)}/>
                </SettingRow>
                <SettingRow label="Allow Password Login" description="Allow users to log in with username and password">
                  <AdminToggle on={allowPasswordLogin} onToggle={() => setAllowPasswordLogin(o => !o)}/>
                </SettingRow>
                <SettingRow label="Allow Password Reset" description="Let users reset their password via email">
                  <AdminToggle on={allowPasswordReset} onToggle={() => setAllowPasswordReset(o => !o)}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Session Timeout" icon={<Activity className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">How long before inactive sessions are automatically expired</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={720}
                      value={sessionTimeout}
                      onChange={e => setSessionTimeout(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Min: 1 hour · Max: 720 hours (30 days). Existing sessions are unaffected until next activity.</span>
                </div>
              </SectionCard>

              <SectionCard title="Monitoring Defaults" icon={<Activity className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Default polling intervals applied to all hosts unless overridden per-host</span>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Status
                      Check Interval</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={statusInterval} onChange={e => setStatusInterval(e.target.value)}
                             className="w-24"/>
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Metrics
                      Interval</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={metricsInterval} onChange={e => setMetricsInterval(e.target.value)}
                             className="w-24"/>
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Guacamole Integration" icon={<Network className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Enable Apache Guacamole for RDP and VNC remote desktop sessions</span>
                  <SettingRow label="Enable Guacamole">
                    <AdminToggle on={guacEnabled} onToggle={() => setGuacEnabled(o => !o)}/>
                  </SettingRow>
                  {guacEnabled && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">guacd
                        URL</label>
                      <Input value={guacUrl} onChange={e => setGuacUrl(e.target.value)} placeholder="guacd:4822"/>
                      <span className="text-xs text-muted-foreground">The host:port of your guacd daemon</span>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Log Level" icon={<Settings className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Controls verbosity of server-side logs</span>
                  <div className="flex gap-2">
                    {["debug", "info", "warn", "error"].map(l => (
                      <button
                        key={l}
                        onClick={() => setLogLevel(l)}
                        className={`px-3 py-1.5 text-xs font-semibold border capitalize transition-colors ${logLevel === l ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {/* OIDC */}
          {section === "oidc" && (
            <SectionCard title="External Authentication (OIDC)" icon={<Shield className="size-3.5"/>}>
              <div className="flex flex-col gap-3 py-3">
                <span className="text-xs text-muted-foreground">Configure an OpenID Connect provider for SSO login. All fields marked * are required.</span>
                {([
                  {label: "Client ID", placeholder: "your-client-id", required: true},
                  {label: "Client Secret", placeholder: "your-client-secret", type: "password", required: true},
                  {label: "Authorization URL", placeholder: "https://your-provider.com/oauth2/auth", required: true},
                  {label: "Issuer URL", placeholder: "https://your-provider.com", required: true},
                  {label: "Token URL", placeholder: "https://your-provider.com/oauth2/token", required: true},
                  {label: "User Identifier Path", placeholder: "sub", required: true},
                  {label: "Display Name Path", placeholder: "name", required: true},
                  {label: "Scopes", placeholder: "openid email profile", required: true},
                  {label: "Override Userinfo URL", placeholder: "https://your-provider.com/oauth2/userinfo"},
                ] as { label: string; placeholder: string; type?: string; required?: boolean }[]).map(f => (
                  <div key={f.label} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {f.label}{f.required && <span className="text-accent-brand ml-0.5">*</span>}
                    </label>
                    <Input type={f.type ?? "text"} placeholder={f.placeholder}/>
                  </div>
                ))}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Allowed
                    Users</label>
                  <span className="text-xs text-muted-foreground">One email per line. Leave empty to allow all authenticated users.</span>
                  <textarea
                    placeholder={"user@example.com\nanother@example.com"}
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <Button variant="outline"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-3.5"/>Remove OIDC
                  </Button>
                  <Button variant="outline"
                          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                    <RefreshCw className="size-3.5"/>Save Configuration
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* USERS */}
          {section === "users" && (
            <SectionCard title="User Management" icon={<User className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_USERS.length} users</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                  <Button variant="outline" size="sm"
                          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                          onClick={() => setCreateUserOpen(true)}>
                    <Plus className="size-3.5"/>Create User
                  </Button>
                </div>
              </div>
              {MOCK_USERS.map(user => {
                const authLabel = user.isOidc && user.passwordHash ? "Dual Auth" : user.isOidc ? "OIDC" : "Local";
                return (
                  <div key={user.id}
                       className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-8 bg-muted border border-border flex items-center justify-center text-xs font-bold shrink-0">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">{user.username}</span>
                        <div className="flex items-center gap-1.5">
                          {user.isAdmin && <span
                            className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">ADMIN</span>}
                          <span
                            className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground">{authLabel.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground"
                              title="Edit user" onClick={() => {
                        setEditUserTarget(user);
                        setEditUserOpen(true);
                      }}>
                        <Pencil className="size-3.5"/>
                      </Button>
                      {user.isOidc && !user.passwordHash && (
                        <Button variant="ghost" size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                title="Link to password account" onClick={() => {
                          setLinkAccountTarget({id: user.id, username: user.username});
                          setLinkAccountOpen(true);
                        }}>
                          <Share2 className="size-3.5"/>
                        </Button>
                      )}
                      {user.isOidc && user.passwordHash && (
                        <Button variant="ghost" size="icon"
                                className="size-7 text-muted-foreground hover:text-accent-brand" title="Unlink OIDC">
                          <X className="size-3.5"/>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive" disabled={user.isAdmin}
                              title="Delete user">
                        <Trash2 className="size-3.5"/>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </SectionCard>
          )}

          {/* SESSIONS */}
          {section === "sessions" && (
            <SectionCard title="Session Management" icon={<Activity className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_SESSIONS.length} active sessions</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                </div>
              </div>
              {MOCK_SESSIONS.map(session => (
                <div key={session.id}
                     className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{session.username}</span>
                      {session.isCurrentSession && <span
                        className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">CURRENT</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{session.deviceInfo}</span>
                    <span className="text-xs text-muted-foreground">
                      Created: {session.createdAt} · Last active: {session.lastActiveAt} · Expires: {session.expiresAt}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button variant="ghost" size="sm"
                            className="text-xs text-muted-foreground hover:text-destructive h-7 px-2">
                      Revoke All
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5"/>
                    </Button>
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          {/* ROLES */}
          {section === "roles" && (
            <>
              <SectionCard title="Role Management" icon={<KeyRound className="size-3.5"/>}>
                <div className="flex items-center justify-between py-2.5 border-b border-border">
                  <span className="text-xs text-muted-foreground">{MOCK_ROLES.length} roles</span>
                  <Button variant="outline" size="sm"
                          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                          onClick={() => setShowCreateRole(o => !o)}>
                    <Plus className="size-3.5"/>Create Role
                  </Button>
                </div>
                {showCreateRole && (
                  <div className="flex flex-col gap-3 py-3 border-b border-border">
                    <span
                      className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Role</span>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Role
                        Name <span className="text-accent-brand">*</span></label>
                      <Input placeholder="e.g., developer"/>
                      <span className="text-xs text-muted-foreground">Lowercase, no spaces. Used internally.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Display
                        Name <span className="text-accent-brand">*</span></label>
                      <Input placeholder="e.g., Developer"/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Description</label>
                      <textarea rows={2} placeholder="Optional description"
                                className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"/>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowCreateRole(false)}>Cancel</Button>
                      <Button variant="outline" size="sm"
                              className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">Create</Button>
                    </div>
                  </div>
                )}
                {MOCK_ROLES.map(role => (
                  <div key={role.id}
                       className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{role.displayName}</span>
                        {role.isSystem
                          ? <span
                            className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground">SYSTEM</span>
                          : <span
                            className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">CUSTOM</span>
                        }
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{role.name}</span>
                      {role.description && <span className="text-xs text-muted-foreground">{role.description}</span>}
                    </div>
                    {!role.isSystem && (
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button variant="ghost" size="icon"
                                className="size-7 text-muted-foreground hover:text-foreground">
                          <Pencil className="size-3.5"/>
                        </Button>
                        <Button variant="ghost" size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-3.5"/>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            </>
          )}

          {/* DATABASE */}
          {section === "database" && (
            <SectionCard title="Database" icon={<Database className="size-3.5"/>}>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Export Database</span>
                  <span className="text-xs text-muted-foreground">Download a backup of all hosts, credentials, and settings</span>
                </div>
                <Button variant="outline" size="sm"
                        className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand shrink-0 ml-8">
                  Export
                </Button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Import Database</span>
                  <span className="text-xs text-muted-foreground">
                    {importFile ? `Selected: ${importFile}` : "Restore data from a previously exported .sqlite backup file"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-8">
                  <div className="relative">
                    <input
                      type="file" accept=".sqlite,.db"
                      onChange={e => setImportFile(e.target.files?.[0]?.name ?? null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" size="sm" className="pointer-events-none">
                      {importFile ? "Change File" : "Select File"}
                    </Button>
                  </div>
                  {importFile && (
                    <Button variant="outline" size="sm"
                            className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                      Import
                    </Button>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {/* API KEYS */}
          {section === "api-keys" && (
            <SectionCard title="API Keys" icon={<Network className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_API_KEYS.length} keys</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                  <Button variant="outline" size="sm"
                          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                          onClick={() => setShowCreateKey(o => !o)}>
                    <Plus className="size-3.5"/>Create Key
                  </Button>
                </div>
              </div>
              {showCreateKey && (
                <div className="flex flex-col gap-3 py-3 border-b border-border">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New API Key</span>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Key
                      Name <span className="text-accent-brand">*</span></label>
                    <Input placeholder="e.g., CI Pipeline"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Scoped
                      User <span className="text-accent-brand">*</span></label>
                    <Input placeholder="Select a user"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Expires
                      At <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input type="date"/>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowCreateKey(false)}>Cancel</Button>
                    <Button variant="outline" size="sm"
                            className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">Create
                      Key</Button>
                  </div>
                </div>
              )}
              {MOCK_API_KEYS.map(key => (
                <div key={key.id}
                     className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{key.name}</span>
                      {!key.isActive && <span
                        className="text-[10px] font-semibold px-1.5 py-px border border-destructive/40 bg-destructive/10 text-destructive">REVOKED</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">User: {key.username}</span>
                    <span className="text-xs font-mono text-muted-foreground">{key.tokenPrefix}…</span>
                    <span className="text-xs text-muted-foreground">
                      Created: {key.createdAt.split("T")[0]} · Last used: {key.lastUsedAt.split("T")[0]} · Expires: {key.expiresAt ? key.expiresAt.split("T")[0] : "Never"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive shrink-0 ml-4"
                          title="Revoke key">
                    <Trash2 className="size-3.5"/>
                  </Button>
                </div>
              ))}
            </SectionCard>
          )}

        </div>
      </div>

      {/* Create User */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create User</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a new local account with a username and password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username <span
                className="text-accent-brand">*</span></label>
              <Input placeholder="Enter username"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password <span
                className="text-accent-brand">*</span></label>
              <div className="relative">
                <Input type="password" placeholder="Enter password" className="pr-9"/>
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <Eye className="size-4"/>
                </button>
              </div>
              <span className="text-xs text-muted-foreground">Minimum 6 characters.</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button variant="outline"
                    className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
              Create User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Manage User: {editUserTarget?.username}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Edit roles, admin status, sessions, and account settings.
            </DialogDescription>
          </DialogHeader>
          {editUserTarget && (
            <div className="flex flex-col gap-0 mt-1 divide-y divide-border">
              {/* Info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-3">
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Username</span>
                  <span className="text-sm font-semibold">{editUserTarget.username}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Auth Type</span>
                  <span className="text-sm font-semibold">
                    {editUserTarget.isOidc && editUserTarget.passwordHash ? "Dual Auth" : editUserTarget.isOidc ? "OIDC" : "Local"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Admin Status</span>
                  <span
                    className="text-sm font-semibold">{editUserTarget.isAdmin ? "Administrator" : "Regular User"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">User ID</span>
                  <span className="text-xs font-mono text-muted-foreground truncate">{editUserTarget.id}</span>
                </div>
              </div>
              {/* Admin toggle */}
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Administrator</span>
                  <span className="text-xs text-muted-foreground">Full access to all admin settings</span>
                </div>
                <AdminToggle on={editUserTarget.isAdmin} onToggle={() => {
                }}/>
              </div>
              {/* Roles */}
              <div className="flex flex-col gap-2 py-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roles</span>
                <div className="flex flex-wrap gap-1.5">
                  {MOCK_ROLES.filter(r => !r.isSystem).map(role => (
                    <div key={role.id} className="flex items-center gap-1 px-2 py-1 border border-border text-xs">
                      <span>{role.displayName}</span>
                      <button className="text-muted-foreground hover:text-destructive ml-1"><X className="size-3"/>
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm"
                          className="h-7 text-xs border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                    <Plus className="size-3"/>Add Role
                  </Button>
                </div>
              </div>
              {/* Sessions */}
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Revoke All Sessions</span>
                  <span className="text-xs text-muted-foreground">Force this user to log in again on all devices</span>
                </div>
                <Button variant="outline" size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 ml-8">
                  Revoke
                </Button>
              </div>
              {/* Danger */}
              <div className="flex flex-col gap-2 py-3">
                <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
                  <span className="text-xs text-destructive">Deleting this user is permanent. All their data will be removed.</span>
                </div>
                <Button variant="outline"
                        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={editUserTarget.isAdmin}>
                  <Trash2 className="size-3.5"/>Delete {editUserTarget.username}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link Account */}
      <Dialog open={linkAccountOpen} onOpenChange={setLinkAccountOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Link OIDC to Password Account</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Merge the OIDC account <span
              className="font-semibold text-foreground">{linkAccountTarget?.username}</span> with an existing local
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
              <div className="flex flex-col gap-1 text-xs text-destructive">
                <span>This will:</span>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Delete the OIDC-only account</li>
                  <li>Add OIDC login capability to the target account</li>
                  <li>Allow the user to log in via both OIDC and password</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target
                Username <span className="text-accent-brand">*</span></label>
              <Input placeholder="Enter the local account username to link to"/>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setLinkAccountOpen(false)}>Cancel</Button>
            <Button variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              Link Accounts
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

type DockerContainerStatus = "running" | "exited" | "paused" | "created" | "restarting";

type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status: DockerContainerStatus;
  cpu: number;
  memory: string;
  ports: string[];
  created: string;
};

const MOCK_CONTAINERS: DockerContainer[] = [
  { id: "d1a2b3c4e5f6", name: "nginx-proxy", image: "nginx:latest", status: "running", cpu: 0.8, memory: "12.4 MB", ports: ["80:80", "443:443"], created: "2 days ago" },
  { id: "f6e5d4c3b2a1", name: "postgres-db", image: "postgres:15-alpine", status: "running", cpu: 2.5, memory: "256.2 MB", ports: ["5432:5432"], created: "5 days ago" },
  { id: "a1b2c3d4e5f6", name: "redis-cache", image: "redis:7.0-alpine", status: "paused", cpu: 0, memory: "42.1 MB", ports: ["6379:6379"], created: "1 week ago" },
  { id: "f1e2d3c4b5a6", name: "webapp-api", image: "node:18-slim", status: "running", cpu: 8.4, memory: "312.8 MB", ports: ["3000:3000"], created: "3 hours ago" },
  { id: "b1c2d3e4f5a6", name: "worker-node-01", image: "python:3.11-slim", status: "exited", cpu: 0, memory: "0 B", ports: [], created: "1 day ago" },
  { id: "c1d2e3f4a5b6", name: "monitoring-grafana", image: "grafana/grafana:latest", status: "running", cpu: 1.2, memory: "128.5 MB", ports: ["3001:3000"], created: "4 days ago" },
  { id: "d1e2f3a4b5c6", name: "prometheus", image: "prom/prometheus:latest", status: "running", cpu: 3.7, memory: "512.2 MB", ports: ["9090:9090"], created: "4 days ago" },
];

function DockerBadge({ status }: { status: DockerContainerStatus }) {
  let colorClass = "border-border text-muted-foreground";
  if (status === "running") colorClass = "border-accent-brand/40 text-accent-brand bg-accent-brand/10";
  if (status === "paused") colorClass = "border-yellow-500/40 text-yellow-500 bg-yellow-500/10";
  if (status === "exited") colorClass = "border-destructive/40 text-destructive bg-destructive/5";

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase tracking-wider ${colorClass}`}>
      {status}
    </span>
  );
}

function DockerContainerCard({ container, onSelect, onAction }: {
  container: DockerContainer,
  onSelect: (id: string) => void,
  onAction: (id: string, action: string, e: React.MouseEvent) => void
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
        `[${new Date().toISOString()}] INFO: Worker processed batch ${Math.floor(Math.random() * 1000)} - Success`
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
    netIn: 1.2,
    netOut: 0.8,
    ioRead: 450,
    ioWrite: 120
  });

  useEffect(() => {
    if (container.status !== "running") return;
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        cpu: Math.max(0.1, Math.min(99, prev.cpu + (Math.random() * 2 - 1))),
        mem: Math.max(1, prev.mem + (Math.random() * 5 - 2.5)),
        netIn: prev.netIn + Math.random() * 0.1,
        netOut: prev.netOut + Math.random() * 0.05
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
              <div className="h-full bg-accent-brand transition-all duration-500" style={{width: `${metrics.cpu}%`}}/>
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
              <div className="h-full bg-accent-brand transition-all duration-500" style={{width: `${(metrics.mem / 1024) * 100}%`}}/>
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
  const { instance, ref } = useXTerm()
  const commandBuffer = useRef("");

  useEffect(() => {
    if (!instance || !ref.current) return;

    instance.options.theme = {
      background: '#111210',
      foreground: '#ffffff',
      cursor: '#fb923c',
    };

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

        if (command === "ls") {
          instance.writeln("app.js  config.json  node_modules  package.json  public  src");
        } else if (command === "ps") {
          instance.writeln("PID   USER     TIME  COMMAND");
          instance.writeln("    1 root      0:00 node app.js");
          instance.writeln("   42 root      0:00 sh");
          instance.writeln("   43 root      0:00 ps");
        } else if (command === "whoami") {
          instance.writeln("root");
        } else if (command === "") {
          // empty
        } else {
          instance.writeln(`sh: ${command}: not found`);
        }

        commandBuffer.current = "";
        instance.write(prompt);
      } else if (char === "\u007f") {
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1);
          instance.write("\b \b");
        }
      } else if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
        commandBuffer.current += char;
        instance.write(char);
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch (e) {}
    });
    resizeObserver.observe(ref.current);

    setTimeout(() => {
      try { fitAddon.fit(); } catch (e) {}
    }, 100);

    return () => {
      disposable.dispose();
      resizeObserver.disconnect();
    }
  }, [instance, containerName]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#111210] p-1 border border-border">
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function DockerTab({ label }: { label: string }) {
  const [containers, setContainers] = useState<DockerContainer[]>(MOCK_CONTAINERS);
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detailTab, setDetailTab] = useState<"logs" | "stats" | "console">("logs");

  const selectedContainer = containers.find(c => c.id === selectedId);

  const filtered = containers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.image.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleAction = (id: string, action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containers.find(c => c.id === id);
    if (!container) return;

    if (action === "start") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running", cpu: 0.5, memory: "12.4 MB" } : c));
      toast.success(`Started container ${container.name}`);
    } else if (action === "stop") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "exited", cpu: 0, memory: "0 B" } : c));
      toast.info(`Stopped container ${container.name}`);
    } else if (action === "restart") {
      setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "restarting" } : c));
      toast.promise(new Promise(resolve => setTimeout(resolve, 1500)), {
        loading: `Restarting ${container.name}...`,
        success: () => {
          setContainers(prev => prev.map(c => c.id === id ? { ...c, status: "running" } : c));
          return `Container ${container.name} restarted successfully`;
        },
        error: "Failed to restart container",
      });
    } else if (action === "delete") {
      setContainers(prev => prev.filter(c => c.id !== id));
      toast.error(`Deleted container ${container.name}`);
    } else if (action === "create") {
      const newId = Math.random().toString(36).substring(2, 12);
      const newContainer: DockerContainer = {
        id: newId,
        name: `new-container-${newId.substring(0, 4)}`,
        image: "alpine:latest",
        status: "created",
        cpu: 0,
        memory: "0 B",
        ports: [],
        created: "just now"
      };
      setContainers(prev => [newContainer, ...prev]);
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
              { id: "logs", label: "Logs", icon: <List className="size-3.5"/> },
              { id: "stats", label: "Stats", icon: <Activity className="size-3.5"/> },
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
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {detailTab === "logs" && <DockerLogViewer containerName={selectedContainer.name}/>}
            {detailTab === "stats" && <DockerContainerStats container={selectedContainer}/>}
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
                onSelect={(id) => {
                  setSelectedId(id);
                  setView("detail");
                }}
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

function TunnelCard({ tunnel, onAction }: { tunnel: Tunnel, onAction: (id: string, action: string) => void }) {
  const isConnected = tunnel.status === "CONNECTED";
  const isConnecting = tunnel.status === "CONNECTING";
  const isError = tunnel.status === "ERROR";

  let statusColor = "text-muted-foreground border-border bg-muted/30";
  if (isConnected) statusColor = "text-accent-brand border-accent-brand/40 bg-accent-brand/10";
  if (isConnecting) statusColor = "text-blue-400 border-blue-400/40 bg-blue-400/10";
  if (isError) statusColor = "text-destructive border-destructive/40 bg-destructive/10";

  return (
    <Card className="flex flex-col overflow-hidden p-0 gap-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground"/>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Port {tunnel.sourcePort}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold ${statusColor}`}>
          {isConnecting ? <RefreshCw className="size-3 animate-spin"/> : isConnected ? <Wifi className="size-3"/> : isError ? <AlertCircle className="size-3"/> : tunnel.status === "WAITING" ? <Clock className="size-3"/> : <WifiOff className="size-3"/>}
          {tunnel.status}
        </div>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Destination</span>
          <span className="text-sm font-mono font-semibold truncate" title={`${tunnel.endpointHost}:${tunnel.endpointPort}`}>
            {tunnel.endpointHost}:{tunnel.endpointPort}
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground uppercase">{tunnel.mode}</span>
          </div>
        </div>

        {isError && tunnel.reason && (
          <div className="flex items-start gap-2 p-2 bg-destructive/5 border border-destructive/20 text-destructive text-[10px]">
            <AlertCircle className="size-3 mt-0.5 shrink-0"/>
            <span>{tunnel.reason}</span>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          {isConnected ? (
            <Button variant="outline" size="sm" className="flex-1 h-8 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive gap-1.5" onClick={() => onAction(tunnel.id, "stop")}>
              <Square className="size-3"/> Stop
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1 h-8 text-accent-brand border-accent-brand/40 hover:bg-accent-brand/10 hover:text-accent-brand gap-1.5" disabled={isConnecting} onClick={() => onAction(tunnel.id, "start")}>
              {isConnecting ? <RefreshCw className="size-3 animate-spin"/> : <Play className="size-3"/>}
              Start
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Settings className="size-3.5"/>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5"/>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TunnelTab({label}: { label: string }) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([
    {
      id: "T-101",
      hostId: "web-01",
      sourcePort: 8080,
      endpointHost: "localhost",
      endpointPort: 80,
      status: "CONNECTED",
      mode: "local"
    },
    {
      id: "T-102",
      hostId: "web-01",
      sourcePort: 3000,
      endpointHost: "localhost",
      endpointPort: 3000,
      status: "DISCONNECTED",
      mode: "remote"
    },
    {
      id: "T-103",
      hostId: "web-01",
      sourcePort: 5432,
      endpointHost: "db-primary-internal",
      endpointPort: 5432,
      status: "WAITING",
      mode: "local"
    },
    {
      id: "T-104",
      hostId: "web-01",
      sourcePort: 6379,
      endpointHost: "redis-cache-01.internal",
      endpointPort: 6379,
      status: "ERROR",
      mode: "local",
      reason: "Connection timed out (10.0.5.12)"
    },
    {
      id: "T-105",
      hostId: "web-01",
      sourcePort: 9000,
      endpointHost: "dynamic-socks5",
      endpointPort: 0,
      status: "CONNECTED",
      mode: "dynamic"
    }
  ]);

  const handleAction = (id: string, action: string) => {
    if (action === "start") {
      setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "CONNECTING" } : t));
      setTimeout(() => {
        setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "CONNECTED" } : t));
        toast.success(`Tunnel ${id} established successfully`);
      }, 1500);
    } else if (action === "stop") {
      setTunnels(prev => prev.map(t => t.id === id ? { ...t, status: "DISCONNECTED" } : t));
      toast.info(`Tunnel ${id} disconnected`);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div className="flex items-center gap-3">
          <div className="size-10 border border-border bg-muted flex items-center justify-center shrink-0">
            <Network className="size-5 text-accent-brand"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{label}</h1>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-brand"/>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">SSH Tunnels</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0">
          <Button variant="outline" size="default" className="gap-2 font-semibold">
            <Plus className="size-3.5"/>
            Add Tunnel
          </Button>
          <Separator orientation="vertical" className="h-8 mx-3"/>
          <Button variant="ghost" size="icon"><Settings className="size-4 text-accent-brand"/></Button>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tunnels.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map(tunnel => (
              <TunnelCard key={tunnel.id} tunnel={tunnel} onAction={handleAction} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
            <Network className="size-16 mb-4"/>
            <span className="text-xl font-bold uppercase tracking-widest">No Tunnels</span>
            <span className="text-xs font-semibold">Configure SSH tunnels for this host</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HostItem({host, onOpenTab}: { host: Host; onOpenTab: (type: TabType) => void }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isOnline = host.online;

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <div
        className="flex items-center justify-between group px-2 py-1 hover:bg-muted cursor-pointer border-l-2 border-l-transparent"
        onClick={() => onOpenTab("terminal")}
        onContextMenu={e => {
          e.preventDefault();
          setDropdownOpen(true);
        }}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full shrink-0 ${isOnline ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
            <span className="text-xs font-medium truncate">{host.name}</span>
          </div>
          <span className="text-xs text-muted-foreground truncate">{host.user}@{host.address}</span>
          {host.tags && host.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {host.tags.map(tag => (
                <span key={tag}
                      className="inline-flex items-center gap-0.5 px-1.5 py-px text-[10px] font-medium bg-muted text-muted-foreground border border-border leading-none">
                                    <Tag className="size-2 shrink-0"/>
                  {tag}
                                </span>
              ))}
            </div>
          )}
        </div>
        <div
          className={`flex items-center gap-0.5 shrink-0 transition-opacity ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <Button variant="ghost" size="icon-xs" className="text-accent-brand" onClick={e => {
            e.stopPropagation();
            onOpenTab("terminal");
          }}>
            <Terminal/>
          </Button>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={e => e.stopPropagation()}>
              <MoreHorizontal/>
            </Button>
          </DropdownMenuTrigger>
        </div>
      </div>
      <DropdownMenuContent side="right" align="start" sideOffset={17} alignOffset={0}
                           className="w-44 [clip-path:inset(-4px_-4px_-4px_0px)]">
        <DropdownMenuItem onClick={() => onOpenTab("terminal")}>
          <Terminal className="size-3.5"/>
          Open Terminal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("stats")}>
          <Server className="size-3.5"/>
          Open Server Stats
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("files")}>
          <FolderSearch className="size-3.5"/>
          Open File Manager
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("docker")}>
          <Box className="size-3.5"/>
          Open Docker
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("tunnel")}>
          <Network className="size-3.5"/>
          Open Tunnel
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Pencil className="size-3.5"/>
          Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolderItem({folder, depth = 0, onOpenTab}: {
  folder: HostFolder;
  depth?: number;
  onOpenTab: (host: Host, type: TabType) => void
}) {
  const [open, setOpen] = useState(depth === 0);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 w-full px-2 py-1 hover:bg-muted text-left"
      >
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${open ? "rotate-90 text-accent-brand" : "text-muted-foreground"}`}/>
        {open
          ? <FolderOpen className="size-3.5 shrink-0 text-accent-brand"/>
          : <Folder className="size-3.5 shrink-0 text-muted-foreground"/>
        }
        <span className="text-xs font-medium">{folder.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border pl-1">
          {folder.children.map((child, i) =>
            isFolder(child)
              ? <FolderItem key={i} folder={child} depth={depth + 1} onOpenTab={onOpenTab}/>
              : <HostItem key={i} host={child} onOpenTab={(type) => onOpenTab(child, type)}/>
          )}
        </div>
      )}
    </div>
  );
}


function App() {
  const stored = getStoredAuth();
  const [authed, setAuthed] = useState(!!stored?.loggedIn);
  const [authUsername, setAuthUsername] = useState(stored?.username ?? "");

  useEffect(() => {
    const saved = localStorage.getItem("termix-accent") as AccentColorId | null;
    if (saved) applyAccentColor(saved);
  }, []);

  if (!authed) {
    return (
      <>
        <Auth onLogin={(u) => { setAuthUsername(u); setAuthed(true); }} />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return <AppShell username={authUsername} onLogout={() => { clearStoredAuth(); setAuthed(false); setAuthUsername(""); }} />;
}

const SINGLETON_TAB_LABELS: Partial<Record<TabType, string>> = {
  "host-manager": "Host Manager",
  "user-profile": "User Profile",
  "admin-settings": "Admin Settings",
  "docker": "Docker",
  "tunnel": "Tunnels",
};

function AppShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
  const [activeTabId, setActiveTabId] = useState("dashboard");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const lastShiftTime = useRef(0);
  const pendingHostManagerEvent = useRef<string | null>(null);

  useEffect(() => {
    if (activeTabId === "host-manager" && pendingHostManagerEvent.current) {
      const eventName = pendingHostManagerEvent.current;
      pendingHostManagerEvent.current = null;
      window.dispatchEvent(new Event(eventName));
    }
  }, [activeTabId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft") {
        const now = Date.now();
        if (now - lastShiftTime.current < 300) {
          setCommandPaletteOpen(prev => !prev);
        }
        lastShiftTime.current = now;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handle = () => onLogout();
    window.addEventListener("termix:logout", handle);
    return () => window.removeEventListener("termix:logout", handle);
  }, [onLogout]);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabBarOpen, setTabBarOpen] = useState(true);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [toolsWidth, setToolsWidth] = useState(304);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [toolsDragging, setToolsDragging] = useState(false);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragData = useRef<{
    id: string;
    index: number;
    startX: number;
    startY: number;
    offsetX: number;
    width: number;
    barTop: number;
    barHeight: number;
    x: number;
    y: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    if (!dragTabId) return;

    function onPointerMove(e: PointerEvent) {
      if (!dragData.current || !tabBarRef.current) return;
      const d = dragData.current;
      if (Math.abs(e.clientX - d.startX) > 5) didDrag.current = true;

      const barRect = tabBarRef.current.getBoundingClientRect();
      const x = Math.max(barRect.left, Math.min(barRect.right - d.width, e.clientX - d.offsetX));
      const y = d.barTop;
      setDragPos({x, y});

      const centerX = e.clientX - d.offsetX + d.width / 2;
      let newTarget = d.index;
      tabEls.current.forEach((el, id) => {
        if (id === d.id) return;
        const rect = el.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        const idx = tabs.findIndex(t => t.id === id);
        if (idx < d.index && centerX < mid) newTarget = Math.min(newTarget, idx);
        if (idx > d.index && centerX > mid) newTarget = Math.max(newTarget, idx);
      });

      if (tabs[0].type === "dashboard") {
        newTarget = Math.max(1, newTarget);
      }

      dragTargetRef.current = newTarget;
      setDragTargetIndex(newTarget);
    }

    function onPointerUp() {
      if (!dragData.current) return;
      const {id, index} = dragData.current;
      const to = dragTargetRef.current ?? index;
      if (to !== index) {
        setTabs(prev => {
          if (prev[0].id === id) return prev;
          const next = [...prev];
          next.splice(to, 0, next.splice(index, 1)[0]);
          return next;
        });
      }
      dragData.current = null;
      dragTargetRef.current = null;
      setDragTabId(null);
      setDragTargetIndex(null);
      setDragPos(null);
      setTimeout(() => {
        didDrag.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragTabId, tabs]);

  const onSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSidebarDragging(true);
    const startX = e.clientX;
    const startW = sidebarWidth;

    function onMove(ev: MouseEvent) {
      const w = Math.max(160, Math.min(480, startW + ev.clientX - startX));
      setSidebarWidth(w);
    }

    function onUp() {
      setSidebarDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const onToolsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setToolsDragging(true);
    const startX = e.clientX;
    const startW = toolsWidth;

    function onMove(ev: MouseEvent) {
      const w = Math.max(200, Math.min(600, startW - (ev.clientX - startX)));
      setToolsWidth(w);
    }

    function onUp() {
      setToolsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [toolsWidth]);

  function openTab(host: Host, type: TabType) {
    setTabs(prev => {
      const same = prev.filter(t => t.type === type && t.label.replace(/ \(\d+\)$/, "") === host.name);
      if (same.length === 0) {
        const tab = {id: `${host.name}-${type}`, type, label: host.name};
        setActiveTabId(tab.id);
        return [...prev, tab];
      }
      const next = prev.map(t =>
        t.id === same[0].id && !/\(\d+\)$/.test(t.label)
          ? {...t, label: `${host.name} (1)`}
          : t
      );
      const tab = {id: `${host.name}-${type}-${Date.now()}`, type, label: `${host.name} (${same.length + 1})`};
      setActiveTabId(tab.id);
      return [...next, tab];
    });
  }

  function openSingletonTab(type: TabType, pendingEvent?: string) {
    const id = type;
    if (pendingEvent) pendingHostManagerEvent.current = pendingEvent;
    setTabs(prev => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, {id, type, label: SINGLETON_TAB_LABELS[type] ?? type}];
    });
    setActiveTabId(id);
  }

  return (
    <>
      <div className="flex w-screen h-screen bg-background">
        <div
          className={`relative flex flex-col bg-sidebar shrink-0 overflow-hidden ${sidebarOpen ? `border-r transition-colors ${sidebarDragging ? "border-accent-brand/60" : "border-border"}` : ""}`}
          style={{width: sidebarOpen ? sidebarWidth : 0, transition: sidebarOpen ? undefined : "width 0.2s"}}
        >
          <div className="flex flex-row items-center gap-2 border-b border-border h-12.5 px-3 shrink-0">
            <Logo className="w-6 h-6 shrink-0 text-muted-foreground"/>
            <span className="text-xl font-semibold text-muted-foreground">
                        Termix
                    </span>
            <Button variant="ghost" size="icon" className="ml-auto size-7 text-muted-foreground"
                    onClick={() => setSidebarWidth(256)}>
              <RefreshCw className="size-3.5"/>
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground"
                    onClick={() => setSidebarOpen(false)}>
              <Menu className="size-3.5"/>
            </Button>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <div className="p-2">
              <Button variant="outline"
                      className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                      onClick={() => openSingletonTab("host-manager")}>
                <Server/>
                Host Manager
              </Button>
            </div>
            <Separator/>
            <div className="p-2">
              <Input placeholder="Search hosts..."/>
            </div>
            <Separator/>
            <div className="px-2 py-1">
              {hostTree.children.map((child, i) =>
                isFolder(child)
                  ? <FolderItem key={i} folder={child} onOpenTab={openTab}/>
                  : <HostItem key={i} host={child} onOpenTab={(type) => openTab(child, type)}/>
              )}
            </div>
          </div>
          <div className="border-t border-border p-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-auto py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {username.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold leading-tight">{username || "User"}</span>
                      <span className="text-xs text-muted-foreground leading-tight">Administrator</span>
                    </div>
                  </div>
                  <ChevronUp className="text-accent-brand"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" sideOffset={5} avoidCollisions={false}
                                   style={{width: sidebarWidth - 1}} className="[clip-path:inset(-4px_0px_0px_0px)]">
                <DropdownMenuItem onClick={() => openSingletonTab("user-profile")}>
                  <User className="size-3.5"/>
                  User Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSingletonTab("admin-settings")}>
                  <Settings className="size-3.5"/>
                  Admin Settings
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                  <KeyRound className="size-3.5"/>
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {sidebarOpen && (
            <div
              onMouseDown={onSidebarMouseDown}
              className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${sidebarDragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"}`}
            />
          )}
        </div>

        <div
          className={`relative flex flex-row flex-1 min-w-0 overflow-hidden transition-all duration-200 ${!sidebarOpen ? "pl-4" : ""}`}>
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-4 bg-sidebar border-r border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-3"/>
            </button>
          )}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <div
              className={`flex items-end bg-sidebar shrink-0 min-w-0 transition-all duration-200 ${tabBarOpen ? "h-12.5 border-b border-border" : "h-0"}`}>
              {/* Scrollable tab list */}
              <div ref={tabBarRef} className="flex h-full flex-1 min-w-0 overflow-x-auto scrollbar-none pl-px">
                {tabs.map((tab, index) => {
                  const active = tab.id === activeTabId;
                  const isDragging = dragTabId === tab.id;
                  const dragIdx = tabs.findIndex(t => t.id === dragTabId);
                  const target = dragTargetIndex ?? dragIdx;
                  let translateX = 0;
                  if (dragTabId && !isDragging && dragIdx !== -1 && target !== null && target !== dragIdx) {
                    const draggedWidth = tabEls.current.get(dragTabId)?.offsetWidth ?? 0;
                    if (dragIdx < target && index > dragIdx && index <= target) translateX = -(draggedWidth);
                    else if (dragIdx > target && index < dragIdx && index >= target) translateX = draggedWidth;
                  }
                  return (
                    <div
                      key={tab.id}
                      ref={el => {
                        if (el) tabEls.current.set(tab.id, el); else tabEls.current.delete(tab.id);
                      }}
                      onClick={() => !dragTabId && !didDrag.current && setActiveTabId(tab.id)}
                      onMouseDown={e => {
                        if (e.button === 1 && tab.type !== "dashboard") {
                          e.preventDefault();
                          setTabs(prev => {
                            const next = prev.filter(t => t.id !== tab.id);
                            if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                            return next;
                          });
                        }
                      }}
                      onPointerDown={e => {
                        if (e.button !== 0 || tab.type === "dashboard") return;
                        e.preventDefault();
                        const el = tabEls.current.get(tab.id);
                        if (!el || !tabBarRef.current) return;
                        const rect = el.getBoundingClientRect();
                        const barRect = tabBarRef.current.getBoundingClientRect();
                        dragData.current = {
                          id: tab.id,
                          index,
                          startX: e.clientX,
                          startY: e.clientY,
                          offsetX: e.clientX - rect.left,
                          width: rect.width,
                          barTop: barRect.top,
                          barHeight: barRect.height,
                          x: rect.left,
                          y: barRect.top,
                        };
                        setDragTabId(tab.id);
                        setDragTargetIndex(index);
                        setDragPos({x: rect.left, y: barRect.top});
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      }}
                      style={{
                        transform: isDragging ? "none" : `translateX(${translateX}px)`,
                        transition: dragTabId && !isDragging ? "transform 200ms ease" : "none",
                        opacity: isDragging ? 0 : 1,
                        cursor: tab.type === "dashboard" ? "pointer" : isDragging ? "grabbing" : "grab",
                        userSelect: "none",
                      }}
                      className={`group/tab flex items-center gap-2 shrink-0 transition-colors border-r border-border text-sm
                                        ${index === 0 && tab.type !== "dashboard" ? "border-l border-border" : ""}
                                        ${tab.type === "dashboard"
                        ? `px-3.5 ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                        : `px-4 font-medium ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                      }`}
                    >
                      {tabIcon(tab.type)}
                      {tab.type !== "dashboard" && tab.label}
                      {tab.type !== "dashboard" && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setTabs(prev => {
                              const next = prev.filter(t => t.id !== tab.id);
                              if (active) setActiveTabId(next[next.length - 1].id);
                              return next;
                            });
                          }}
                          className={`flex items-center justify-center size-4 rounded-sm transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted ml-1 ${active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"}`}
                        >
                          <X className="size-3"/>
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* Floating ghost tab while dragging */}
                {dragTabId && dragPos && (() => {
                  const tab = tabs.find(t => t.id === dragTabId)!;
                  const active = tab.id === activeTabId;
                  return (
                    <div
                      style={{
                        position: "fixed",
                        left: dragPos.x,
                        top: dragPos.y,
                        width: tabEls.current.get(dragTabId)?.offsetWidth,
                        height: tabEls.current.get(dragTabId)?.offsetHeight,
                        pointerEvents: "none",
                        zIndex: 9999,
                        opacity: 0.85,
                      }}
                      className={`flex items-center gap-2 shrink-0 border border-border text-sm shadow-lg
                        ${tab.type === "dashboard"
                        ? `px-3.5 ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "bg-sidebar text-muted-foreground"}`
                        : `px-4 font-medium ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "bg-sidebar text-muted-foreground"}`
                      }`}
                    >
                      {tabIcon(tab.type)}
                      {tab.type !== "dashboard" && tab.label}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center h-full shrink-0">
                <Separator orientation="vertical"/>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"
                            className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground">
                      <ChevronDown className="size-4"/>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={1}
                                       className="w-56 border-t-0 [clip-path:inset(0px_-4px_-4px_-4px)]">
                    {tabs.map(tab => (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`flex items-center justify-between ${tab.id === activeTabId ? "text-foreground" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          {tabIcon(tab.type)}
                          {tab.type === "dashboard" ? "Dashboard" : tab.label}
                        </div>
                        {tab.type !== "dashboard" && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setTabs(prev => {
                                const next = prev.filter(t => t.id !== tab.id);
                                if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                                return next;
                              });
                            }}
                            className="text-muted-foreground hover:text-foreground ml-2"
                          >
                            <X className="size-3"/>
                          </button>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Separator orientation="vertical"/>
                <Button variant="ghost" size="icon"
                        className={`h-full w-12.5 rounded-none hover:text-foreground ${toolsOpen ? "text-accent-brand bg-accent-brand/10" : "text-muted-foreground"}`}
                        onClick={() => setToolsOpen(o => !o)}>
                  <Hammer className="size-4"/>
                </Button>
                <Separator orientation="vertical"/>
                <Button variant="ghost" size="icon"
                        className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground"
                        onClick={() => setQuickConnectOpen(true)}>
                  <Zap className="size-4"/>
                </Button>
                <Separator orientation="vertical"/>
                <Button variant="ghost" size="icon"
                        className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground"
                        onClick={() => setTabBarOpen(o => !o)}>
                  <ChevronUp className={`size-4 transition-transform ${tabBarOpen ? "" : "rotate-180"}`}/>
                </Button>
              </div>
            </div>
            {!tabBarOpen && (
              <button
                onClick={() => setTabBarOpen(true)}
                className="flex items-center justify-center w-full h-4 bg-sidebar border-b border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ChevronDown className="size-3"/>
              </button>
            )}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {(() => {
                const activeTab = tabs.find(t => t.id === activeTabId)!;
                switch (activeTab.type) {
                  case "dashboard":
                    return <DashboardTab onOpenSingletonTab={openSingletonTab} onOpenTab={openTab}/>;
                  case "terminal":
                    return <TerminalTab label={activeTab.label}/>;
                  case "stats":
                    return <StatsTab label={activeTab.label}/>;
                  case "files":
                    return <FilesTab label={activeTab.label}/>;
                  case "host-manager":
                    return <HostManagerTab/>;
                  case "user-profile":
                    return <UserProfileTab/>;
                  case "admin-settings":
                    return <AdminSettingsTab/>;
                  case "docker":
                    return <DockerTab/>;
                  case "tunnel":
                    return <TunnelTab/>;
                }
              })()}
            </div>
          </div>
          <div
            className={`relative flex flex-col bg-sidebar shrink-0 overflow-hidden ${toolsOpen ? `border-l transition-colors ${toolsDragging ? "border-accent-brand/60" : "border-border"}` : ""}`}
            style={{width: toolsOpen ? toolsWidth : 0, transition: toolsOpen ? undefined : "width 0.2s"}}
          >
            {toolsOpen && (
              <div
                onMouseDown={onToolsMouseDown}
                className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${toolsDragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"}`}
              />
            )}
            <ToolsSidebar onClose={() => setToolsOpen(false)} tabs={tabs} width={toolsWidth}
                          onResetWidth={() => setToolsWidth(304)}/>
          </div>
        </div>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        setIsOpen={setCommandPaletteOpen}
        hosts={hosts}
        onOpenTab={(type, label) => {
          if (["dashboard", "host-manager", "user-profile", "admin-settings", "docker", "tunnel"].includes(type)) {
            openSingletonTab(type);
          } else if (label) {
            const host = hosts.find(h => h.name === label);
            if (host) openTab(host, type);
          }
        }}
      />
      <QuickConnectDialog open={quickConnectOpen} onOpenChange={setQuickConnectOpen}/>
      <Toaster position="bottom-right" />
    </>
  )
}

type ToolsTab = "ssh-tools" | "snippets" | "history" | "split-screen";
type SplitMode = "none" | "2-way" | "3-way" | "4-way" | "5-way" | "6-way";

type Snippet = {
  id: number;
  name: string;
  description?: string;
  command: string;
  folderId: number | null;
};

type SnippetFolder = {
  id: number;
  name: string;
  color: string;
  icon: FolderIconId;
  open: boolean;
};

const TOOLS_TABS: { id: ToolsTab; label: string }[] = [
  {id: "ssh-tools", label: "SSH Tools"},
  {id: "snippets", label: "Snippets"},
  {id: "history", label: "History"},
  {id: "split-screen", label: "Split Screen"},
];

const SPLIT_MODES: { id: SplitMode; label: string }[] = [
  {id: "none", label: "None"},
  {id: "2-way", label: "2-Way"},
  {id: "3-way", label: "3-Way"},
  {id: "4-way", label: "4-Way"},
  {id: "5-way", label: "5-Way"},
  {id: "6-way", label: "6-Way"},
];

const FOLDER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#a855f7", "#ec4899", "#6b7280",
];

const FOLDER_ICONS = ["folder", "server", "cloud", "database", "box", "network", "copy", "settings", "cpu", "globe"] as const;
type FolderIconId = typeof FOLDER_ICONS[number];

function FolderIconEl({icon, className, style}: {
  icon: FolderIconId;
  className?: string;
  style?: React.CSSProperties
}) {
  const props = {className, style};
  switch (icon) {
    case "folder":
      return <Folder {...props}/>;
    case "server":
      return <Server {...props}/>;
    case "cloud":
      return <Cloud {...props}/>;
    case "database":
      return <Database {...props}/>;
    case "box":
      return <Box {...props}/>;
    case "network":
      return <Network {...props}/>;
    case "copy":
      return <Copy {...props}/>;
    case "settings":
      return <Settings {...props}/>;
    case "cpu":
      return <Cpu {...props}/>;
    case "globe":
      return <Globe {...props}/>;
  }
}

const INITIAL_FOLDERS: SnippetFolder[] = [
  {id: 1, name: "test", color: "#f97316", icon: "server", open: true},
  {id: 2, name: "Uncategorized", color: "#6b7280", icon: "folder", open: true},
];

const INITIAL_SNIPPETS: Snippet[] = [
  {id: 2, name: "test", command: "test", folderId: 1},
  {id: 1, name: "test", description: "test", command: "test", folderId: 2},
];

function CreateSnippetDialog({open, onOpenChange, folders, onCreate}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: SnippetFolder[];
  onCreate: (s: Omit<Snippet, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [command, setCommand] = useState("");

  function handleCreate() {
    if (!name.trim() || !command.trim()) return;
    onCreate({name: name.trim(), description: description.trim() || undefined, command: command.trim(), folderId});
    setName("");
    setDescription("");
    setFolderId(null);
    setCommand("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create Snippet</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a new command snippet for quick execution
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Name <span className="text-accent-brand">*</span></label>
            <Input placeholder="e.g., Restart Nginx" value={name} onChange={e => setName(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Description <span
              className="font-normal">(Optional)</span></label>
            <Input placeholder="Optional description" value={description}
                   onChange={e => setDescription(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Folder className="size-3.5"/>
              Folder <span className="font-normal">(Optional)</span>
            </label>
            <select
              value={folderId ?? ""}
              onChange={e => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
              className="px-3 py-2 text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No folder (Uncategorized)</option>
              {folders.filter(f => f.name !== "Uncategorized").map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Command <span className="text-accent-brand">*</span></label>
            <textarea
              placeholder="e.g., sudo systemctl restart nginx"
              value={command}
              onChange={e => setCommand(e.target.value)}
              className="w-full h-36 px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline"
                  className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                  onClick={handleCreate}>
            Create Snippet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderDialog({open, onOpenChange, onCreate}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (f: Omit<SnippetFolder, "id" | "open">) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [icon, setIcon] = useState<FolderIconId>("folder");

  function handleCreate() {
    if (!name.trim()) return;
    onCreate({name: name.trim(), color, icon});
    setName("");
    setColor(FOLDER_COLORS[0]);
    setIcon("folder");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create Folder</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Organize your snippets into folders
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Folder Name <span className="text-accent-brand">*</span></label>
            <Input placeholder="e.g., System Commands, Docker Scripts" value={name}
                   onChange={e => setName(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold">Folder Color</label>
            <div className="grid grid-cols-4 gap-2">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-10 transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/50" : "opacity-75 hover:opacity-100"}`}
                  style={{backgroundColor: c}}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold">Folder Icon</label>
            <div className="grid grid-cols-5 gap-2">
              {FOLDER_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center h-11 border transition-colors ${
                    icon === ic
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                  }`}
                >
                  <FolderIconEl icon={ic} className="size-5"/>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Preview</label>
            <div className="flex items-center gap-2 px-3 py-3 border border-border bg-muted/20">
              <FolderIconEl icon={icon} className="size-4 shrink-0" style={{color}}/>
              <span className="text-sm font-semibold">{name || "Folder Name"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline"
                  className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                  onClick={handleCreate}>
            Create Folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type HistoryEntry = {
  id: number;
  command: string;
  host: string;
  time: string;
};

const HISTORY_ENTRIES: HistoryEntry[] = [
  {id: 1, command: "sudo systemctl restart nginx", host: "web-01", time: "2m ago"},
  {id: 2, command: "tail -f /var/log/nginx/error.log", host: "web-01", time: "4m ago"},
  {id: 3, command: "docker ps -a", host: "web-02", time: "9m ago"},
  {id: 4, command: "df -h", host: "db-primary", time: "12m ago"},
  {id: 5, command: "pg_dump mydb > backup.sql", host: "db-primary", time: "15m ago"},
  {id: 6, command: "top", host: "db-replica", time: "21m ago"},
  {id: 7, command: "ls -la /var/www", host: "web-02", time: "28m ago"},
  {id: 8, command: "cat /etc/hosts", host: "stage-web", time: "34m ago"},
  {id: 9, command: "sudo apt update && sudo apt upgrade -y", host: "stage-db", time: "41m ago"},
  {id: 10, command: "systemctl status postgresql", host: "db-primary", time: "55m ago"},
  {id: 11, command: "free -m", host: "web-01", time: "1h ago"},
  {id: 12, command: "netstat -tlnp", host: "stage-web", time: "1h ago"},
];

function HistoryTab() {
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[]>(HISTORY_ENTRIES);

  const filtered = search
    ? entries.filter(e =>
      e.command.toLowerCase().includes(search.toLowerCase()) ||
      e.host.toLowerCase().includes(search.toLowerCase())
    )
    : entries;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
        <Input placeholder="Search history..." value={search} onChange={e => setSearch(e.target.value)}
               className="pl-8"/>
      </div>
      <div className="flex items-center justify-between">
        <span
          className="text-xs text-muted-foreground">{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setEntries([])}
          className="text-xs text-accent-brand hover:text-accent-brand/70"
        >
          Clear All
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <span className="text-xs text-muted-foreground/60 text-center py-8">No history entries</span>
        )}
        {filtered.map(entry => (
          <div
            key={entry.id}
            className="group flex flex-col gap-1 px-2.5 py-2 border border-border bg-background hover:border-muted-foreground/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-mono text-foreground break-all leading-relaxed">{entry.command}</span>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost" size="icon"
                  className="size-6 text-muted-foreground hover:text-foreground"
                  onClick={() => navigator.clipboard.writeText(entry.command)}
                >
                  <Copy className="size-3"/>
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="size-6 text-muted-foreground hover:text-destructive"
                  onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}
                >
                  <Trash2 className="size-3"/>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60">{entry.host}</span>
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground/60">{entry.time}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const PANE_COUNTS: Record<SplitMode, number> = {
  "none": 0, "2-way": 2, "3-way": 3, "4-way": 4, "5-way": 5, "6-way": 6,
};

const PANE_LAYOUTS: Record<SplitMode, string> = {
  "none": "",
  "2-way": "grid-cols-2 grid-rows-1",
  "3-way": "grid-cols-2 grid-rows-2",
  "4-way": "grid-cols-2 grid-rows-2",
  "5-way": "grid-cols-3 grid-rows-2",
  "6-way": "grid-cols-3 grid-rows-2",
};

function SplitScreenTab({tabs, splitMode, setSplitMode}: {
  tabs: Tab[];
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
}) {
  const paneCount = PANE_COUNTS[splitMode];
  const [panes, setPanes] = useState<(Tab | null)[]>(() => Array(6).fill(null));
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<number | null>(null);

  function handleDrop(paneIndex: number) {
    if (draggingTabId === null) return;
    const tab = tabs.find(t => t.id === draggingTabId) ?? null;
    setPanes(prev => {
      const next = [...prev];
      next[paneIndex] = tab;
      return next;
    });
    setDraggingTabId(null);
    setDragOverPane(null);
  }

  function clearPane(paneIndex: number) {
    setPanes(prev => {
      const next = [...prev];
      next[paneIndex] = null;
      return next;
    });
  }

  return (
    <>
      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {SPLIT_MODES.map(mode => (
          <button
            key={mode.id}
            onClick={() => setSplitMode(mode.id)}
            className={`px-2 py-2 text-xs font-semibold border transition-colors ${
              splitMode === mode.id
                ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {splitMode === "none" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <div className="grid grid-cols-2 gap-1 opacity-30">
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
          </div>
          <span className="text-sm text-muted-foreground mt-1">Select a split screen mode</span>
          <span className="text-xs text-muted-foreground/60">Choose how many tabs you want to view at once</span>
        </div>
      ) : (
        <>
          {/* Layout preview / drop zones */}
          <div className={`grid gap-1.5 ${PANE_LAYOUTS[splitMode]}`}
               style={{aspectRatio: paneCount <= 3 ? "16/9" : "16/10"}}>
            {Array.from({length: paneCount}).map((_, i) => {
              const assigned = panes[i];
              const isOver = dragOverPane === i;
              return (
                <div
                  key={i}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOverPane(i);
                  }}
                  onDragLeave={() => setDragOverPane(null)}
                  onDrop={() => handleDrop(i)}
                  className={`relative flex flex-col items-center justify-center border-2 border-dashed text-center transition-colors min-h-0
                                        ${isOver
                    ? "border-accent-brand bg-accent-brand/10"
                    : assigned
                      ? "border-border bg-muted/30"
                      : "border-border/50 bg-muted/10 hover:border-border hover:bg-muted/20"
                  }
                                        ${splitMode === "3-way" && i === 0 ? "row-span-2" : ""}
                                        ${splitMode === "5-way" && i === 4 ? "col-span-2" : ""}
                                    `}
                >
                  {assigned ? (
                    <>
                      <div className="flex items-center gap-1 px-1">
                        {tabIcon(assigned.type)}
                        <span className="text-xs font-semibold truncate max-w-[80px]">
                                                    {assigned.type === "dashboard" ? "Dashboard" : assigned.label}
                                                </span>
                      </div>
                      <button
                        onClick={() => clearPane(i)}
                        className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-2.5"/>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                                            {isOver ? "Drop here" : `Pane ${i + 1}`}
                                        </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Available tabs to drag */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Open Tabs</span>
            <span className="text-xs text-muted-foreground/60">Drag tabs into the panes above</span>
            <div className="flex flex-col gap-1 mt-0.5">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => setDraggingTabId(tab.id)}
                  onDragEnd={() => {
                    setDraggingTabId(null);
                    setDragOverPane(null);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-2 border cursor-grab active:cursor-grabbing select-none transition-colors ${
                    draggingTabId === tab.id
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="text-muted-foreground shrink-0">{tabIcon(tab.type)}</div>
                  <span className="text-xs font-medium flex-1 truncate">
                                        {tab.type === "dashboard" ? "Dashboard" : tab.label}
                                    </span>
                  <div className="grid grid-cols-2 gap-px opacity-30 shrink-0">
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
            onClick={() => setPanes(Array(6).fill(null))}
          >
            Reset Layout
          </Button>
        </>
      )}
    </>
  );
}

function ToolsSidebar({onClose, tabs, width, onResetWidth}: {
  onClose: () => void;
  tabs: Tab[];
  width: number;
  onResetWidth: () => void
}) {
  const [activeTab, setActiveTab] = useState<ToolsTab>("ssh-tools");
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [keyRecording, setKeyRecording] = useState(false);
  const [rightClickPaste, setRightClickPaste] = useState(false);
  const [folders, setFolders] = useState<SnippetFolder[]>(INITIAL_FOLDERS);
  const [snippets, setSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
  const [createSnippetOpen, setCreateSnippetOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  function handleCreateSnippet(s: Omit<Snippet, "id">) {
    const id = Math.max(0, ...snippets.map(x => x.id)) + 1;
    setSnippets(prev => [...prev, {...s, id}]);
    toast.success("Snippet created successfully");
  }

  function handleCreateFolder(f: Omit<SnippetFolder, "id" | "open">) {
    const id = Math.max(0, ...folders.map(x => x.id)) + 1;
    setFolders(prev => [...prev, {...f, id, open: true}]);
    toast.success("Folder created successfully");
  }

  function toggleFolder(id: number) {
    setFolders(prev => prev.map(f => f.id === id ? {...f, open: !f.open} : f));
  }

  function deleteSnippet(id: number) {
    setSnippets(prev => prev.filter(s => s.id !== id));
  }

  const filtered = snippetSearch
    ? snippets.filter(s =>
      s.name.toLowerCase().includes(snippetSearch.toLowerCase()) ||
      s.command.toLowerCase().includes(snippetSearch.toLowerCase())
    )
    : snippets;

  const namedFolders = folders.filter(f => f.name !== "Uncategorized");
  const uncategorized = folders.find(f => f.name === "Uncategorized");
  const allFolders = [...namedFolders, ...(uncategorized ? [uncategorized] : [])];

  return (
    <>
      <div className="flex flex-col bg-sidebar border-border shrink-0 h-full relative" style={{width}}>
        <div className="flex items-center justify-between px-4 h-12.5 border-b border-border shrink-0">
          <span className="text-base font-bold">Tools</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={onResetWidth}>
              <RefreshCw className="size-3.5"/>
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={onClose}>
              <X className="size-3.5"/>
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 border-b border-border">
          {TOOLS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-b-accent-brand text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 gap-3">
          {activeTab === "ssh-tools" && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest">Key Recording</span>
                <Button
                  variant="outline"
                  className={`w-full ${keyRecording ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10 hover:bg-accent-brand/20 hover:text-accent-brand" : ""}`}
                  onClick={() => setKeyRecording(o => !o)}
                >
                  {keyRecording ? "Stop Key Recording" : "Start Key Recording"}
                </Button>
              </div>
              <Separator/>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest">Settings</span>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Enable right-click copy/paste</span>
                  <button
                    onClick={() => setRightClickPaste(o => !o)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${rightClickPaste ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${rightClickPaste ? "translate-x-4" : "translate-x-0.5"}`}/>
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "snippets" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Select Terminals <span
                  className="text-muted-foreground font-normal">(optional)</span></span>
                <span
                  className="text-xs text-muted-foreground">Execute on current terminal (click to select multiple)</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <button className="text-xs text-accent-brand hover:text-accent-brand/70">Select All</button>
                  <button className="text-xs text-accent-brand hover:text-accent-brand/70">Deselect All</button>
                </div>
              </div>
              <Separator/>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                <Input placeholder="Search snippets..." value={snippetSearch}
                       onChange={e => setSnippetSearch(e.target.value)} className="pl-8"/>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateSnippetOpen(true)}>
                  <Plus className="size-3.5"/>New Snippet
                </Button>
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateFolderOpen(true)}>
                  <Folder className="size-3.5"/>New Folder
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                {allFolders.map(folder => {
                  const folderSnippets = filtered.filter(s =>
                    folder.name === "Uncategorized"
                      ? s.folderId === null || s.folderId === folder.id
                      : s.folderId === folder.id
                  );
                  if (folderSnippets.length === 0 && snippetSearch) return null;
                  return (
                    <div key={folder.id} className="flex flex-col gap-2">
                      <button
                        onClick={() => toggleFolder(folder.id)}
                        className="flex items-center gap-1.5 w-full text-left"
                      >
                        <ChevronDown
                          className={`size-3 text-muted-foreground shrink-0 transition-transform ${folder.open ? "" : "-rotate-90"}`}/>
                        <FolderIconEl icon={folder.icon} className="size-3.5 shrink-0" style={{color: folder.color}}/>
                        <span className="text-xs font-semibold flex-1 truncate"
                              style={{color: folder.name === "Uncategorized" ? undefined : folder.color}}>
                                                {folder.name}
                                            </span>
                        <span className="text-xs text-muted-foreground shrink-0">{folderSnippets.length}</span>
                      </button>
                      {folder.open && (
                        <div className="flex flex-col gap-2 ml-1">
                          {folderSnippets.map(snippet => (
                            <div key={snippet.id}
                                 className="border border-border bg-background p-2.5 flex flex-col gap-2">
                              <div className="flex items-start gap-2">
                                <div className="grid grid-cols-2 gap-px mt-0.5 shrink-0 opacity-30">
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold">{snippet.name}</span>
                                  {snippet.description &&
                                    <span className="text-xs text-muted-foreground">{snippet.description}</span>}
                                  <span className="text-xs text-muted-foreground">ID: {snippet.id}</span>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground font-mono px-1">{snippet.command}</span>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="flex-1 text-xs h-7 gap-1.5">
                                  <Play className="size-3"/>Run
                                </Button>
                                <Button variant="ghost" size="icon"
                                        className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Copy className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon"
                                        className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Pencil className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon"
                                        className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => deleteSnippet(snippet.id)}>
                                  <Trash2 className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon"
                                        className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Share2 className="size-3.5"/>
                                </Button>
                              </div>
                            </div>
                          ))}
                          {folderSnippets.length === 0 && (
                            <span className="text-xs text-muted-foreground/60 pl-1">No snippets in this folder</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "history" && (
            <HistoryTab/>
          )}

          {activeTab === "split-screen" && (
            <SplitScreenTab tabs={tabs} splitMode={splitMode} setSplitMode={setSplitMode}/>
          )}
        </div>

      </div>

      <CreateSnippetDialog
        open={createSnippetOpen}
        onOpenChange={setCreateSnippetOpen}
        folders={folders}
        onCreate={handleCreateSnippet}
      />
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onCreate={handleCreateFolder}
      />
    </>
  );
}

function QuickConnectDialog({open, onOpenChange}: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [authType, setAuthType] = useState<"password" | "key" | "credential">("password");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Quick Connect</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Connect directly to a terminal or file manager session without saving a host configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-1">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">IP Address or
                Hostname</label>
              <Input placeholder="192.168.1.1 or example.com" value={host} onChange={e => setHost(e.target.value)}/>
            </div>
            <div className="flex flex-col gap-1.5 w-24">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Port</label>
              <Input placeholder="22" value={port} onChange={e => setPort(e.target.value)}/>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username</label>
            <Input placeholder="username" value={username} onChange={e => setUsername(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Authentication</label>
            <div className="flex gap-1">
              {(["password", "key", "credential"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAuthType(type)}
                  className={`px-3 py-1 text-xs font-semibold border transition-colors capitalize ${authType === type ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          {authType === "password" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pr-9"
                />
                <button
                  onClick={() => setShowPassword(o => !o)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}
                </button>
              </div>
            </div>
          )}
          {authType === "key" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Private
                Key</label>
              <textarea
                placeholder="Paste private key contents here..."
                className="w-full h-28 px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
          )}
          {authType === "credential" && (
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Credential</label>
              <Input placeholder="Select a saved credential"/>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline"
                  className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
            <Terminal className="size-3.5"/>
            Connect to Terminal
          </Button>
          <Button variant="outline"
                  className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
            <FolderSearch className="size-3.5"/>
            Connect to File Manager
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default App
