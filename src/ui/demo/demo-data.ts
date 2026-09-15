import type { Host, Credential, Snippet } from "@/types/ui-types";
import type { FileItem } from "@/types";

// Addresses are RFC1918 and every "secret" is a placeholder.

// Defaults keep the host records readable, so each one lists only what makes
// it different.
const hostDefaults = {
  parentHostId: null as string | null,
  online: true,
  cpu: null as number | null,
  ram: null as number | null,
  tags: [] as string[],
  authType: "credential" as Host["authType"],
  pin: false,
  enableTerminal: true,
  enableCommandHistory: true,
  enableTunnel: false,
  serverTunnels: [] as Host["serverTunnels"],
  enableFileManager: true,
  enableDocker: false,
  enableProxmox: false,
  enableTmuxMonitor: false,
  enableTerminalToolbar: true,
  enableProxmoxStats: false,
  quickActions: [] as Host["quickActions"],
  enableSsh: true,
  enableRdp: false,
  enableVnc: false,
  enableTelnet: false,
  sshPort: 22,
  rdpPort: 3389,
  vncPort: 5900,
  telnetPort: 23,
};

function host(
  partial: Partial<Host> &
    Pick<Host, "id" | "name" | "username" | "ip" | "folder">,
): Host {
  return {
    ...hostDefaults,
    port: partial.sshPort ?? 22,
    status: partial.online === false ? "offline" : "online",
    lastAccess: partial.lastAccess ?? "2026-09-09T14:22:00Z",
    ...partial,
  } as Host;
}

export const DEMO_HOSTS: Host[] = [
  host({
    id: "h-web-01",
    name: "web-01",
    username: "deploy",
    ip: "10.0.12.21",
    folder: "Production",
    status: "online",
    cpu: 34,
    ram: 61,
    tags: ["nginx", "edge"],
    pin: true,
    // The showcase host: every SSH-backed feature is on, so one host in the
    // tree can open every kind of tab the demo has. The other protocols (RDP,
    // VNC, Telnet) stay off; other hosts cover those.
    enableTunnel: true,
    enableDocker: true,
    enableProxmox: true,
    enableProxmoxStats: true,
    enableTmuxMonitor: true,
    credentialId: "c-deploy",
    serverTunnels: [
      {
        mode: "local",
        sourcePort: 8080,
        endpointHost: "127.0.0.1",
        endpointPort: 80,
        maxRetries: 3,
        retryInterval: 5000,
        autoStart: true,
      },
    ],
    notes: "Primary public web node. Sits behind the load balancer.",
  }),
  host({
    id: "h-web-02",
    name: "web-02",
    username: "deploy",
    ip: "10.0.12.22",
    folder: "Production",
    status: "online",
    cpu: 28,
    ram: 54,
    tags: ["nginx", "edge"],
    enableDocker: true,
    credentialId: "c-deploy",
  }),
  host({
    id: "h-db-primary",
    name: "db-primary",
    username: "postgres",
    ip: "10.0.12.40",
    folder: "Production",
    status: "online",
    cpu: 72,
    ram: 83,
    tags: ["postgres", "stateful"],
    authType: "key",
    hasKey: true,
    keyType: "ed25519",
    enableFileManager: false,
    notes: "Do not restart during business hours.",
  }),
  // A sub-host nested under db-primary, to exercise the tree chevron.
  host({
    id: "h-db-replica",
    name: "db-replica",
    username: "postgres",
    ip: "10.0.12.41",
    folder: "Production",
    parentHostId: "h-db-primary",
    status: "reachable",
    cpu: 19,
    ram: 47,
    tags: ["postgres", "replica"],
    authType: "key",
    hasKey: true,
    keyType: "ed25519",
  }),
  host({
    id: "h-cache-01",
    name: "cache-01",
    username: "redis",
    ip: "10.0.12.55",
    folder: "Production",
    status: "online",
    cpu: 11,
    ram: 38,
    tags: ["redis"],
  }),
  host({
    id: "h-bastion",
    name: "bastion",
    username: "jump",
    ip: "10.0.12.2",
    folder: "Production",
    status: "online",
    cpu: 4,
    ram: 12,
    tags: ["ssh", "jump"],
    authType: "key",
    hasKey: true,
    keyType: "rsa",
    enableFileManager: false,
    pin: true,
  }),

  host({
    id: "h-proxmox",
    name: "proxmox",
    username: "root",
    ip: "192.168.1.10",
    folder: "Homelab",
    status: "online",
    cpu: 47,
    ram: 68,
    tags: ["hypervisor"],
    authType: "password",
    hasPassword: true,
    enableProxmox: true,
    enableProxmoxStats: true,
    enableDocker: true,
    enableTmuxMonitor: true,
  }),
  host({
    id: "h-nas",
    name: "nas",
    username: "admin",
    ip: "192.168.1.20",
    folder: "Homelab",
    status: "online",
    cpu: 8,
    ram: 44,
    tags: ["storage", "smb"],
    authType: "password",
    hasPassword: true,
    defaultPath: "/srv",
  }),
  host({
    id: "h-pihole",
    name: "pihole",
    username: "pi",
    ip: "192.168.1.31",
    folder: "Homelab",
    status: "online",
    cpu: 6,
    ram: 22,
    tags: ["dns"],
    enableTunnel: true,
    serverTunnels: [
      {
        mode: "local",
        sourcePort: 8053,
        endpointHost: "127.0.0.1",
        endpointPort: 80,
        maxRetries: 3,
        retryInterval: 5000,
        autoStart: false,
      },
    ],
  }),
  host({
    id: "h-media",
    name: "media-server",
    username: "media",
    ip: "192.168.1.40",
    folder: "Homelab",
    status: "offline",
    online: false,
    cpu: null,
    ram: null,
    tags: ["plex", "docker"],
    enableDocker: true,
    lastAccess: "2026-08-28T19:03:00Z",
  }),
  host({
    id: "h-win-desk",
    name: "workshop-pc",
    username: "luke",
    ip: "192.168.1.55",
    folder: "Homelab",
    status: "unknown",
    cpu: null,
    ram: null,
    tags: ["windows", "rdp"],
    authType: "password",
    hasPassword: true,
    enableSsh: false,
    enableRdp: true,
    enableTerminal: false,
    enableFileManager: false,
    rdpAuthType: "credential",
    rdpUser: "luke",
    lastAccess: "2026-09-01T09:41:00Z",
  }),

  host({
    id: "h-edge-ams",
    name: "edge-ams",
    username: "root",
    ip: "172.16.4.11",
    folder: "Edge",
    status: "online",
    cpu: 16,
    ram: 29,
    tags: ["vps", "eu"],
    authType: "agent",
  }),
  host({
    id: "h-edge-sfo",
    name: "edge-sfo",
    username: "root",
    ip: "172.16.4.12",
    folder: "Edge",
    status: "reachable",
    cpu: 23,
    ram: 35,
    tags: ["vps", "us"],
    authType: "agent",
  }),

  host({
    id: "h-switch",
    name: "core-switch",
    username: "admin",
    ip: "192.168.1.1",
    folder: "",
    status: "online",
    cpu: null,
    ram: null,
    tags: ["network"],
    authType: "password",
    hasPassword: true,
    enableSsh: false,
    enableTelnet: true,
    enableFileManager: false,
    telnetAuthType: "direct",
    telnetUser: "admin",
  }),
  host({
    id: "h-scratch",
    name: "scratch-vm",
    username: "ubuntu",
    ip: "10.0.99.7",
    folder: "",
    status: "online",
    cpu: 2,
    ram: 14,
    tags: [],
    authType: "none",
  }),
];

export const DEMO_FOLDERS = ["Production", "Homelab", "Edge"];

export const DEMO_CREDENTIALS: Credential[] = [
  {
    id: "c-deploy",
    name: "deploy key",
    username: "deploy",
    type: "key",
    description: "Shared deploy identity for production web nodes",
    folder: "Production",
    tags: ["prod"],
    pin: true,
    publicKey:
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...placeholder deploy@termix",
  },
  {
    id: "c-postgres",
    name: "postgres admin",
    username: "postgres",
    type: "key",
    description: "Database maintenance account",
    folder: "Production",
    tags: ["prod", "db"],
  },
  {
    id: "c-homelab",
    name: "homelab root",
    username: "root",
    type: "password",
    description: "Local-only hypervisor and NAS access",
    folder: "Homelab",
    tags: ["lab"],
  },
  {
    id: "c-pi",
    name: "raspberry pi",
    username: "pi",
    type: "key",
    folder: "Homelab",
    tags: ["lab"],
  },
  {
    id: "c-edge",
    name: "edge agent",
    username: "root",
    type: "key",
    description: "Forwarded over ssh-agent, no stored material",
    tags: ["vps"],
  },
];

export const DEMO_SNIPPETS: Snippet[] = [
  {
    id: 1,
    name: "Disk usage",
    description: "Human readable free space",
    content: "df -h",
    folder: null,
    order: 0,
  },
  {
    id: 2,
    name: "Top memory consumers",
    content: "ps aux --sort=-%mem | head -n 12",
    folder: null,
    order: 1,
  },
  {
    id: 3,
    name: "Tail syslog",
    content: "sudo tail -f /var/log/syslog",
    folder: "Debugging",
    order: 2,
  },
  {
    id: 4,
    name: "Restart nginx",
    description: "Check config then restart",
    content: "sudo nginx -t && sudo systemctl restart nginx",
    folder: "Debugging",
    order: 3,
  },
  {
    id: 5,
    name: "Docker cleanup",
    content: "docker system prune -af --volumes",
    folder: "Docker",
    order: 4,
  },
];

export interface DemoHistoryEntry {
  id: number;
  command: string;
  hostName: string;
  at: string;
}

export const DEMO_HISTORY: DemoHistoryEntry[] = [
  {
    id: 1,
    command: "systemctl status nginx",
    hostName: "web-01",
    at: "2026-09-09T14:20:00Z",
  },
  {
    id: 2,
    command: "df -h",
    hostName: "db-primary",
    at: "2026-09-09T13:58:00Z",
  },
  {
    id: 3,
    command: "docker compose up -d",
    hostName: "media-server",
    at: "2026-09-08T21:12:00Z",
  },
  {
    id: 4,
    command: "journalctl -u postgresql -n 200",
    hostName: "db-primary",
    at: "2026-09-08T16:40:00Z",
  },
  {
    id: 5,
    command: "apt update && apt upgrade",
    hostName: "edge-ams",
    at: "2026-09-08T11:05:00Z",
  },
  {
    id: 6,
    command: "pihole -up",
    hostName: "pihole",
    at: "2026-09-07T19:31:00Z",
  },
];

export interface DemoSessionLog {
  id: number;
  hostName: string;
  username: string;
  startedAt: string;
  durationMinutes: number;
  bytes: number;
}

export const DEMO_SESSION_LOGS: DemoSessionLog[] = [
  {
    id: 1,
    hostName: "web-01",
    username: "deploy",
    startedAt: "2026-09-09T14:02:00Z",
    durationMinutes: 23,
    bytes: 48120,
  },
  {
    id: 2,
    hostName: "db-primary",
    username: "postgres",
    startedAt: "2026-09-09T11:30:00Z",
    durationMinutes: 51,
    bytes: 129430,
  },
  {
    id: 3,
    hostName: "bastion",
    username: "jump",
    startedAt: "2026-09-08T17:14:00Z",
    durationMinutes: 4,
    bytes: 2310,
  },
  {
    id: 4,
    hostName: "edge-ams",
    username: "root",
    startedAt: "2026-09-08T09:55:00Z",
    durationMinutes: 12,
    bytes: 18740,
  },
];

export interface DemoAlert {
  id: number;
  severity: "critical" | "warning" | "info";
  title: string;
  hostName: string;
  at: string;
  acknowledged: boolean;
}

export const DEMO_ALERTS: DemoAlert[] = [
  {
    id: 1,
    severity: "critical",
    title: "Memory above 80% for 10m",
    hostName: "db-primary",
    at: "2026-09-09T13:44:00Z",
    acknowledged: false,
  },
  {
    id: 2,
    severity: "warning",
    title: "Disk 74% full on /",
    hostName: "web-02",
    at: "2026-09-09T08:17:00Z",
    acknowledged: false,
  },
  {
    id: 3,
    severity: "info",
    title: "Host came back online",
    hostName: "edge-sfo",
    at: "2026-09-08T22:02:00Z",
    acknowledged: true,
  },
];

export interface DemoTunnelRow {
  id: string;
  hostName: string;
  mode: "local" | "remote" | "dynamic";
  sourcePort: number;
  endpointHost: string;
  endpointPort: number;
  status: "running" | "stopped";
  autoStart: boolean;
}

export const DEMO_TUNNELS: DemoTunnelRow[] = [
  {
    id: "t-1",
    hostName: "web-01",
    mode: "local",
    sourcePort: 8080,
    endpointHost: "127.0.0.1",
    endpointPort: 80,
    status: "running",
    autoStart: true,
  },
  {
    id: "t-2",
    hostName: "pihole",
    mode: "local",
    sourcePort: 8053,
    endpointHost: "127.0.0.1",
    endpointPort: 80,
    status: "stopped",
    autoStart: false,
  },
  {
    id: "t-3",
    hostName: "db-primary",
    mode: "local",
    sourcePort: 5433,
    endpointHost: "127.0.0.1",
    endpointPort: 5432,
    status: "running",
    autoStart: true,
  },
  {
    id: "t-4",
    hostName: "edge-ams",
    mode: "dynamic",
    sourcePort: 1080,
    endpointHost: "-",
    endpointPort: 0,
    status: "stopped",
    autoStart: false,
  },
];


function dir(name: string, path: string): FileItem {
  return {
    name,
    path,
    type: "directory",
    size: 4096,
    modified: "2026-09-08T12:00:00Z",
    modifiedTimestamp: Date.parse("2026-09-08T12:00:00Z"),
    permissions: "drwxr-xr-x",
    owner: "root",
    group: "root",
  };
}

function file(
  name: string,
  path: string,
  size: number,
  permissions: string,
): FileItem {
  return {
    name,
    path,
    type: "file",
    size,
    modified: "2026-09-09T10:15:00Z",
    modifiedTimestamp: Date.parse("2026-09-09T10:15:00Z"),
    permissions,
    owner: "deploy",
    group: "deploy",
    executable: permissions.includes("x"),
  };
}

function link(name: string, path: string, target: string): FileItem {
  return {
    name,
    path,
    type: "link",
    size: 0,
    modified: "2026-09-09T10:15:00Z",
    modifiedTimestamp: Date.parse("2026-09-09T10:15:00Z"),
    permissions: "lrwxrwxrwx",
    owner: "deploy",
    group: "deploy",
    linkTarget: target,
  };
}

export interface DemoActivityItem {
  id: number;
  type:
    | "terminal"
    | "file_manager"
    | "server_stats"
    | "tunnel"
    | "docker"
    | "telnet"
    | "vnc"
    | "rdp";
  hostId: string;
  hostName: string;
  timestamp: string;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const DEMO_ACTIVITY: DemoActivityItem[] = [
  {
    id: 1,
    type: "terminal",
    hostId: "h-web-01",
    hostName: "web-01",
    timestamp: minutesAgo(4),
  },
  {
    id: 2,
    type: "file_manager",
    hostId: "h-db-primary",
    hostName: "db-primary",
    timestamp: minutesAgo(23),
  },
  {
    id: 3,
    type: "server_stats",
    hostId: "h-web-02",
    hostName: "web-02",
    timestamp: minutesAgo(58),
  },
  {
    id: 4,
    type: "tunnel",
    hostId: "h-bastion",
    hostName: "bastion",
    timestamp: minutesAgo(146),
  },
  {
    id: 5,
    type: "docker",
    hostId: "h-docker-host",
    hostName: "docker-host",
    timestamp: minutesAgo(320),
  },
  {
    id: 6,
    type: "terminal",
    hostId: "h-nas",
    hostName: "nas",
    timestamp: minutesAgo(1490),
  },
];

export interface DemoContainer {
  id: string;
  name: string;
  image: string;
  state: "running" | "exited" | "paused";
  status: string;
  ports: string;
  cpu: number;
  memory: string;
}

export const DEMO_CONTAINERS: DemoContainer[] = [
  {
    id: "3f2a91c4b7e1",
    name: "termix-app",
    image: "ghcr.io/termix-ssh/termix:2.7.1",
    state: "running",
    status: "Up 6 days",
    ports: "8080:8080",
    cpu: 2.4,
    memory: "184 MB / 2 GB",
  },
  {
    id: "8b1d40fa2c93",
    name: "postgres",
    image: "postgres:16-alpine",
    state: "running",
    status: "Up 6 days",
    ports: "5432:5432",
    cpu: 1.1,
    memory: "312 MB / 2 GB",
  },
  {
    id: "c72e5ab8091d",
    name: "redis",
    image: "redis:7-alpine",
    state: "running",
    status: "Up 6 days",
    ports: "6379:6379",
    cpu: 0.3,
    memory: "48 MB / 512 MB",
  },
  {
    id: "d90f13c6ba47",
    name: "caddy",
    image: "caddy:2-alpine",
    state: "running",
    status: "Up 3 days",
    ports: "80:80, 443:443",
    cpu: 0.6,
    memory: "62 MB / 512 MB",
  },
  {
    id: "5a4c8e2f1db6",
    name: "backup-runner",
    image: "restic/restic:latest",
    state: "exited",
    status: "Exited (0) 9 hours ago",
    ports: "",
    cpu: 0,
    memory: "0 B / 512 MB",
  },
];

export interface DemoProxmoxGuest {
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped";
  cpu: number;
  memPercent: number;
  uptime: string;
  node: string;
}

export const DEMO_PROXMOX_GUESTS: DemoProxmoxGuest[] = [
  {
    vmid: 100,
    name: "docker-host",
    type: "qemu",
    status: "running",
    cpu: 12,
    memPercent: 64,
    uptime: "41d 6h",
    node: "pve-01",
  },
  {
    vmid: 101,
    name: "nas",
    type: "qemu",
    status: "running",
    cpu: 4,
    memPercent: 38,
    uptime: "41d 6h",
    node: "pve-01",
  },
  {
    vmid: 110,
    name: "pihole",
    type: "lxc",
    status: "running",
    cpu: 1,
    memPercent: 22,
    uptime: "12d 3h",
    node: "pve-01",
  },
  {
    vmid: 111,
    name: "wireguard",
    type: "lxc",
    status: "running",
    cpu: 1,
    memPercent: 14,
    uptime: "12d 3h",
    node: "pve-02",
  },
  {
    vmid: 120,
    name: "media",
    type: "lxc",
    status: "stopped",
    cpu: 0,
    memPercent: 0,
    uptime: "-",
    node: "pve-02",
  },
];

export interface DemoTmuxPane {
  id: string;
  command: string;
  active: boolean;
}

export interface DemoTmuxWindow {
  id: string;
  name: string;
  panes: DemoTmuxPane[];
}

export interface DemoTmuxSession {
  id: string;
  name: string;
  attached: boolean;
  created: string;
  windows: DemoTmuxWindow[];
}

export const DEMO_TMUX_SESSIONS: DemoTmuxSession[] = [
  {
    id: "deploy",
    name: "deploy",
    attached: true,
    created: "2026-09-09T08:12:00Z",
    windows: [
      {
        id: "deploy:0",
        name: "shell",
        panes: [
          { id: "deploy:0.0", command: "bash", active: true },
          { id: "deploy:0.1", command: "tail -f app.log", active: false },
        ],
      },
      {
        id: "deploy:1",
        name: "build",
        panes: [{ id: "deploy:1.0", command: "npm run build", active: false }],
      },
    ],
  },
  {
    id: "monitor",
    name: "monitor",
    attached: false,
    created: "2026-09-07T19:40:00Z",
    windows: [
      {
        id: "monitor:0",
        name: "htop",
        panes: [{ id: "monitor:0.0", command: "htop", active: true }],
      },
    ],
  },
];

export interface DemoQuickAccessItem {
  id: number;
  name: string;
  path: string;
  lastOpened?: string;
}

export const DEMO_RECENT_FILES: DemoQuickAccessItem[] = [
  {
    id: 1,
    name: "app.conf",
    path: "/etc/nginx/sites-available/app.conf",
    lastOpened: "2026-09-09T14:02:00Z",
  },
  {
    id: 2,
    name: "notes.md",
    path: "/home/deploy/notes.md",
    lastOpened: "2026-09-09T11:40:00Z",
  },
  {
    id: 3,
    name: "app.service",
    path: "/etc/systemd/system/app.service",
    lastOpened: "2026-09-08T17:25:00Z",
  },
];

export const DEMO_PINNED_FILES: DemoQuickAccessItem[] = [
  { id: 1, name: "nginx.conf", path: "/etc/nginx/nginx.conf" },
  { id: 2, name: "config.yml", path: "/opt/termix/config.yml" },
  { id: 3, name: "hosts", path: "/etc/hosts" },
];

export const DEMO_SHORTCUTS: DemoQuickAccessItem[] = [
  { id: 1, name: "releases", path: "/home/deploy/releases" },
  { id: 2, name: "log", path: "/var/log" },
  { id: 3, name: "html", path: "/var/www/html" },
];

export interface DemoFilesystem {
  mount: string;
  percent: number;
  usedHuman: string;
  totalHuman: string;
}

export const DEMO_STORAGE: {
  mount: string;
  percent: number;
  usedHuman: string;
  totalHuman: string;
  filesystems: DemoFilesystem[];
} = {
  mount: "/",
  percent: 61,
  usedHuman: "23.6 GB",
  totalHuman: "38.6 GB",
  filesystems: [
    {
      mount: "/",
      percent: 61,
      usedHuman: "23.6 GB",
      totalHuman: "38.6 GB",
    },
    {
      mount: "/var",
      percent: 78,
      usedHuman: "15.2 GB",
      totalHuman: "19.5 GB",
    },
    {
      mount: "/boot",
      percent: 24,
      usedHuman: "230 MB",
      totalHuman: "976 MB",
    },
  ],
};

/** Absolute path to directory listing. */
export const DEMO_FS: Record<string, FileItem[]> = {
  "/": [
    dir("bin", "/bin"),
    dir("etc", "/etc"),
    dir("home", "/home"),
    dir("opt", "/opt"),
    dir("srv", "/srv"),
    dir("var", "/var"),
  ],
  "/home": [dir("deploy", "/home/deploy")],
  "/home/deploy": [
    dir(".ssh", "/home/deploy/.ssh"),
    dir("releases", "/home/deploy/releases"),
    file("deploy.sh", "/home/deploy/deploy.sh", 1840, "-rwxr-xr-x"),
    file("notes.md", "/home/deploy/notes.md", 620, "-rw-r--r--"),
    file(".bashrc", "/home/deploy/.bashrc", 3771, "-rw-r--r--"),
  ],
  "/home/deploy/.ssh": [
    file(
      "authorized_keys",
      "/home/deploy/.ssh/authorized_keys",
      742,
      "-rw-------",
    ),
    file("known_hosts", "/home/deploy/.ssh/known_hosts", 2210, "-rw-r--r--"),
  ],
  "/home/deploy/releases": [
    dir("2026-09-09", "/home/deploy/releases/2026-09-09"),
    dir("2026-09-02", "/home/deploy/releases/2026-09-02"),
    link(
      "current",
      "/home/deploy/releases/current",
      "/home/deploy/releases/2026-09-09",
    ),
  ],
  "/home/deploy/releases/2026-09-09": [
    file(
      "app.tar.gz",
      "/home/deploy/releases/2026-09-09/app.tar.gz",
      18904233,
      "-rw-r--r--",
    ),
    file(
      "manifest.json",
      "/home/deploy/releases/2026-09-09/manifest.json",
      412,
      "-rw-r--r--",
    ),
  ],
  "/home/deploy/releases/2026-09-02": [
    file(
      "app.tar.gz",
      "/home/deploy/releases/2026-09-02/app.tar.gz",
      18220119,
      "-rw-r--r--",
    ),
  ],
  "/etc": [
    dir("nginx", "/etc/nginx"),
    dir("systemd", "/etc/systemd"),
    file("hosts", "/etc/hosts", 221, "-rw-r--r--"),
    file("fstab", "/etc/fstab", 680, "-rw-r--r--"),
    file("os-release", "/etc/os-release", 382, "-rw-r--r--"),
  ],
  "/etc/nginx": [
    dir("sites-available", "/etc/nginx/sites-available"),
    file("nginx.conf", "/etc/nginx/nginx.conf", 1482, "-rw-r--r--"),
    file("mime.types", "/etc/nginx/mime.types", 5349, "-rw-r--r--"),
  ],
  "/etc/nginx/sites-available": [
    file("default", "/etc/nginx/sites-available/default", 2410, "-rw-r--r--"),
    file("app.conf", "/etc/nginx/sites-available/app.conf", 980, "-rw-r--r--"),
  ],
  "/etc/systemd": [dir("system", "/etc/systemd/system")],
  "/etc/systemd/system": [
    file("app.service", "/etc/systemd/system/app.service", 512, "-rw-r--r--"),
  ],
  "/var": [dir("log", "/var/log"), dir("www", "/var/www")],
  "/var/log": [
    file("syslog", "/var/log/syslog", 4210338, "-rw-r-----"),
    file("auth.log", "/var/log/auth.log", 882104, "-rw-r-----"),
    file(
      "nginx-access.log",
      "/var/log/nginx-access.log",
      19338201,
      "-rw-r--r--",
    ),
  ],
  "/var/www": [dir("html", "/var/www/html")],
  "/var/www/html": [
    file("index.html", "/var/www/html/index.html", 1024, "-rw-r--r--"),
    file("favicon.ico", "/var/www/html/favicon.ico", 15086, "-rw-r--r--"),
  ],
  "/bin": [
    file("bash", "/bin/bash", 1234376, "-rwxr-xr-x"),
    file("ls", "/bin/ls", 142144, "-rwxr-xr-x"),
    file("systemctl", "/bin/systemctl", 892312, "-rwxr-xr-x"),
  ],
  "/opt": [dir("termix", "/opt/termix")],
  "/opt/termix": [
    file("config.yml", "/opt/termix/config.yml", 744, "-rw-r--r--"),
    file("termix.log", "/opt/termix/termix.log", 220934, "-rw-r--r--"),
  ],
  "/srv": [],
};

/** Text shown when the file manager previews a file. */
export const DEMO_FILE_CONTENTS: Record<string, string> = {
  "/etc/hosts": [
    "127.0.0.1\tlocalhost",
    "127.0.1.1\tweb-01",
    "10.0.12.40\tdb-primary",
    "10.0.12.2\tbastion",
    "",
  ].join("\n"),
  "/home/deploy/notes.md": [
    "# Deploy notes",
    "",
    '- Releases live in ~/releases, symlinked as "current".',
    "- Always run the smoke test before flipping the symlink.",
    "- db-primary must not restart during business hours.",
    "",
  ].join("\n"),
  "/opt/termix/config.yml": [
    "server:",
    "  port: 8080",
    "  host: 0.0.0.0",
    "",
    "database:",
    "  dialect: sqlite",
    "  path: /opt/termix/data/termix.db",
    "",
  ].join("\n"),
};

// ── Docker ──────────────────────────────────────────────────

export interface DemoContainerStats {
  cpuPercent: number;
  memoryUsed: string;
  memoryLimit: string;
  memoryPercent: number;
  netInput: string;
  netOutput: string;
  blockRead: string;
  blockWrite: string;
  pids: number;
}

/** Keyed by container id. Only running containers have stats. */
export const DEMO_CONTAINER_STATS: Record<string, DemoContainerStats> = {
  "3f2a91c4b7e1": {
    cpuPercent: 2.4,
    memoryUsed: "184 MB",
    memoryLimit: "2 GB",
    memoryPercent: 9,
    netInput: "1.2 MB",
    netOutput: "4.8 MB",
    blockRead: "12 MB",
    blockWrite: "88 MB",
    pids: 24,
  },
  "8b1d40fa2c93": {
    cpuPercent: 1.1,
    memoryUsed: "312 MB",
    memoryLimit: "2 GB",
    memoryPercent: 15,
    netInput: "840 KB",
    netOutput: "2.1 MB",
    blockRead: "48 MB",
    blockWrite: "412 MB",
    pids: 18,
  },
  c72e5ab8091d: {
    cpuPercent: 0.3,
    memoryUsed: "48 MB",
    memoryLimit: "512 MB",
    memoryPercent: 9,
    netInput: "220 KB",
    netOutput: "180 KB",
    blockRead: "4 MB",
    blockWrite: "16 MB",
    pids: 6,
  },
  d90f13c6ba47: {
    cpuPercent: 0.6,
    memoryUsed: "62 MB",
    memoryLimit: "512 MB",
    memoryPercent: 12,
    netInput: "6.4 MB",
    netOutput: "22 MB",
    blockRead: "2 MB",
    blockWrite: "9 MB",
    pids: 11,
  },
};

/** Keyed by container id. Lines carry a timestamp and a level prefix. */
export const DEMO_CONTAINER_LOGS: Record<string, string[]> = {
  "3f2a91c4b7e1": [
    "2026-09-09T14:02:11.204Z INFO  starting termix 2.7.1",
    "2026-09-09T14:02:11.881Z INFO  database ready (sqlite)",
    "2026-09-09T14:02:12.010Z INFO  listening on 0.0.0.0:8080",
    "2026-09-09T14:02:19.442Z INFO  GET /api/hosts 200 12ms",
    "2026-09-09T14:03:02.118Z WARN  slow query took 412ms",
    "2026-09-09T14:03:44.900Z INFO  GET /api/health 200 2ms",
    "2026-09-09T14:04:10.332Z INFO  POST /api/tunnel 201 88ms",
    "2026-09-09T14:06:51.774Z DEBUG session cache hit rate 0.94",
  ],
  "8b1d40fa2c93": [
    "2026-09-09T14:01:02.004Z INFO  database system is ready to accept connections",
    "2026-09-09T14:01:02.110Z INFO  autovacuum launcher started",
    "2026-09-09T14:22:41.556Z INFO  checkpoint starting: time",
    "2026-09-09T14:22:49.881Z INFO  checkpoint complete: wrote 214 buffers",
    "2026-09-09T14:40:03.221Z WARN  connection limit at 80% of max_connections",
  ],
  c72e5ab8091d: [
    "2026-09-09T14:00:59.001Z INFO  Ready to accept connections tcp",
    "2026-09-09T14:30:00.442Z INFO  Background saving started by pid 41",
    "2026-09-09T14:30:00.905Z INFO  Background saving terminated with success",
  ],
  d90f13c6ba47: [
    "2026-09-09T13:58:12.114Z INFO  serving initial configuration",
    "2026-09-09T13:58:12.556Z INFO  certificate obtained successfully",
    "2026-09-09T14:12:40.008Z ERROR upstream 10.0.12.22:80 dial tcp timeout",
    "2026-09-09T14:12:45.119Z INFO  upstream 10.0.12.22:80 recovered",
  ],
  "5a4c8e2f1db6": [
    "2026-09-09T05:00:01.000Z INFO  starting backup run",
    "2026-09-09T05:12:44.318Z INFO  snapshot a91f2c stored, 2.4 GB",
    "2026-09-09T05:12:44.402Z INFO  backup finished in 12m43s",
  ],
};

export const DEMO_DOCKER_INFO = { runtime: "Docker", version: "24.0.7" };

// ── Proxmox ─────────────────────────────────────────────────

export interface DemoProxmoxNode {
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryDetail: string;
  diskPercent: number;
  diskDetail: string;
  uptime: string;
  hostname: string;
  pveVersion: string;
  cpuHistory: number[];
  memoryHistory: number[];
}

export const DEMO_PROXMOX_NODES: DemoProxmoxNode[] = [
  {
    name: "pve-01",
    cpuPercent: 18,
    memoryPercent: 62,
    memoryDetail: "39.7 / 64.0 GiB",
    diskPercent: 44,
    diskDetail: "412 / 936 GiB",
    uptime: "41d 6h",
    hostname: "pve-01",
    pveVersion: "8.2.4",
    cpuHistory: [14, 16, 21, 19, 17, 22, 18, 15, 18, 20, 17, 18],
    memoryHistory: [60, 61, 61, 63, 62, 62, 64, 63, 62, 61, 62, 62],
  },
  {
    name: "pve-02",
    cpuPercent: 7,
    memoryPercent: 34,
    memoryDetail: "10.9 / 32.0 GiB",
    diskPercent: 21,
    diskDetail: "98 / 468 GiB",
    uptime: "41d 6h",
    hostname: "pve-02",
    pveVersion: "8.2.4",
    cpuHistory: [6, 8, 7, 9, 6, 5, 7, 8, 7, 6, 7, 7],
    memoryHistory: [33, 34, 34, 35, 34, 33, 34, 35, 34, 34, 33, 34],
  },
];

export interface DemoProxmoxInterface {
  name: string;
  state: "UP" | "DOWN";
  address: string;
}

export const DEMO_PROXMOX_INTERFACES: DemoProxmoxInterface[] = [
  { name: "vmbr0", state: "UP", address: "192.168.1.10/24" },
  { name: "vmbr1", state: "UP", address: "10.10.0.1/24" },
  { name: "eno1", state: "UP", address: "-" },
  { name: "eno2", state: "DOWN", address: "-" },
];

export interface DemoProxmoxStoragePool {
  name: string;
  type: string;
  percent: number;
  usedGiB: number;
  totalGiB: number;
  active: boolean;
}

export const DEMO_PROXMOX_STORAGE: DemoProxmoxStoragePool[] = [
  {
    name: "local",
    type: "dir",
    percent: 38,
    usedGiB: 36,
    totalGiB: 94,
    active: true,
  },
  {
    name: "local-lvm",
    type: "lvmthin",
    percent: 61,
    usedGiB: 512,
    totalGiB: 840,
    active: true,
  },
  {
    name: "nas-backup",
    type: "nfs",
    percent: 74,
    usedGiB: 2960,
    totalGiB: 4000,
    active: true,
  },
  {
    name: "iso-store",
    type: "cifs",
    percent: 12,
    usedGiB: 24,
    totalGiB: 200,
    active: false,
  },
];

export interface DemoProxmoxCluster {
  clustered: boolean;
  name: string;
  quorate: boolean;
  members: { name: string; online: boolean }[];
}

export const DEMO_PROXMOX_CLUSTER: DemoProxmoxCluster = {
  clustered: true,
  name: "homelab",
  quorate: true,
  members: [
    { name: "pve-01", online: true },
    { name: "pve-02", online: true },
    { name: "pve-03", online: false },
  ],
};

// ── Host metrics ────────────────────────────────────────────

export interface DemoMetricInterface {
  name: string;
  state: "UP" | "DOWN";
  ip: string;
  rxRate: string;
  txRate: string;
}

export interface DemoMetricProcess {
  pid: number;
  command: string;
  cpu: number;
  mem: number;
}

export interface DemoMetricPort {
  port: number;
  protocol: string;
  process: string;
  address: string;
}

export interface DemoMetricLogin {
  user: string;
  ip: string;
  time: string;
  success: boolean;
}

export interface DemoMetricSensor {
  label: string;
  celsius: number;
}

export interface DemoHostMetrics {
  cpu: { percent: number; cores: number; load: [number, number, number] };
  memory: { percent: number; usedGiB: number; totalGiB: number };
  disk: {
    percent: number;
    usedHuman: string;
    totalHuman: string;
    availableHuman: string;
  };
  interfaces: DemoMetricInterface[];
  uptime: { formatted: string; seconds: number };
  system: {
    hostname: string;
    os: string;
    kernel: string;
    arch: string;
  };
  processes: { total: number; running: number; top: DemoMetricProcess[] };
  ports: DemoMetricPort[];
  logins: DemoMetricLogin[];
  firewall: { status: string; type: string; chains: number; rules: number };
  temperature: { highestCelsius: number; sensors: DemoMetricSensor[] };
}

/**
 * Per-host base readings. The live view drifts these on a timer, so they only
 * need to be plausible starting points.
 */
export const DEMO_HOST_METRICS: Record<string, DemoHostMetrics> = {
  "h-web-01": {
    cpu: { percent: 34, cores: 4, load: [0.42, 0.38, 0.31] },
    memory: { percent: 61, usedGiB: 2.4, totalGiB: 3.9 },
    disk: {
      percent: 61,
      usedHuman: "23.6G",
      totalHuman: "38.6G",
      availableHuman: "15.0G",
    },
    interfaces: [
      {
        name: "eth0",
        state: "UP",
        ip: "10.0.12.21",
        rxRate: "1.2 MB/s",
        txRate: "640 KB/s",
      },
      {
        name: "lo",
        state: "UP",
        ip: "127.0.0.1",
        rxRate: "0 B/s",
        txRate: "0 B/s",
      },
      {
        name: "docker0",
        state: "DOWN",
        ip: "172.17.0.1",
        rxRate: "0 B/s",
        txRate: "0 B/s",
      },
    ],
    uptime: { formatted: "9 days, 3:14", seconds: 789240 },
    system: {
      hostname: "web-01",
      os: "Ubuntu 24.04.1 LTS",
      kernel: "6.8.0-41-generic",
      arch: "x86_64",
    },
    processes: {
      total: 142,
      running: 1,
      top: [
        { pid: 1120, command: "dockerd", cpu: 4.3, mem: 2.5 },
        { pid: 842, command: "nginx", cpu: 2.0, mem: 1.1 },
        { pid: 611, command: "node", cpu: 1.7, mem: 3.2 },
        { pid: 455, command: "systemd-journald", cpu: 0.4, mem: 0.6 },
        { pid: 322, command: "sshd", cpu: 0.1, mem: 0.3 },
      ],
    },
    ports: [
      { port: 22, protocol: "tcp", process: "sshd", address: "0.0.0.0" },
      { port: 80, protocol: "tcp", process: "nginx", address: "0.0.0.0" },
      { port: 443, protocol: "tcp", process: "nginx", address: "0.0.0.0" },
      { port: 8080, protocol: "tcp", process: "node", address: "127.0.0.1" },
    ],
    logins: [
      {
        user: "deploy",
        ip: "10.0.12.2",
        time: "2026-09-09T14:02:00Z",
        success: true,
      },
      {
        user: "root",
        ip: "203.0.113.44",
        time: "2026-09-09T11:18:00Z",
        success: false,
      },
      {
        user: "deploy",
        ip: "10.0.12.2",
        time: "2026-09-08T17:40:00Z",
        success: true,
      },
    ],
    firewall: { status: "active", type: "ufw", chains: 3, rules: 12 },
    temperature: {
      highestCelsius: 54.2,
      sensors: [
        { label: "Package id 0", celsius: 54.2 },
        { label: "Core 0", celsius: 51.0 },
        { label: "Core 1", celsius: 49.8 },
      ],
    },
  },
};

/** Fallback readings for hosts without a dedicated fixture. */
export const DEMO_HOST_METRICS_DEFAULT: DemoHostMetrics =
  DEMO_HOST_METRICS["h-web-01"];

// ── tmux ────────────────────────────────────────────────────

/** Canned pane output, keyed by tmux pane id. */
export const DEMO_TMUX_PANE_OUTPUT: Record<string, string[]> = {
  "deploy:0.0": [
    "deploy@web-01:~$ git pull --ff-only",
    "Already up to date.",
    "deploy@web-01:~$ ",
  ],
  "deploy:0.1": [
    "14:02:11 INFO  request GET /api/hosts 200 12ms",
    "14:02:13 INFO  request GET /api/health 200 2ms",
    "14:02:19 WARN  slow query 412ms",
    "14:02:24 INFO  request POST /api/tunnel 201 88ms",
  ],
  "deploy:1.0": [
    "> build",
    "",
    "vite v8.2.2 building for production...",
    "✓ 412 modules transformed.",
    "✓ built in 4.21s",
  ],
  "monitor:0.0": [
    "  1  [||||||          22.4%]   Tasks: 148, 412 thr",
    "  2  [|||             11.8%]   Load average: 0.42 0.38 0.31",
    "  Mem[||||||||     3.4G/8.0G]   Uptime: 41 days, 06:12",
  ],
};
