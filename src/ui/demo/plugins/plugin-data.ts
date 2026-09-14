// Fixtures for the plugin system UI. Mirrors the v3.0.0 plugin architecture:
// three shipping tiers, declared capabilities, and registries as static JSON.

/** A capability is what the plugin's code may do, declared in its manifest. */
export type PluginCapability =
  | "hosts:read"
  | "hosts:write"
  | "credentials:use"
  | "ssh:exec"
  | "ssh:sftp"
  | "storage:own"
  | "storage:secrets"
  | "network:outbound"
  | "events:read"
  | "notify:send"
  | "users:read"
  | "ui:surface";

export type CapabilityRisk = "high" | "medium" | "low";

/**
 * Install dialog copy. The user is told the consequence, not the capability
 * name, and high-risk lines are never folded into the summary row.
 */
export const CAPABILITY_INFO: Record<
  PluginCapability,
  { risk: CapabilityRisk; title: string; detail: string }
> = {
  "ssh:exec": {
    risk: "high",
    title: "Run commands on your servers",
    detail: "Any command, on hosts you connect it to, with your access.",
  },
  "ssh:sftp": {
    risk: "high",
    title: "Read and write files on your servers",
    detail: "Over SFTP, on hosts you connect it to.",
  },
  "hosts:write": {
    risk: "medium",
    title: "Create and change hosts",
    detail: "It can add hosts and edit the ones you already have.",
  },
  "credentials:use": {
    risk: "medium",
    title: "Connect to your servers",
    detail: "It cannot see your passwords or keys.",
  },
  "network:outbound": {
    risk: "medium",
    title: "Reach the internet",
    detail: "Only the addresses listed in its manifest.",
  },
  "notify:send": {
    risk: "medium",
    title: "Send notifications",
    detail: "Through the channels you have already set up.",
  },
  "users:read": {
    risk: "medium",
    title: "See usernames and roles",
    detail: "Never password hashes, never two-factor state.",
  },
  "hosts:read": {
    risk: "low",
    title: "See your host list",
    detail: "Names and addresses for hosts you can already see.",
  },
  "storage:own": {
    risk: "low",
    title: "Store its own data",
    detail: "Kept separate from other plugins.",
  },
  "storage:secrets": {
    risk: "low",
    title: "Store its own secrets",
    detail: "Encrypted by Termix. The plugin never holds the key.",
  },
  "events:read": {
    risk: "low",
    title: "Watch for things happening",
    detail: "Such as a host being added or a session opening.",
  },
  "ui:surface": {
    risk: "low",
    title: "Add its own screens",
    detail: "Tabs, panels and settings you can hide later.",
  },
};

export type PluginTier = "bundled" | "available" | "store";
export type PluginSource = "official" | "community" | "local";
export type PluginState = "enabled" | "disabled" | "failed";

export interface PluginVersion {
  version: string;
  publishedAt: string;
  notes: string;
}

export interface DemoPlugin {
  id: string;
  name: string;
  author: string;
  description: string;
  /** Longer copy for the detail view. */
  about?: string;
  /** Lucide icon name, resolved by the UI so fixtures stay plain data. */
  icon: string;
  category: string;
  tier: PluginTier;
  source: PluginSource;
  registry: string;
  version: string;
  /** Set when a newer version is listed. */
  latestVersion?: string;
  /** Capabilities the update adds. Present means the update waits for consent. */
  addedCapabilities?: PluginCapability[];
  capabilities: PluginCapability[];
  /** Destinations it adds, listed so removal is predictable. */
  contributes: string[];
  /**
   * Machine-readable form of `contributes`, for the destinations the UI can
   * render. Only present where the demo actually wires the contribution up.
   */
  contributions?: {
    dashboardCards?: {
      id: string;
      label: string;
      /** Lucide icon name, resolved by the UI so fixtures stay plain data. */
      icon: string;
      kind: "containers" | "guests" | "metrics";
    }[];
  };
  /** Install count, formatted for display. */
  downloads: string;
  /** Live resource use of the plugin worker, display strings. */
  cpu: string;
  ram: string;
  repository: string;
  history: PluginVersion[];
  installed: boolean;
  state: PluginState;
  autoUpdate: boolean;
}

export interface DemoRegistry {
  id: string;
  name: string;
  url: string;
  kind: "official" | "community" | "custom";
  enabled: boolean;
  pluginCount: number;
  lastChecked: string;
}

export const DEMO_REGISTRIES: DemoRegistry[] = [
  {
    id: "termix-official",
    name: "Termix Official",
    url: "https://plugins.termix.site/official.json",
    kind: "official",
    enabled: true,
    pluginCount: 18,
    lastChecked: "4 minutes ago",
  },
  {
    id: "termix-community",
    name: "Community",
    url: "https://plugins.termix.site/community.json",
    kind: "community",
    enabled: false,
    pluginCount: 62,
    lastChecked: "Never",
  },
  {
    id: "self-hosted",
    name: "My Registry",
    url: "https://plugins.home.lan/termix.json",
    kind: "custom",
    enabled: true,
    pluginCount: 3,
    lastChecked: "4 minutes ago",
  },
];

export const DEMO_PLUGINS: DemoPlugin[] = [
  // Bundled: in the image, on at first boot, still removable.
  {
    id: "file-manager",
    name: "File Manager",
    author: "Termix",
    description: "Browse, edit and transfer files over SFTP.",
    about:
      "A file browser for any host with SFTP. Edit files in place, drag files in to upload, and pin the folders you visit often.",
    icon: "FolderTree",
    category: "Files & Transfer",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:sftp",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Files tab", "Host setting"],
    downloads: "128k",
    cpu: "0.2%",
    ram: "34 MB",
    repository: "github.com/Termix-SSH/File-Manager",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "host-metrics",
    name: "Host Metrics",
    author: "Termix",
    description: "CPU, memory, disk and network graphs per host.",
    about:
      "Polls each host for load, memory, disk and network counters, keeps the history, and feeds the dashboard cards and the alerting rules.",
    icon: "Activity",
    category: "Monitoring",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "events:read",
      "ui:surface",
    ],
    contributes: ["Metrics tab", "2 dashboard cards", "Host setting"],
    contributions: {
      dashboardCards: [
        {
          id: "host-metrics.load",
          label: "Host load",
          icon: "Activity",
          kind: "metrics",
        },
      ],
    },
    downloads: "119k",
    cpu: "1.4%",
    ram: "72 MB",
    repository: "github.com/Termix-SSH/Host-Metrics",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "snippets",
    name: "Snippets",
    author: "Termix",
    description: "Save a command once and run it on any host.",
    icon: "Play",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    latestVersion: "1.1.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Snippets panel", "Palette entries"],
    downloads: "96k",
    cpu: "0.1%",
    ram: "18 MB",
    repository: "github.com/Termix-SSH/Snippets",
    history: [
      {
        version: "1.1.0",
        publishedAt: "2026-09-11",
        notes: "Folders can be nested. Run a snippet on a fleet from the palette.",
      },
      {
        version: "1.0.0",
        publishedAt: "2026-09-05",
        notes: "Fixed ordering after a rename.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: false,
  },
  {
    id: "tunnels",
    name: "SSH Tunnels",
    author: "Termix",
    description: "Local, remote and dynamic port forwards that stay up.",
    icon: "Network",
    category: "Networking",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "credentials:use", "storage:own", "ui:surface"],
    contributes: ["Tunnels tab", "Host setting"],
    downloads: "88k",
    cpu: "0.3%",
    ram: "26 MB",
    repository: "github.com/Termix-SSH/Tunnels",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "session-logs",
    name: "Session Logs",
    author: "Termix",
    description: "Record terminal sessions and replay them later.",
    icon: "ScrollText",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Session logs panel"],
    downloads: "54k",
    cpu: "0.1%",
    ram: "21 MB",
    repository: "github.com/Termix-SSH/Session-Logs",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: true,
    state: "disabled",
    autoUpdate: true,
  },

  // Available: in the image, off until you turn it on.
  {
    id: "docker",
    name: "Docker",
    author: "Termix",
    description: "Containers, logs and stats on any host running Docker.",
    about:
      "Lists containers on a host, starts and stops them, streams logs, and shows CPU, memory and network per container. Works with Podman too.",
    icon: "Container",
    category: "Infrastructure",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    latestVersion: "1.1.0",
    addedCapabilities: ["notify:send"],
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Docker tab", "Dashboard card", "Host setting"],
    contributions: {
      dashboardCards: [
        {
          id: "docker.containers",
          label: "Containers",
          icon: "Container",
          kind: "containers",
        },
      ],
    },
    downloads: "112k",
    cpu: "1.1%",
    ram: "64 MB",
    repository: "github.com/Termix-SSH/Docker",
    history: [
      {
        version: "1.1.0",
        publishedAt: "2026-09-10",
        notes:
          "Send a notification when a container stops on its own. Compose projects group together.",
      },
      {
        version: "1.0.0",
        publishedAt: "2026-09-04",
        notes: "Faster stats polling.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "tmux-monitor",
    name: "Tmux Monitor",
    author: "Termix",
    description: "See every tmux session and pane on a host.",
    icon: "LayoutGrid",
    category: "Terminal",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "credentials:use", "ssh:exec", "ui:surface"],
    contributes: ["Tmux tab", "Host setting"],
    downloads: "31k",
    cpu: "0.4%",
    ram: "29 MB",
    repository: "github.com/Termix-SSH/Tmux-Monitor",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: true,
    state: "failed",
    autoUpdate: true,
  },
  {
    id: "alerting",
    name: "Alerting",
    author: "Termix",
    description: "Rules on host metrics, and where the notice goes.",
    about:
      "Write a rule against any metric a plugin publishes, pick a channel, and get told when it trips.",
    icon: "BellRing",
    category: "Monitoring",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "events:read",
      "notify:send",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Alerts panel", "Notification channels"],
    downloads: "47k",
    cpu: "0.5%",
    ram: "31 MB",
    repository: "github.com/Termix-SSH/Alerting",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "homepage",
    name: "Homepage",
    author: "Termix",
    description: "A start page built from widgets you arrange.",
    icon: "LayoutTemplate",
    category: "Productivity",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Homepage tab"],
    downloads: "38k",
    cpu: "0.2%",
    ram: "24 MB",
    repository: "github.com/Termix-SSH/Homepage",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "command-history",
    name: "Command History",
    author: "Termix",
    description: "Everything you have typed, searchable and rerunnable.",
    icon: "Clock",
    category: "Terminal",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["History panel"],
    downloads: "44k",
    cpu: "0.1%",
    ram: "16 MB",
    repository: "github.com/Termix-SSH/Command-History",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "network-topology",
    name: "Network Topology",
    author: "Termix",
    description: "A graph of your hosts and their jump chains.",
    icon: "Workflow",
    category: "Networking",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "ui:surface"],
    contributes: ["Network graph tab"],
    downloads: "22k",
    cpu: "0.3%",
    ram: "28 MB",
    repository: "github.com/Termix-SSH/Network-Topology",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "Rebuilt as a plugin.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },

  // Store: downloaded on demand.
  {
    id: "proxmox",
    name: "Proxmox",
    author: "Termix",
    description: "Node and VM stats for Proxmox VE clusters.",
    about:
      "Reads a Proxmox cluster over its API: node load, guest state, storage pools and interfaces. Can import guests as hosts, so a new VM turns up in your sidebar without you typing anything.",
    icon: "Server",
    category: "Infrastructure",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "hosts:write",
      "credentials:use",
      "network:outbound",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Proxmox tab", "Dashboard card", "Host setting"],
    contributions: {
      dashboardCards: [
        {
          id: "proxmox.guests",
          label: "Proxmox guests",
          icon: "Server",
          kind: "guests",
        },
      ],
    },
    downloads: "61k",
    cpu: "0.9%",
    ram: "47 MB",
    repository: "github.com/Termix-SSH/Proxmox",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-01",
        notes: "Guest import keeps folder structure.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "guacamole",
    name: "Guacamole",
    author: "Termix",
    description: "RDP, VNC and Telnet sessions in a browser tab.",
    about:
      "Brings remote desktop into Termix using Apache Guacamole. None of it is linked into the Termix server unless you install this.",
    icon: "Monitor",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "credentials:use", "storage:own", "ui:surface"],
    contributes: ["RDP tab", "VNC tab", "Telnet tab", "3 host settings"],
    downloads: "73k",
    cpu: "2.3%",
    ram: "118 MB",
    repository: "github.com/Termix-SSH/Guacamole",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-08-29",
        notes: "Clipboard sync both ways.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: false,
  },
  {
    id: "assistant",
    name: "Assistant",
    author: "Termix",
    description: "Ask about a host, and review commands before they run.",
    about:
      "Connects Termix to a model you choose. Every command it suggests is shown to you first and only runs when you say so.",
    icon: "Sparkles",
    category: "Productivity",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "network:outbound",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Assistant panel", "Settings panel"],
    downloads: "29k",
    cpu: "0.6%",
    ram: "55 MB",
    repository: "github.com/Termix-SSH/Assistant",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-06",
        notes: "Local model endpoints.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "serial",
    name: "Serial Console",
    author: "Termix",
    description: "Talk to a device over USB or a serial adapter.",
    icon: "Usb",
    category: "Terminal",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["storage:own", "ui:surface"],
    contributes: ["Serial panel", "Serial tab"],
    downloads: "12k",
    cpu: "0.2%",
    ram: "19 MB",
    repository: "github.com/Termix-SSH/Serial",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-08-22",
        notes: "Port list refreshes on hotplug.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "fleet-inventory",
    name: "Fleet Inventory",
    author: "Termix",
    description: "Collected facts for every host in a fleet, side by side.",
    icon: "Boxes",
    category: "Infrastructure",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Inventory tab"],
    downloads: "9.4k",
    cpu: "0.7%",
    ram: "38 MB",
    repository: "github.com/Termix-SSH/Fleet-Inventory",
    history: [
      { version: "1.0.0", publishedAt: "2026-08-30", notes: "Export to CSV." },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "vault",
    name: "HashiCorp Vault",
    author: "Termix",
    description: "Sign SSH certificates through Vault at connect time.",
    icon: "KeyRound",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "network:outbound",
      "storage:secrets",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Vault profiles", "Settings panel"],
    downloads: "17k",
    cpu: "0.2%",
    ram: "23 MB",
    repository: "github.com/Termix-SSH/Vault",
    history: [
      { version: "1.0.0", publishedAt: "2026-09-03", notes: "Namespace support." },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "collab",
    name: "Collab",
    author: "Termix",
    description: "Share a live terminal session with someone else.",
    icon: "Users",
    category: "Productivity",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "users:read",
      "events:read",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Meetings panel"],
    downloads: "6.8k",
    cpu: "0.8%",
    ram: "42 MB",
    repository: "github.com/Termix-SSH/Collab",
    history: [
      { version: "1.0.0", publishedAt: "2026-08-25", notes: "Read-only guests." },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },

  // Community and internal, to show how the labelling reads.
  {
    id: "samba",
    name: "Samba",
    author: "randomdev101",
    description: "Browse and mount SMB shares on your hosts.",
    about:
      "Lists the SMB shares a host is serving, shows who is connected to each one, and mounts a share so you can work in it from the file manager.",
    icon: "HardDrive",
    category: "Files & Transfer",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "0.5.7",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Shares tab", "Host setting"],
    downloads: "4.2k",
    cpu: "0.3%",
    ram: "27 MB",
    repository: "github.com/mreyes/Samba",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-08-19",
        notes: "Mount a share straight into the file manager.",
      },
    ],
    installed: true,
    state: "enabled",
    autoUpdate: false,
  },
  {
    id: "wake-on-lan",
    name: "Wake on LAN",
    author: "jdoyle",
    description: "Wake a sleeping host from its context menu.",
    icon: "Power",
    category: "Networking",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "1.0.0",
    capabilities: ["hosts:read", "network:outbound", "ui:surface"],
    contributes: ["Host menu action"],
    downloads: "11k",
    cpu: "0.1%",
    ram: "12 MB",
    repository: "github.com/jdoyle/Wake-On-LAN",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-07-30",
        notes: "Broadcast address per folder.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "ansible-runner",
    name: "Ansible Runner",
    author: "kmarsh",
    description: "Run a playbook against a fleet and watch it go.",
    icon: "ListChecks",
    category: "Productivity",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "ssh:sftp",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Playbooks tab"],
    downloads: "7.1k",
    cpu: "1.6%",
    ram: "86 MB",
    repository: "github.com/kmarsh/Ansible-Runner",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-08-12",
        notes: "Inventory built from fleets.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "netbox-sync",
    name: "NetBox Sync",
    author: "svance",
    description: "Keep hosts in step with a NetBox instance.",
    icon: "RefreshCw",
    category: "Infrastructure",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "hosts:write",
      "network:outbound",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Settings panel"],
    downloads: "1.9k",
    cpu: "0.4%",
    ram: "33 MB",
    repository: "github.com/svance/NetBox-Sync",
    history: [
      { version: "1.0.0", publishedAt: "2026-06-02", notes: "Tag mapping." },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "deploy",
    name: "Deploy",
    author: "Random Company",
    description: "Ship a service to the staging fleet.",
    about:
      "A plugin written in-house and served from a registry on the local network. Termix treats it like any other unofficial source: same install prompt, same permission list.",
    icon: "Rocket",
    category: "Productivity",
    tier: "store",
    source: "local",
    registry: "self-hosted",
    version: "1.8.2",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Deploy tab"],
    downloads: "340",
    cpu: "0.5%",
    ram: "35 MB",
    repository: "git.home.lan/me/Deploy",
    history: [
      {
        version: "1.8.2",
        publishedAt: "2026-09-08",
        notes: "Rollback picks the last good build.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
];
