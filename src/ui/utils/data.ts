import type { Host, Credential, HostFolder, Tab, DashboardCardConfig, AccentColorId, HistoryEntry, Snippet, SnippetFolder, LayoutPreset } from "./types";

export const hosts: Host[] = [
  {
    id: "1", name: "web-01", user: "deploy", address: "10.0.1.10", port: 22,
    folder: "Production / Web Servers", online: true, cpu: 12, ram: 34, lastAccess: "2m ago",
    tags: ["nginx", "frontend"], authType: "password",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "2", name: "web-02", user: "deploy", address: "10.0.1.11", port: 22,
    folder: "Production / Web Servers", online: true, cpu: 8, ram: 27, lastAccess: "12m ago",
    tags: ["nginx"], authType: "key",
    enableTerminal: true, enableTunnel: false, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "9", name: "web-03", user: "deploy", address: "10.0.1.12", port: 22,
    folder: "Production / Web Servers", online: true, cpu: 19, ram: 41, lastAccess: "7m ago",
    tags: ["nginx", "frontend"], authType: "key",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "10", name: "lb-01", user: "deploy", address: "10.0.1.5", port: 22,
    folder: "Production / Web Servers", online: true, cpu: 4, ram: 15, lastAccess: "1m ago",
    tags: ["haproxy", "loadbalancer"], authType: "key",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "3", name: "db-primary", user: "postgres", address: "10.0.2.10", port: 22,
    folder: "Production", online: true, cpu: 45, ram: 71, lastAccess: "5m ago",
    tags: ["postgres", "critical"], authType: "credential", credentialId: "c1",
    enableTerminal: true, enableTunnel: true, enableFileManager: false, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "4", name: "db-replica", user: "postgres", address: "10.0.2.11", port: 22,
    folder: "Production", online: false, cpu: 0, ram: 0, lastAccess: "31m ago",
    authType: "credential", credentialId: "c1",
    enableTerminal: true, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "11", name: "cache-01", user: "redis", address: "10.0.2.20", port: 22,
    folder: "Production", online: true, cpu: 6, ram: 22, lastAccess: "3m ago",
    tags: ["redis", "cache"], authType: "key",
    enableTerminal: true, enableTunnel: false, enableFileManager: false, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "12", name: "queue-01", user: "rabbit", address: "10.0.2.30", port: 22,
    folder: "Production", online: true, cpu: 11, ram: 38, lastAccess: "8m ago",
    tags: ["rabbitmq", "queue"], authType: "credential", credentialId: "c2",
    enableTerminal: true, enableTunnel: true, enableFileManager: false, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "5", name: "stage-web", user: "deploy", address: "10.1.1.10", port: 22,
    folder: "Staging", online: true, cpu: 3, ram: 18, lastAccess: "25m ago",
    tags: ["staging"], authType: "password",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "6", name: "stage-db", user: "postgres", address: "10.1.2.10", port: 22,
    folder: "Staging", online: false, cpu: 0, ram: 0, lastAccess: "45m ago",
    authType: "password",
    enableTerminal: true, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "13", name: "stage-cache", user: "redis", address: "10.1.2.20", port: 22,
    folder: "Staging", online: true, cpu: 2, ram: 9, lastAccess: "18m ago",
    tags: ["redis", "staging"], authType: "password",
    enableTerminal: true, enableTunnel: false, enableFileManager: false, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "7", name: "win-dc-01", user: "Administrator", address: "10.0.3.10", port: 3389,
    folder: "Windows", online: true, cpu: 22, ram: 48, lastAccess: "1h ago",
    tags: ["windows", "rdp", "domain-controller", "ssh"], authType: "password",
    enableTerminal: false, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: true, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
    rdpUser: "Administrator",
  },
  {
    id: "8", name: "dev-workstation", user: "dev", address: "10.0.4.20", port: 5900,
    folder: "Windows", online: false, cpu: 0, ram: 0, lastAccess: "3d ago",
    tags: ["vnc", "dev"], authType: "password",
    enableTerminal: false, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: false, enableRdp: false, enableVnc: true, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "14", name: "win-build-01", user: "Administrator", address: "10.0.3.20", port: 3389,
    folder: "Windows", online: true, cpu: 67, ram: 82, lastAccess: "15m ago",
    tags: ["windows", "rdp", "ci"], authType: "password",
    enableTerminal: false, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: false, enableRdp: true, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
    rdpUser: "Administrator",
  },
  {
    id: "15", name: "monitor-01", user: "ops", address: "10.0.5.10", port: 22,
    folder: "Monitoring", online: true, cpu: 9, ram: 44, lastAccess: "6m ago",
    tags: ["grafana", "prometheus"], authType: "key",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "16", name: "log-01", user: "ops", address: "10.0.5.11", port: 22,
    folder: "Monitoring", online: true, cpu: 31, ram: 60, lastAccess: "11m ago",
    tags: ["loki", "logging"], authType: "key",
    enableTerminal: true, enableTunnel: false, enableFileManager: true, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "17", name: "backup-01", user: "backup", address: "10.0.6.10", port: 22,
    folder: "Monitoring", online: false, cpu: 0, ram: 0, lastAccess: "2h ago",
    tags: ["backup", "cron"], authType: "credential", credentialId: "c3",
    enableTerminal: true, enableTunnel: false, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "18", name: "dev-api", user: "dev", address: "192.168.1.50", port: 22,
    folder: "Dev", online: true, cpu: 5, ram: 29, lastAccess: "33m ago",
    tags: ["dev", "api"], authType: "password",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: true, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "19", name: "dev-frontend", user: "dev", address: "192.168.1.51", port: 22,
    folder: "Dev", online: true, cpu: 14, ram: 52, lastAccess: "20m ago",
    tags: ["dev", "vite", "node"], authType: "password",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "20", name: "dev-db", user: "postgres", address: "192.168.1.52", port: 22,
    folder: "Dev", online: false, cpu: 0, ram: 0, lastAccess: "1d ago",
    tags: ["dev", "postgres"], authType: "password",
    enableTerminal: true, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
  },
  {
    id: "21", name: "legacy-router", user: "admin", address: "10.0.0.1", port: 23,
    folder: "Dev", online: true, cpu: 2, ram: 8, lastAccess: "4h ago",
    tags: ["telnet", "legacy", "router"], authType: "password",
    enableTerminal: false, enableTunnel: false, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: false, enableRdp: false, enableVnc: false, enableTelnet: true,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
    telnetUser: "admin",
  },
  // Multi-protocol demo hosts
  {
    id: "22", name: "hypervisor-01", user: "root", address: "10.0.7.10", port: 22,
    folder: "Infrastructure", online: true, cpu: 38, ram: 61, lastAccess: "3m ago",
    tags: ["proxmox", "hypervisor", "kvm"], authType: "key",
    enableTerminal: true, enableTunnel: true, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: true, enableVnc: true, enableTelnet: false,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
    rdpUser: "root",
  },
  {
    id: "23", name: "jumpbox-01", user: "ops", address: "10.0.7.20", port: 22,
    folder: "Infrastructure", online: true, cpu: 4, ram: 12, lastAccess: "9m ago",
    tags: ["bastion", "jump", "ssh", "telnet"], authType: "password",
    enableTerminal: true, enableTunnel: true, enableFileManager: false, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: false, enableVnc: false, enableTelnet: true,
    sshPort: 22, rdpPort: 3389, vncPort: 5900, telnetPort: 23,
    telnetUser: "ops",
  },
  {
    id: "24", name: "workstation-lab", user: "labuser", address: "10.0.7.30", port: 22,
    folder: "Infrastructure", online: false, cpu: 0, ram: 0, lastAccess: "2h ago",
    tags: ["lab", "windows", "linux"], authType: "password",
    enableTerminal: true, enableTunnel: false, enableFileManager: true, enableDocker: false, quickActions: [], serverTunnels: [],
    enableSsh: true, enableRdp: true, enableVnc: true, enableTelnet: true,
    sshPort: 22, rdpPort: 3389, vncPort: 5901, telnetPort: 23,
    rdpUser: "labuser",
    vncPassword: "",
    telnetUser: "labuser",
  },
];

export const MOCK_CREDENTIALS: Credential[] = [
  { id: "c1", name: "Prod Database Admin", username: "postgres", type: "password", description: "Main production DB credentials" },
  { id: "c2", name: "Deployment Key", username: "deploy", type: "key", description: "SSH key for automated deployments" },
  { id: "c3", name: "Backup Service", username: "backup_user", type: "password", description: "Used by nightly backup cron jobs" },
  { id: "c4", name: "Staging Root", username: "root", type: "key", description: "Root access for staging cluster" },
];

export const hostTree: HostFolder = {
  name: "root",
  children: [
    {
      name: "Production",
      children: [
        { name: "Web Servers", children: hosts.filter(h => h.folder === "Production / Web Servers") },
        ...hosts.filter(h => h.folder === "Production"),
      ],
    },
    { name: "Staging",        children: hosts.filter(h => h.folder === "Staging")        },
    { name: "Monitoring",     children: hosts.filter(h => h.folder === "Monitoring")     },
    { name: "Windows",        children: hosts.filter(h => h.folder === "Windows")        },
    { name: "Dev",            children: hosts.filter(h => h.folder === "Dev")            },
    { name: "Infrastructure", children: hosts.filter(h => h.folder === "Infrastructure") },
  ],
};

export const recentActivity = [...hosts]
  .sort((a, b) => a.lastAccess.localeCompare(b.lastAccess))
  .map(h => ({ host: h.name, action: "Terminal", time: h.lastAccess, online: h.online }));

export const hostStatuses = hosts;

export const DASHBOARD_TAB: Tab = { id: "dashboard", type: "dashboard", label: "Dashboard" };

export const DASHBOARD_CARDS: DashboardCardConfig[] = [
  { id: "stats_bar",       label: "Status Bar",      description: "Version, uptime, database health, hosts online",  defaultEnabled: true  },
  { id: "counters_bar",    label: "Counters Bar",     description: "Total hosts, credentials, and tunnels count",     defaultEnabled: true  },
  { id: "quick_actions",   label: "Quick Actions",    description: "Shortcuts to add hosts, credentials, settings",   defaultEnabled: true  },
  { id: "host_status",     label: "Host Status",      description: "Live status list with CPU/RAM per host",          defaultEnabled: true  },
  { id: "recent_activity", label: "Recent Activity",  description: "Feed of recent connection events",                defaultEnabled: true  },
  { id: "network_graph",   label: "Network Graph",    description: "Visual map of host network topology",             defaultEnabled: false },
];

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "default", label: "Default", description: "Balanced view with side panel",
    cards: [
      { id: "stats_bar",       colSpan: "full",   rowSize: "short",  order: 0 },
      { id: "counters_bar",    colSpan: "full",   rowSize: "short",  order: 1 },
      { id: "quick_actions",   colSpan: "wide",   rowSize: "medium", order: 2 },
      { id: "recent_activity", colSpan: "narrow", rowSize: "medium", order: 3 },
      { id: "host_status",     colSpan: "wide",   rowSize: "flex",   order: 4 },
      { id: "network_graph",   colSpan: "narrow", rowSize: "flex",   order: 5 },
    ],
  },
  {
    id: "compact", label: "Compact", description: "Dense layout, all cards side by side",
    cards: [
      { id: "stats_bar",       colSpan: "half",   rowSize: "short",  order: 0 },
      { id: "counters_bar",    colSpan: "half",   rowSize: "short",  order: 1 },
      { id: "quick_actions",   colSpan: "half",   rowSize: "medium", order: 2 },
      { id: "host_status",     colSpan: "half",   rowSize: "flex",   order: 3 },
      { id: "recent_activity", colSpan: "half",   rowSize: "flex",   order: 4 },
      { id: "network_graph",   colSpan: "half",   rowSize: "flex",   order: 5 },
    ],
  },
  {
    id: "focus", label: "Focus", description: "Host status front and center",
    cards: [
      { id: "stats_bar",       colSpan: "full",   rowSize: "short",  order: 0 },
      { id: "host_status",     colSpan: "wide",   rowSize: "flex",   order: 1 },
      { id: "recent_activity", colSpan: "narrow", rowSize: "flex",   order: 2 },
      { id: "counters_bar",    colSpan: "full",   rowSize: "short",  order: 3 },
      { id: "quick_actions",   colSpan: "full",   rowSize: "medium", order: 4 },
      { id: "network_graph",   colSpan: "full",   rowSize: "medium", order: 5 },
    ],
  },
  {
    id: "wide", label: "Wide", description: "Single column, full-width cards",
    cards: [
      { id: "stats_bar",       colSpan: "full",   rowSize: "short",  order: 0 },
      { id: "counters_bar",    colSpan: "full",   rowSize: "short",  order: 1 },
      { id: "quick_actions",   colSpan: "full",   rowSize: "medium", order: 2 },
      { id: "host_status",     colSpan: "full",   rowSize: "flex",   order: 3 },
      { id: "recent_activity", colSpan: "full",   rowSize: "medium", order: 4 },
      { id: "network_graph",   colSpan: "full",   rowSize: "medium", order: 5 },
    ],
  },
];

export const ACCENT_PRESET_COLORS = [
  { label: "Orange",  value: "#f59145" },
  { label: "Blue",    value: "#3b82f6" },
  { label: "Green",   value: "#22c55e" },
  { label: "Purple",  value: "#a855f7" },
  { label: "Pink",    value: "#ec4899" },
  { label: "Cyan",    value: "#06b6d4" },
  { label: "Red",     value: "#ef4444" },
  { label: "Yellow",  value: "#eab308" },
  { label: "Teal",    value: "#14b8a6" },
  { label: "Indigo",  value: "#6366f1" },
  { label: "Rose",    value: "#f43f5e" },
  { label: "Lime",    value: "#84cc16" },
];

// Legacy alias
export const ACCENT_COLORS = ACCENT_PRESET_COLORS.map(c => ({
  id: c.label.toLowerCase() as AccentColorId,
  label: c.label,
  value: c.value,
}));

export function applyAccentColor(colorValue: string) {
  document.documentElement.style.setProperty("--accent-brand", colorValue);
}

export const FONT_SIZES: { id: import("./types").FontSizeId; label: string }[] = [
  { id: "xs", label: "XS"     },
  { id: "sm", label: "Small"  },
  { id: "md", label: "Normal" },
  { id: "lg", label: "Large"  },
  { id: "xl", label: "XL"     },
];

export function applyFontSize(id: import("./types").FontSizeId) {
  const root = document.documentElement;
  root.classList.remove("fs-xs", "fs-sm", "fs-md", "fs-lg", "fs-xl");
  root.classList.add(`fs-${id}`);
  localStorage.setItem("termix-font-size", id);
}

export const SINGLETON_TAB_LABELS: Partial<Record<import("./types").TabType, string>> = {
  "host-manager": "Host Manager",
  "docker":       "Docker",
  "tunnel":       "Tunnels",
};

export const MOCK_USERS = [
  { id: "1", username: "admin",    isAdmin: true,  isOidc: false, passwordHash: "x" },
  { id: "2", username: "deploy",   isAdmin: false, isOidc: false, passwordHash: "x" },
  { id: "3", username: "oidcuser", isAdmin: false, isOidc: true,  passwordHash: null },
  { id: "4", username: "dualuser", isAdmin: false, isOidc: true,  passwordHash: "x" },
];

export const MOCK_SESSIONS = [
  { id: "s1", username: "admin",    deviceInfo: "Chrome 124 / Windows", createdAt: "2026-05-01 08:00", lastActiveAt: "2m ago",  expiresAt: "2026-05-08 08:00", isCurrentSession: true  },
  { id: "s2", username: "deploy",   deviceInfo: "Firefox 125 / Linux",  createdAt: "2026-04-30 14:22", lastActiveAt: "1h ago",  expiresAt: "2026-05-07 14:22", isCurrentSession: false },
  { id: "s3", username: "oidcuser", deviceInfo: "Safari / iOS",         createdAt: "2026-04-29 09:11", lastActiveAt: "2d ago",  expiresAt: "2026-05-06 09:11", isCurrentSession: false },
];

export const MOCK_ROLES = [
  { id: "r1", name: "administrator", displayName: "Administrator", description: "Full access to all resources",         isSystem: true  },
  { id: "r2", name: "operator",      displayName: "Operator",      description: "Can manage hosts and terminals",       isSystem: false },
  { id: "r3", name: "viewer",        displayName: "Viewer",        description: "Read-only access to stats",            isSystem: false },
];

export const MOCK_API_KEYS = [
  { id: "k1", name: "CI Pipeline", username: "deploy", tokenPrefix: "tmx_ci_abc1",  createdAt: "2026-04-01T00:00:00Z", expiresAt: null,                  lastUsedAt: "2026-05-01T10:00:00Z", isActive: true },
  { id: "k2", name: "Monitoring",  username: "admin",  tokenPrefix: "tmx_mon_xyz9", createdAt: "2026-03-15T00:00:00Z", expiresAt: "2026-06-15T00:00:00Z", lastUsedAt: "2026-05-01T09:55:00Z", isActive: true },
];

export const MOCK_CONTAINERS = [
  { id: "d1a2b3c4e5f6", name: "nginx-proxy",        image: "nginx:latest",           status: "running"  as const, cpu: 0.8, memory: "12.4 MB",  ports: ["80:80", "443:443"], created: "2 days ago"  },
  { id: "f6e5d4c3b2a1", name: "postgres-db",         image: "postgres:15-alpine",     status: "running"  as const, cpu: 2.5, memory: "256.2 MB", ports: ["5432:5432"],        created: "5 days ago"  },
  { id: "a1b2c3d4e5f6", name: "redis-cache",         image: "redis:7.0-alpine",       status: "paused"   as const, cpu: 0,   memory: "42.1 MB",  ports: ["6379:6379"],        created: "1 week ago"  },
  { id: "f1e2d3c4b5a6", name: "webapp-api",           image: "node:18-slim",           status: "running"  as const, cpu: 8.4, memory: "312.8 MB", ports: ["3000:3000"],        created: "3 hours ago" },
  { id: "b1c2d3e4f5a6", name: "worker-node-01",      image: "python:3.11-slim",       status: "exited"   as const, cpu: 0,   memory: "0 B",      ports: [],                   created: "1 day ago"   },
  { id: "c1d2e3f4a5b6", name: "monitoring-grafana",  image: "grafana/grafana:latest", status: "running"  as const, cpu: 1.2, memory: "128.5 MB", ports: ["3001:3000"],        created: "4 days ago"  },
  { id: "d1e2f3a4b5c6", name: "prometheus",           image: "prom/prometheus:latest", status: "running"  as const, cpu: 3.7, memory: "512.2 MB", ports: ["9090:9090"],        created: "4 days ago"  },
];

export const DEMO_GRAPH_ELEMENTS = [
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

export const FOLDER_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#a855f7", "#ec4899", "#6b7280",
];

export const INITIAL_FOLDERS: SnippetFolder[] = [
  { id: 1, name: "test",          color: "#f97316", icon: "server", open: true },
  { id: 2, name: "Uncategorized", color: "#6b7280", icon: "folder", open: true },
];

export const INITIAL_SNIPPETS: Snippet[] = [
  { id: 2, name: "test", command: "test", folderId: 1 },
  { id: 1, name: "test", description: "test", command: "test", folderId: 2 },
];

export const HISTORY_ENTRIES: HistoryEntry[] = [
  { id: 1,  command: "sudo systemctl restart nginx",          host: "web-01",    time: "2m ago"  },
  { id: 2,  command: "tail -f /var/log/nginx/error.log",      host: "web-01",    time: "4m ago"  },
  { id: 3,  command: "docker ps -a",                          host: "web-02",    time: "9m ago"  },
  { id: 4,  command: "df -h",                                 host: "db-primary",time: "12m ago" },
  { id: 5,  command: "pg_dump mydb > backup.sql",             host: "db-primary",time: "15m ago" },
  { id: 6,  command: "top",                                   host: "db-replica",time: "21m ago" },
  { id: 7,  command: "ls -la /var/www",                       host: "web-02",    time: "28m ago" },
  { id: 8,  command: "cat /etc/hosts",                        host: "stage-web", time: "34m ago" },
  { id: 9,  command: "sudo apt update && sudo apt upgrade -y",host: "stage-db",  time: "41m ago" },
  { id: 10, command: "systemctl status postgresql",           host: "db-primary",time: "55m ago" },
  { id: 11, command: "free -m",                               host: "web-01",    time: "1h ago"  },
  { id: 12, command: "netstat -tlnp",                         host: "stage-web", time: "1h ago"  },
];

export const TOOLS_TABS: { id: import("./types").ToolsTab; label: string }[] = [
  { id: "ssh-tools",    label: "SSH Tools"    },
  { id: "snippets",     label: "Snippets"     },
  { id: "history",      label: "History"      },
  { id: "split-screen", label: "Split Screen" },
];

export const SPLIT_MODES: { id: import("./types").SplitMode; label: string }[] = [
  { id: "none",    label: "None"    },
  { id: "2-way",   label: "2-Way"   },
  { id: "3-way",   label: "3-Way"   },
  { id: "4-way",   label: "4-Way"   },
  { id: "5-way",   label: "5-Way"   },
  { id: "6-way",   label: "6-Way"   },
];

export const PANE_COUNTS: Record<import("./types").SplitMode, number> = {
  "none": 0, "2-way": 2, "3-way": 3, "4-way": 4, "5-way": 5, "6-way": 6,
};

export const PANE_LAYOUTS: Record<import("./types").SplitMode, string> = {
  "none":    "",
  "2-way":   "grid-cols-2 grid-rows-1",
  "3-way":   "grid-cols-2 grid-rows-2",
  "4-way":   "grid-cols-2 grid-rows-2",
  "5-way":   "grid-cols-3 grid-rows-2",
  "6-way":   "grid-cols-3 grid-rows-2",
};

export const HOST_TABS = [
  { id: "general",  label: "General",         icon: "Settings"     },
  { id: "ssh",      label: "SSH",             icon: "Terminal"     },
  { id: "tunnels",  label: "Tunnels",         icon: "Network"      },
  { id: "docker",   label: "Docker",          icon: "Box"          },
  { id: "files",    label: "Files",           icon: "FolderSearch" },
  { id: "stats",    label: "Stats & Actions", icon: "Activity"     },
  { id: "rdp",      label: "RDP",             icon: "Monitor"      },
  { id: "vnc",      label: "VNC",             icon: "Monitor"      },
  { id: "telnet",   label: "Telnet",          icon: "Terminal"     },
  { id: "sharing",  label: "Sharing",         icon: "Share2"       },
];

export const CREDENTIAL_TABS = [
  { id: "general", label: "General",        icon: "Info" },
  { id: "auth",    label: "Authentication", icon: "Lock" },
];

export const ADMIN_SECTIONS: { id: import("./types").AdminSection; label: string; icon: string }[] = [
  { id: "general",  label: "General",  icon: "Settings"  },
  { id: "oidc",     label: "OIDC",     icon: "Shield"    },
  { id: "users",    label: "Users",    icon: "User"      },
  { id: "sessions", label: "Sessions", icon: "Activity"  },
  { id: "roles",    label: "Roles",    icon: "KeyRound"  },
  { id: "database", label: "Database", icon: "Database"  },
  { id: "api-keys", label: "API Keys", icon: "Network"   },
];
