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
    /** Rail and palette destinations, withdrawn with the plugin. */
    navItems?: {
      id: string;
      label: string;
      /** Lucide icon name, resolved by the UI so fixtures stay plain data. */
      icon: string;
      group: "objects" | "tools" | "system";
    }[];
    dashboardCards?: {
      id: string;
      label: string;
      /** Lucide icon name, resolved by the UI so fixtures stay plain data. */
      icon: string;
      kind: "containers" | "guests" | "metrics";
    }[];
    /**
     * A settings page of its own, listed under Plugins in the settings screen.
     *
     * The plugin declares its fields and Termix draws them, so every plugin's
     * settings look like the rest of the app and none of them ship their own
     * form styling. The page disappears when the plugin is uninstalled.
     */
    settings?: {
      /** Lucide icon name for the settings nav entry. */
      icon?: string;
      groups: {
        title: string;
        fields: {
          key: string;
          label: string;
          description?: string;
          type: "switch" | "text" | "select" | "action";
          /** Starting value: boolean for switch, string otherwise. */
          value?: string | boolean;
          /** Options for a select, or the button label for an action. */
          options?: string[];
          placeholder?: string;
        }[];
      }[];
    };
    /**
     * Fields this plugin adds to the host editor, drawn by Termix the same way
     * its settings page is.
     *
     * Before this existed the editor hardcoded a tab per feature, so an
     * uninstalled plugin still showed its tab and a new plugin could not add
     * one. The section now arrives and leaves with the plugin.
     */
    hostFields?: {
      /** Lucide icon name for the section heading. */
      icon?: string;
      /** Heading shown above the fields. */
      label: string;
      /**
       * The host flag this section switches on, e.g. "enableDocker". Rendered
       * as the first row, and the rest of the fields follow it.
       */
      enableKey: string;
      /** Copy for the enable row. */
      enableLabel: string;
      enableDescription?: string;
      fields?: {
        key: string;
        label: string;
        description?: string;
        type: "switch" | "text" | "number" | "select";
        /** Starting value: boolean for switch, number for number, else string. */
        value?: string | number | boolean;
        options?: string[];
        placeholder?: string;
        /** Hidden until the enable flag is on. Defaults to true. */
        requiresEnable?: boolean;
      }[];
    };
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
    contributes: ["Files tab", "Host setting", "Settings panel"],
    contributions: {
      hostFields: {
        icon: "FolderTree",
        label: "File manager",
        enableKey: "enableFileManager",
        enableLabel: "Browse files on this host",
        enableDescription: "Opens a file tab over SFTP.",
        fields: [
          {
            key: "defaultPath",
            label: "Start folder",
            description: "Where the file tab opens. Defaults to the home folder.",
            type: "text",
            placeholder: "/",
          },
          {
            key: "scpLegacy",
            label: "Use legacy SCP",
            description: "For older servers without an SFTP subsystem.",
            type: "switch",
            value: false,
          },
        ],
      },
      settings: {
        icon: "FolderTree",
        groups: [
          {
            title: "Browsing",
            fields: [
              {
                key: "showHidden",
                label: "Show hidden files",
                description: "Files and folders whose name starts with a dot.",
                type: "switch",
                value: false,
              },
              {
                key: "defaultView",
                label: "Default view",
                type: "select",
                value: "Grid",
                options: ["Grid", "List"],
              },
              {
                key: "defaultPath",
                label: "Open at",
                description:
                  "Where a new Files tab starts, unless the host says otherwise.",
                type: "text",
                value: "~",
                placeholder: "~",
              },
            ],
          },
          {
            title: "Transfers",
            fields: [
              {
                key: "confirmOverwrite",
                label: "Ask before overwriting",
                type: "switch",
                value: true,
              },
              {
                key: "preserveTimes",
                label: "Keep modified times",
                description: "Copy timestamps along with the file.",
                type: "switch",
                value: true,
              },
            ],
          },
        ],
      },
    },
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
      hostFields: {
        icon: "Activity",
        label: "Host metrics",
        enableKey: "enableHostMetrics",
        enableLabel: "Collect metrics from this host",
        enableDescription: "CPU, memory, disk and network, polled over SSH.",
        fields: [
          {
            key: "statusCheckInterval",
            label: "Status check every",
            description: "Seconds between reachability checks.",
            type: "number",
            value: 60,
          },
          {
            key: "metricsInterval",
            label: "Metrics every",
            description: "Seconds between metric samples.",
            type: "number",
            value: 30,
          },
        ],
      },
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
    contributions: {
      navItems: [
        { id: "snippets", label: "Snippets", icon: "Play", group: "tools" },
      ],
    },
    downloads: "96k",
    cpu: "0.1%",
    ram: "18 MB",
    repository: "github.com/Termix-SSH/Snippets",
    history: [
      {
        version: "1.1.0",
        publishedAt: "2026-09-11",
        notes:
          "Folders can be nested. Run a snippet on a fleet from the palette.",
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
    capabilities: [
      "hosts:read",
      "credentials:use",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Tunnels tab", "Host setting"],
    contributions: {
      hostFields: {
        icon: "Network",
        label: "Tunnels",
        enableKey: "enableTunnel",
        enableLabel: "Forward ports through this host",
        enableDescription:
          "Local, remote and dynamic forwards. Set the rules up in the tunnels tab.",
      },
    },
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
    contributions: {
      navItems: [
        {
          id: "session-logs",
          label: "Session Logs",
          icon: "ScrollText",
          group: "tools",
        },
      ],
    },
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
    contributes: [
      "Docker tab",
      "Dashboard card",
      "Host setting",
      "Settings panel",
    ],
    contributions: {
      hostFields: {
        icon: "Box",
        label: "Docker",
        enableKey: "enableDocker",
        enableLabel: "Manage containers on this host",
        enableDescription: "Lists containers, streams logs, shows per-container stats.",
        fields: [
          {
            key: "dockerRuntime",
            label: "Runtime",
            type: "select",
            value: "docker",
            options: ["docker", "podman"],
          },
        ],
      },
      settings: {
        icon: "Box",
        groups: [
          {
            title: "Connection",
            fields: [
              {
                key: "runtime",
                label: "Runtime",
                type: "select",
                value: "Docker",
                options: ["Docker", "Podman"],
              },
            ],
          },
          {
            title: "Display",
            fields: [
              {
                key: "showStopped",
                label: "Show stopped containers",
                type: "switch",
                value: true,
              },
              {
                key: "refresh",
                label: "Refresh stats",
                type: "select",
                value: "Every 5 seconds",
                options: [
                  "Every 2 seconds",
                  "Every 5 seconds",
                  "Every 30 seconds",
                ],
              },
            ],
          },
        ],
      },
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
    contributions: {
      hostFields: {
        icon: "LayoutGrid",
        label: "Tmux monitor",
        enableKey: "enableTmuxMonitor",
        enableLabel: "Watch tmux sessions on this host",
        enableDescription: "Lists sessions and windows, and reattaches to them.",
      },
    },
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
    contributions: {
      navItems: [
        { id: "history", label: "History", icon: "Clock", group: "tools" },
      ],
    },
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
      hostFields: {
        icon: "Server",
        label: "Proxmox",
        enableKey: "enableProxmox",
        enableLabel: "Treat this host as a Proxmox node",
        enableDescription: "Finds its guests and can add them as hosts.",
        fields: [
          {
            key: "proxmoxWindowsPatterns",
            label: "Windows guests match",
            description: "Names containing these are set up as RDP hosts.",
            type: "text",
            value: "win, windows",
          },
          {
            key: "proxmoxPreferredPrefixes",
            label: "Preferred address prefixes",
            description: "Which address to pick when a guest has several.",
            type: "text",
            value: "10., 192.168.",
          },
          {
            key: "proxmoxAutoSync",
            label: "Sync guests automatically",
            type: "switch",
            value: false,
          },
          {
            key: "proxmoxSyncInterval",
            label: "Sync every",
            description: "Minutes between syncs. Minimum 5.",
            type: "number",
            value: 15,
          },
        ],
      },
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
    capabilities: [
      "hosts:read",
      "credentials:use",
      "storage:own",
      "ui:surface",
    ],
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
    contributions: {
      settings: {
        icon: "Sparkles",
        groups: [
          {
            title: "Provider",
            fields: [
              {
                key: "provider",
                label: "Model provider",
                description: "Where prompts are sent.",
                type: "select",
                value: "Ollama (self-hosted)",
                options: [
                  "Ollama (self-hosted)",
                  "Anthropic",
                  "OpenAI",
                  "Google Gemini",
                ],
              },
              {
                key: "endpoint",
                label: "Endpoint",
                description: "Only hosts your admin has allowed.",
                type: "text",
                value: "http://localhost:11434",
                placeholder: "http://localhost:11434",
              },
              {
                key: "apiKey",
                label: "API key",
                description:
                  "Stored encrypted. The plugin never holds the key.",
                type: "action",
                options: ["Set key"],
              },
            ],
          },
          {
            title: "Behaviour",
            fields: [
              {
                key: "readOnly",
                label: "Allow read-only diagnostic commands",
                description:
                  "Safe commands like df and uptime run without asking. Anything that changes a server is always proposed first.",
                type: "switch",
                value: false,
              },
              {
                key: "autoContext",
                label: "Send host details with each question",
                description: "Name, address and tags. Never credentials.",
                type: "switch",
                value: true,
              },
            ],
          },
        ],
      },
    },
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
    contributions: {
      navItems: [
        { id: "serial", label: "Serial", icon: "Usb", group: "tools" },
      ],
    },
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
    contributions: {
      settings: {
        icon: "KeyRound",
        groups: [
          {
            title: "Connection",
            fields: [
              {
                key: "address",
                label: "Vault address",
                type: "text",
                value: "https://vault.internal:8200",
                placeholder: "https://vault.example.com:8200",
              },
              {
                key: "mount",
                label: "SSH mount path",
                type: "text",
                value: "ssh-client-signer",
              },
              {
                key: "authMethod",
                label: "Auth method",
                type: "select",
                value: "OIDC",
                options: ["OIDC", "AppRole", "Token"],
              },
            ],
          },
          {
            title: "Certificates",
            fields: [
              {
                key: "ttl",
                label: "Certificate lifetime",
                description: "How long a signed certificate stays valid.",
                type: "select",
                value: "8h",
                options: ["1h", "8h", "24h"],
              },
              {
                key: "renew",
                label: "Renew before expiry",
                description:
                  "Sign a fresh certificate when one is close to expiring.",
                type: "switch",
                value: true,
              },
            ],
          },
        ],
      },
    },
    downloads: "17k",
    cpu: "0.2%",
    ram: "23 MB",
    repository: "github.com/Termix-SSH/Vault",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-03",
        notes: "Namespace support.",
      },
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
      {
        version: "1.0.0",
        publishedAt: "2026-08-25",
        notes: "Read-only guests.",
      },
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
    contributions: {
      hostFields: {
        icon: "FolderTree",
        label: "Samba shares",
        enableKey: "enableSamba",
        enableLabel: "List SMB shares on this host",
        enableDescription: "Reads the share list and mounts them for browsing.",
        fields: [
          {
            key: "sambaWorkgroup",
            label: "Workgroup",
            type: "text",
            value: "WORKGROUP",
          },
        ],
      },
    },
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
    contributions: {
      settings: {
        icon: "Network",
        groups: [
          {
            title: "Source",
            fields: [
              {
                key: "url",
                label: "NetBox URL",
                type: "text",
                value: "https://netbox.internal",
                placeholder: "https://netbox.example.com",
              },
              {
                key: "token",
                label: "API token",
                description: "Read-only is enough.",
                type: "action",
                options: ["Set token"],
              },
            ],
          },
          {
            title: "Sync",
            fields: [
              {
                key: "interval",
                label: "Check for changes",
                type: "select",
                value: "Every hour",
                options: [
                  "Every 15 minutes",
                  "Every hour",
                  "Daily",
                  "Manually",
                ],
              },
              {
                key: "createHosts",
                label: "Create hosts for new devices",
                description: "New devices in NetBox appear as hosts here.",
                type: "switch",
                value: true,
              },
              {
                key: "markMissing",
                label: "Mark removed devices offline",
                description: "Hosts are never deleted automatically.",
                type: "switch",
                value: true,
              },
            ],
          },
        ],
      },
    },
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
