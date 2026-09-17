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
  /**
   * Termix will not start without it, so the store shows the controls disabled
   * rather than hiding them. Everything else here can be removed.
   */
  required?: boolean;
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
    pluginCount: 29,
    lastChecked: "4 minutes ago",
  },
  {
    id: "termix-community",
    name: "Community",
    url: "https://plugins.termix.site/community.json",
    kind: "community",
    enabled: false,
    pluginCount: 64,
    lastChecked: "Never",
  },
  {
    id: "self-hosted",
    name: "My Registry",
    url: "https://plugins.home.lan/termix.json",
    kind: "custom",
    enabled: true,
    pluginCount: 2,
    lastChecked: "4 minutes ago",
  },
];

export const DEMO_PLUGINS: DemoPlugin[] = [
  // ── Bundled: in the image, on at first boot, still removable ──────────────
  {
    id: "terminal",
    name: "SSH Terminal",
    author: "Termix",
    description: "The SSH terminal, with tabs, themes and reconnect.",
    about:
      "Opens an SSH session on any host and keeps it open. Reconnects when the link drops, remembers scrollback, and takes the keyboard shortcuts and themes you set in its settings.",
    icon: "Terminal",
    category: "Terminal",
    tier: "bundled",
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
    contributes: ["Terminal tab", "Host setting", "Settings panel"],
    contributions: {
      hostFields: {
        icon: "Terminal",
        label: "Terminal",
        enableKey: "enableTerminal",
        enableLabel: "Open a terminal on this host",
        enableDescription: "An SSH session in a tab.",
        fields: [
          {
            key: "startupSnippet",
            label: "Run on connect",
            description: "A command sent once the session opens.",
            type: "text",
            placeholder: "tmux attach",
          },
          {
            key: "keepaliveInterval",
            label: "Keepalive every",
            description: "Seconds between keepalive packets. 0 turns it off.",
            type: "number",
            value: 30,
          },
        ],
      },
      settings: {
        icon: "Terminal",
        groups: [
          {
            title: "Appearance",
            fields: [
              {
                key: "theme",
                label: "Theme",
                type: "select",
                value: "Termix Default",
                options: [
                  "Termix Default",
                  "Dracula",
                  "Nord",
                  "Gruvbox Dark",
                  "Tokyo Night",
                  "Catppuccin Mocha",
                ],
              },
              {
                key: "fontFamily",
                label: "Font",
                type: "select",
                value: "JetBrains Mono",
                options: [
                  "JetBrains Mono",
                  "Fira Code",
                  "Cascadia Code",
                  "Menlo",
                ],
              },
              {
                key: "fontSize",
                label: "Font size",
                type: "select",
                value: "14",
                options: ["11", "12", "13", "14", "16", "18"],
              },
              {
                key: "cursorBlink",
                label: "Blink the cursor",
                type: "switch",
                value: true,
              },
            ],
          },
          {
            title: "Behaviour",
            fields: [
              {
                key: "scrollback",
                label: "Scrollback lines",
                description: "How much output a tab keeps before dropping it.",
                type: "text",
                value: "10000",
              },
              {
                key: "copyOnSelect",
                label: "Copy on select",
                type: "switch",
                value: true,
              },
              {
                key: "rightClickPaste",
                label: "Right click pastes",
                description: "Off means right click opens the menu instead.",
                type: "switch",
                value: true,
              },
              {
                key: "localEcho",
                label: "Predict typing",
                description: "Shows keystrokes before the server echoes them.",
                type: "switch",
                value: false,
              },
            ],
          },
        ],
      },
    },
    downloads: "144k",
    cpu: "0.6%",
    ram: "48 MB",
    repository: "github.com/Termix-SSH/Terminal",
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
    required: true,
  },
  {
    id: "dashboard",
    name: "Dashboard",
    author: "Termix",
    description: "The start tab, with status, counts and recent activity.",
    about:
      "A tab that opens on launch and shows what your fleet is doing: how many hosts answer, what changed recently, and whatever cards your other plugins add.",
    icon: "LayoutGrid",
    category: "Productivity",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Dashboard tab", "Card layout"],
    downloads: "140k",
    cpu: "0.2%",
    ram: "22 MB",
    repository: "github.com/Termix-SSH/Dashboard",
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
            description:
              "Where the file tab opens. Defaults to the home folder.",
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
              {
                key: "useTrash",
                label: "Delete to trash",
                description:
                  "Deleted files move aside so you can put them back.",
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
    contributes: ["Metrics tab", "Dashboard card", "Host setting"],
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
    about:
      "Keeps the commands you keep retyping. Group them in folders, fill in variables before they run, and send one to several terminals at once.",
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
    about:
      "Forwards a port through a host and puts it back when the link drops. Local, remote and dynamic SOCKS forwards, each with its own retry policy.",
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
        fields: [
          {
            key: "autoStartTunnels",
            label: "Start with Termix",
            description: "Bring this host's forwards up on launch.",
            type: "switch",
            value: false,
          },
          {
            key: "tunnelRetryCount",
            label: "Retry attempts",
            description: "How many times to redial before giving up.",
            type: "number",
            value: 3,
          },
        ],
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
    id: "connections",
    name: "Connections",
    author: "Termix",
    description: "Every session you have open, in one list.",
    about:
      "Lists the sessions that are running, the ones still warm in the background after a disconnect, and the ones other people have shared with you.",
    icon: "Plug",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Connections panel"],
    contributions: {
      navItems: [
        {
          id: "connections",
          label: "Connections",
          icon: "Plug",
          group: "objects",
        },
      ],
    },
    downloads: "101k",
    cpu: "0.1%",
    ram: "14 MB",
    repository: "github.com/Termix-SSH/Connections",
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
    id: "quick-connect",
    name: "Quick Connect",
    author: "Termix",
    description: "Open a one-off session without saving the host.",
    about:
      "For the box you will touch once. Type the address, pick how to authenticate, and connect. Nothing is written to your host list unless you ask.",
    icon: "Zap",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:write", "credentials:use", "ssh:exec", "ui:surface"],
    contributes: ["Quick Connect panel"],
    contributions: {
      navItems: [
        {
          id: "quick-connect",
          label: "Quick Connect",
          icon: "Zap",
          group: "tools",
        },
      ],
    },
    downloads: "93k",
    cpu: "0.1%",
    ram: "11 MB",
    repository: "github.com/Termix-SSH/Quick-Connect",
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
    id: "split-screen",
    name: "Split Screen",
    author: "Termix",
    description: "Up to six panes in one tab, each its own session.",
    about:
      "Splits the work area into panes and lets you drop a tab into each one. Drag the dividers to resize. The layout is part of a workspace, so it comes back with it.",
    icon: "LayoutPanelLeft",
    category: "Productivity",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["storage:own", "ui:surface"],
    contributes: ["Split layouts", "Rail toggle"],
    contributions: {
      navItems: [
        {
          id: "split-screen",
          label: "Split Screen",
          icon: "LayoutPanelLeft",
          group: "tools",
        },
      ],
    },
    downloads: "87k",
    cpu: "0.1%",
    ram: "9 MB",
    repository: "github.com/Termix-SSH/Split-Screen",
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
    id: "command-history",
    name: "Command History",
    author: "Termix",
    description: "Every command you have run, searchable.",
    about:
      "Records what you type in a terminal so you can find it again later, and offers it back as you type. Can be turned off for a host that handles anything sensitive.",
    icon: "Clock",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["History panel", "Host setting"],
    contributions: {
      navItems: [
        { id: "history", label: "History", icon: "Clock", group: "tools" },
      ],
      hostFields: {
        icon: "Clock",
        label: "Command history",
        enableKey: "enableCommandHistory",
        enableLabel: "Record commands run on this host",
        enableDescription:
          "Off means nothing is written down, and autocomplete has nothing to offer.",
      },
    },
    downloads: "76k",
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
    installed: true,
    state: "enabled",
    autoUpdate: true,
  },
  {
    id: "session-logs",
    name: "Session Logs",
    author: "Termix",
    description: "Record terminal sessions and replay them later.",
    about:
      "Writes a session to disk as it happens and plays it back at full speed or stepped through. Useful for handing someone a record of what was done.",
    icon: "ScrollText",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Session logs panel", "Host setting"],
    contributions: {
      navItems: [
        {
          id: "session-logs",
          label: "Session Logs",
          icon: "ScrollText",
          group: "tools",
        },
      ],
      hostFields: {
        icon: "ScrollText",
        label: "Session logging",
        enableKey: "enableSessionLogging",
        enableLabel: "Record sessions on this host",
        enableDescription: "Kept until you delete them.",
      },
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
  {
    id: "ssh-tools",
    name: "SSH Tools",
    author: "Termix",
    description: "Type into several terminals at once.",
    about:
      "Pick the terminals you want, then everything you type goes to all of them. Also fills a saved password into the ones waiting for it, and sets what right-click does.",
    icon: "Hammer",
    category: "Terminal",
    tier: "bundled",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "credentials:use", "ssh:exec", "ui:surface"],
    contributes: ["SSH tools panel"],
    contributions: {
      navItems: [
        { id: "ssh-tools", label: "SSH Tools", icon: "Hammer", group: "tools" },
      ],
    },
    downloads: "61k",
    cpu: "0.1%",
    ram: "12 MB",
    repository: "github.com/Termix-SSH/SSH-Tools",
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

  // ── Available: in the image, off until you turn it on ─────────────────────
  {
    id: "alerting",
    name: "Alerting",
    author: "Termix",
    description: "Rules on host metrics, and somewhere to send the notice.",
    about:
      "Watches the numbers Host Metrics collects and tells you when one stays over a threshold. Sends to a webhook or an ntfy topic, and holds off repeating itself.",
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
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Alerts panel", "Settings panel"],
    contributions: {
      navItems: [
        { id: "alerts", label: "Alerts", icon: "BellRing", group: "tools" },
      ],
      settings: {
        icon: "BellRing",
        groups: [
          {
            title: "Rules",
            fields: [
              {
                key: "defaultDuration",
                label: "Must hold for",
                description:
                  "Minutes a threshold stays crossed before it counts. 0 fires at once.",
                type: "text",
                value: "10",
              },
              {
                key: "cooldown",
                label: "Wait before repeating",
                description: "Minutes before the same rule can fire again.",
                type: "text",
                value: "30",
              },
            ],
          },
          {
            title: "Channels",
            fields: [
              {
                key: "webhookUrl",
                label: "Webhook",
                description: "A POST with the firing as JSON.",
                type: "text",
                placeholder: "https://hooks.example.com/termix",
              },
              {
                key: "ntfyTopic",
                label: "ntfy topic",
                type: "text",
                placeholder: "termix-alerts",
              },
              {
                key: "test",
                label: "Send a test",
                description: "Fires one notice through every channel above.",
                type: "action",
                options: ["Send test"],
              },
            ],
          },
        ],
      },
    },
    downloads: "71k",
    cpu: "0.2%",
    ram: "24 MB",
    repository: "github.com/Termix-SSH/Alerting",
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
        icon: "Container",
        label: "Docker",
        enableKey: "enableDocker",
        enableLabel: "Manage containers on this host",
        enableDescription: "Lists containers and streams their logs.",
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
        icon: "Container",
        groups: [
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
                key: "logLines",
                label: "Log lines",
                description: "How much of a log to fetch at once.",
                type: "select",
                value: "500",
                options: ["50", "100", "500", "1000", "All"],
              },
              {
                key: "showTimestamps",
                label: "Show log timestamps",
                type: "switch",
                value: false,
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
        publishedAt: "2026-09-12",
        notes: "Can send a notification when a container stops on its own.",
      },
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
    id: "tmux-monitor",
    name: "Tmux Monitor",
    author: "Termix",
    description: "See every tmux session, window and pane on a host.",
    about:
      "A tree of the tmux sessions running on a host, with a live preview of each pane and a search that reaches across all of them.",
    icon: "ListChecks",
    category: "Terminal",
    tier: "available",
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
    contributes: ["Tmux tab", "Host setting"],
    contributions: {
      hostFields: {
        icon: "ListChecks",
        label: "Tmux",
        enableKey: "enableTmuxMonitor",
        enableLabel: "Watch tmux sessions on this host",
        enableDescription: "Lists sessions, windows and panes.",
      },
    },
    downloads: "38k",
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
    id: "macros",
    name: "Macros",
    author: "Termix",
    description: "Scripted terminal flows that wait for what they expect.",
    about:
      "A run of steps against one terminal: send text, wait for a pattern, pause, branch on what came back, or repeat. For the login dance a plain snippet cannot do.",
    icon: "Braces",
    category: "Terminal",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "ssh:exec", "storage:own", "ui:surface"],
    contributes: ["Macros panel"],
    contributions: {
      navItems: [
        { id: "macros", label: "Macros", icon: "Braces", group: "tools" },
      ],
    },
    downloads: "34k",
    cpu: "0.1%",
    ram: "15 MB",
    repository: "github.com/Termix-SSH/Macros",
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
    id: "automations",
    name: "Automations",
    author: "Termix",
    description: "Run something when a trigger fires.",
    about:
      "A trigger and a list of steps. Fire on a metric threshold, a host going down, a schedule or a webhook, then run a snippet, call an HTTP endpoint or restart a container.",
    icon: "Workflow",
    category: "Productivity",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "events:read",
      "notify:send",
      "network:outbound",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Automations panel", "Run history"],
    contributions: {
      navItems: [
        {
          id: "automations",
          label: "Automations",
          icon: "Workflow",
          group: "tools",
        },
      ],
    },
    downloads: "46k",
    cpu: "0.3%",
    ram: "38 MB",
    repository: "github.com/Termix-SSH/Automations",
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
    id: "fleets",
    name: "Fleets",
    author: "Termix",
    description: "Group hosts and act on all of them at once.",
    about:
      "A named set of hosts, either picked by hand or matched by tag. Run one command across the whole group, push a file to every member, or compare what is installed.",
    icon: "Boxes",
    category: "Infrastructure",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "ssh:sftp",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Fleets panel", "Bulk actions"],
    contributions: {
      navItems: [
        { id: "fleets", label: "Fleets", icon: "Boxes", group: "objects" },
      ],
    },
    downloads: "52k",
    cpu: "0.2%",
    ram: "27 MB",
    repository: "github.com/Termix-SSH/Fleets",
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
    id: "workspaces",
    name: "Workspaces",
    author: "Termix",
    description: "Save a set of tabs and panes, then bring it back.",
    about:
      "Remembers which tabs were open, how the panes were split and what the docks were showing, so tomorrow morning starts where last night ended.",
    icon: "LayoutTemplate",
    category: "Productivity",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "storage:own", "ui:surface"],
    contributes: ["Workspaces panel"],
    contributions: {
      navItems: [
        {
          id: "workspaces",
          label: "Workspaces",
          icon: "LayoutTemplate",
          group: "objects",
        },
      ],
    },
    downloads: "44k",
    cpu: "0.1%",
    ram: "13 MB",
    repository: "github.com/Termix-SSH/Workspaces",
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
    id: "termix-id",
    name: "Termix ID",
    author: "Termix",
    description: "Publish your SSH public keys under a handle.",
    about:
      "Claims a handle others can pull your public keys from, and runs a small certificate authority so a server can trust one key instead of a list.",
    icon: "Fingerprint",
    category: "Access & Security",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "credentials:use",
      "storage:own",
      "storage:secrets",
      "network:outbound",
      "ui:surface",
    ],
    contributes: ["Termix ID panel", "Certificate authority"],
    contributions: {
      navItems: [
        {
          id: "termix-id",
          label: "Termix ID",
          icon: "Fingerprint",
          group: "objects",
        },
      ],
    },
    downloads: "29k",
    cpu: "0.1%",
    ram: "17 MB",
    repository: "github.com/Termix-SSH/Termix-ID",
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
    description: "A map of your hosts and the jumps between them.",
    about:
      "Draws every host and the jump chains connecting them, so you can see what a bastion is fronting and what stops working if it goes away.",
    icon: "Network",
    category: "Networking",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "storage:own", "ui:surface"],
    contributes: ["Network graph tab", "Dashboard card"],
    contributions: {
      navItems: [
        {
          id: "network_graph",
          label: "Network Graph",
          icon: "Network",
          group: "tools",
        },
      ],
    },
    downloads: "31k",
    cpu: "0.2%",
    ram: "41 MB",
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
  {
    id: "homepage",
    name: "Homepage",
    author: "Termix",
    description: "A start page you arrange yourself.",
    about:
      "A canvas of widgets: service links, host status, notes, clocks, RSS, charts and a terminal. Drag them where you want them and lock the layout when it is right.",
    icon: "LayoutGrid",
    category: "Productivity",
    tier: "available",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "events:read",
      "network:outbound",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Homepage tab", "Dashboard card"],
    downloads: "58k",
    cpu: "0.3%",
    ram: "52 MB",
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

  // ── Store: fetched from a registry, not in the image ──────────────────────
  {
    id: "guacamole",
    name: "Guacamole",
    author: "Termix",
    description: "RDP, VNC and Telnet in a browser tab.",
    about:
      "Brings remote desktops into Termix through a guacd proxy. Clipboard sharing and drive redirection come from the host's own settings, so there is nothing extra to type.",
    icon: "Monitor",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "network:outbound",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["RDP tab", "VNC tab", "Telnet tab", "Host setting"],
    contributions: {
      hostFields: {
        icon: "Monitor",
        label: "Remote desktop",
        enableKey: "enableGuacamole",
        enableLabel: "Open a desktop on this host",
        enableDescription: "Through the guacd proxy set up by your admin.",
        fields: [
          {
            key: "guacProtocol",
            label: "Protocol",
            type: "select",
            value: "rdp",
            options: ["rdp", "vnc", "telnet"],
          },
          {
            key: "guacColorDepth",
            label: "Colour depth",
            type: "select",
            value: "24",
            options: ["8", "16", "24", "32"],
          },
          {
            key: "guacClipboard",
            label: "Share the clipboard",
            type: "switch",
            value: true,
          },
        ],
      },
    },
    downloads: "67k",
    cpu: "2.2%",
    ram: "96 MB",
    repository: "github.com/Termix-SSH/Guacamole",
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
    id: "proxmox",
    name: "Proxmox",
    author: "Termix",
    description: "Nodes, guests and storage from a Proxmox cluster.",
    about:
      "Reads a Proxmox cluster over its API: node load, every VM and container, the storage pools and whether the cluster still has quorum. Guests can be imported as hosts.",
    icon: "HardDrive",
    category: "Infrastructure",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.2.0",
    capabilities: [
      "hosts:read",
      "hosts:write",
      "credentials:use",
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Proxmox tab", "Dashboard card", "Host setting"],
    contributions: {
      hostFields: {
        icon: "HardDrive",
        label: "Proxmox",
        enableKey: "enableProxmox",
        enableLabel: "Read the cluster on this host",
        enableDescription: "Needs an API token with read access.",
        fields: [
          {
            key: "proxmoxTokenId",
            label: "Token ID",
            type: "text",
            placeholder: "termix@pve!readonly",
          },
          {
            key: "proxmoxNode",
            label: "Node name",
            description: "Leave empty to read every node in the cluster.",
            type: "text",
            placeholder: "pve-01",
          },
          {
            key: "proxmoxAutoSync",
            label: "Import guests automatically",
            description: "New VMs and containers become hosts as they appear.",
            type: "switch",
            value: false,
          },
        ],
      },
      dashboardCards: [
        {
          id: "proxmox.guests",
          label: "Proxmox guests",
          icon: "HardDrive",
          kind: "guests",
        },
      ],
    },
    downloads: "49k",
    cpu: "0.8%",
    ram: "58 MB",
    repository: "github.com/Termix-SSH/Proxmox",
    history: [
      {
        version: "1.2.0",
        publishedAt: "2026-09-10",
        notes: "Storage pools, and guest import keeps the notes field.",
      },
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
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
    description: "A console over a USB or serial adapter.",
    about:
      "For a machine with no network yet. Pick the port and the baud rate and it behaves like any other terminal.",
    icon: "Usb",
    category: "Terminal",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["storage:own", "ui:surface"],
    contributes: ["Serial panel"],
    contributions: {
      navItems: [
        { id: "serial", label: "Serial", icon: "Usb", group: "tools" },
      ],
    },
    downloads: "12k",
    cpu: "0.1%",
    ram: "10 MB",
    repository: "github.com/Termix-SSH/Serial",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "local-terminal",
    name: "Local Terminal",
    author: "Termix",
    description: "A shell on the machine Termix is running on.",
    about:
      "Opens your own shell in a tab, so a quick ssh-keygen or scp does not need a second window. Desktop app only.",
    icon: "TerminalSquare",
    category: "Terminal",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["storage:own", "ui:surface"],
    contributes: ["Local terminal tab"],
    downloads: "27k",
    cpu: "0.2%",
    ram: "20 MB",
    repository: "github.com/Termix-SSH/Local-Terminal",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "session-sharing",
    name: "Session Sharing",
    author: "Termix",
    description: "Hand someone a live session over a link.",
    about:
      "Shares a running terminal or desktop with another Termix user, or with anyone holding a link. Read-only or read-write, and the link can be set to expire.",
    icon: "Share2",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "users:read",
      "events:read",
      "network:outbound",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Share dialog", "Guest session view"],
    downloads: "33k",
    cpu: "0.2%",
    ram: "31 MB",
    repository: "github.com/Termix-SSH/Session-Sharing",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "host-sharing",
    name: "Host Sharing",
    author: "Termix",
    description: "Give another user or role access to a host.",
    about:
      "Shares a host or a whole folder with a user or a role, with an expiry and a choice about whose credential is used. Access can be taken back at any time.",
    icon: "Users",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "hosts:write",
      "users:read",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Share dialog", "Host setting"],
    downloads: "41k",
    cpu: "0.1%",
    ram: "19 MB",
    repository: "github.com/Termix-SSH/Host-Sharing",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "session-recording",
    name: "Session Recording",
    author: "Termix",
    description: "Record a desktop session to a file.",
    about:
      "Writes RDP and VNC sessions to disk in a format you can play back later. Separate from Session Logs, which covers terminals.",
    icon: "Video",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["hosts:read", "events:read", "storage:own", "ui:surface"],
    contributes: ["Recording player", "Host setting"],
    downloads: "18k",
    cpu: "0.4%",
    ram: "44 MB",
    repository: "github.com/Termix-SSH/Session-Recording",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "assistant",
    name: "Assistant",
    author: "Termix",
    description: "Ask about a host, and review any command before it runs.",
    about:
      "Answers questions about your hosts and proposes commands. Nothing runs until you approve it, and the model can be one you host yourself.",
    icon: "Sparkles",
    category: "Productivity",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "0.9.2",
    capabilities: [
      "hosts:read",
      "ssh:exec",
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Assistant panel", "Settings panel"],
    contributions: {
      navItems: [
        { id: "ai", label: "Assistant", icon: "Sparkles", group: "tools" },
      ],
      settings: {
        icon: "Sparkles",
        groups: [
          {
            title: "Provider",
            fields: [
              {
                key: "provider",
                label: "Provider",
                type: "select",
                value: "Ollama",
                options: [
                  "Ollama",
                  "Anthropic",
                  "OpenAI",
                  "Google Gemini",
                  "OpenAI compatible",
                ],
              },
              {
                key: "baseUrl",
                label: "Address",
                description: "Where the model is served from.",
                type: "text",
                value: "http://localhost:11434",
              },
              {
                key: "model",
                label: "Model",
                type: "text",
                placeholder: "llama3.1",
              },
            ],
          },
          {
            title: "Behaviour",
            fields: [
              {
                key: "approveCommands",
                label: "Approve every command",
                description:
                  "Nothing runs on a host until you have read it. Turning this off is not recommended.",
                type: "switch",
                value: true,
              },
              {
                key: "readOnlyDiagnostics",
                label: "Allow read-only checks",
                description:
                  "Lets it run df, uptime and the like without asking each time.",
                type: "switch",
                value: false,
              },
            ],
          },
        ],
      },
    },
    downloads: "24k",
    cpu: "0.5%",
    ram: "88 MB",
    repository: "github.com/Termix-SSH/Assistant",
    history: [
      {
        version: "0.9.2",
        publishedAt: "2026-09-08",
        notes: "Mentions can reach snippets and automations.",
      },
      {
        version: "0.9.0",
        publishedAt: "2026-08-28",
        notes: "First preview.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: false,
  },
  {
    id: "fleet-inventory",
    name: "Fleet Inventory",
    author: "Termix",
    description: "Kernel, packages and uptime for every host, in one table.",
    about:
      "Collects what is installed across a fleet and puts it in a table you can sort, so the one box still on an old kernel is obvious.",
    icon: "ListChecks",
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
    downloads: "22k",
    cpu: "0.6%",
    ram: "35 MB",
    repository: "github.com/Termix-SSH/Fleet-Inventory",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
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
    about:
      "Asks Vault to sign a short-lived certificate when you connect, so no long-lived private key sits in Termix at all.",
    icon: "KeyRound",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "network:outbound",
      "storage:secrets",
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
                key: "namespace",
                label: "Namespace",
                description: "Vault Enterprise only. Leave empty otherwise.",
                type: "text",
                placeholder: "admin/team",
              },
            ],
          },
          {
            title: "Certificates",
            fields: [
              {
                key: "role",
                label: "Signing role",
                type: "text",
                value: "termix-users",
              },
              {
                key: "ttl",
                label: "Valid for",
                type: "select",
                value: "8h",
                options: ["1h", "4h", "8h", "24h"],
              },
            ],
          },
        ],
      },
    },
    downloads: "17k",
    cpu: "0.1%",
    ram: "23 MB",
    repository: "github.com/Termix-SSH/Vault",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "sso",
    name: "Single Sign-On",
    author: "Termix",
    description: "Sign in with OIDC, LDAP, GitHub or Google.",
    about:
      "Adds identity providers to the login screen and maps a group from the provider onto the admin role, so joiners and leavers are handled where they already are.",
    icon: "Shield",
    category: "Access & Security",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.1.0",
    capabilities: [
      "users:read",
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Login options", "Settings panel"],
    contributions: {
      settings: {
        icon: "Shield",
        groups: [
          {
            title: "Provider",
            fields: [
              {
                key: "kind",
                label: "Kind",
                type: "select",
                value: "OIDC",
                options: ["OIDC", "LDAP", "GitHub", "Google"],
              },
              {
                key: "issuer",
                label: "Issuer",
                type: "text",
                placeholder: "https://id.example.com",
              },
              {
                key: "clientId",
                label: "Client ID",
                type: "text",
                placeholder: "termix",
              },
            ],
          },
          {
            title: "Access",
            fields: [
              {
                key: "adminGroup",
                label: "Admin group",
                description: "Members of this group become Termix admins.",
                type: "text",
                placeholder: "termix-admins",
              },
              {
                key: "autoProvision",
                label: "Create accounts on first sign-in",
                type: "switch",
                value: true,
              },
              {
                key: "test",
                label: "Test the connection",
                type: "action",
                options: ["Test"],
              },
            ],
          },
        ],
      },
    },
    downloads: "36k",
    cpu: "0.1%",
    ram: "26 MB",
    repository: "github.com/Termix-SSH/SSO",
    history: [
      {
        version: "1.1.0",
        publishedAt: "2026-09-09",
        notes: "More than one provider can be enabled at a time.",
      },
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
  {
    id: "terminal-themes",
    name: "Terminal Themes",
    author: "Termix",
    description: "Twenty-five more terminal colour schemes.",
    about:
      "Adds the usual suspects, from Solarized to Synthwave, plus an editor for building your own from the sixteen ANSI colours.",
    icon: "Sparkles",
    category: "Terminal",
    tier: "store",
    source: "official",
    registry: "termix-official",
    version: "1.0.0",
    capabilities: ["storage:own", "ui:surface"],
    contributes: ["Theme list", "Theme editor"],
    downloads: "63k",
    cpu: "0.0%",
    ram: "6 MB",
    repository: "github.com/Termix-SSH/Terminal-Themes",
    history: [
      {
        version: "1.0.0",
        publishedAt: "2026-09-02",
        notes: "First release.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },

  // ── Community and self-hosted registries ──────────────────────────────────
  {
    id: "samba",
    name: "Samba",
    author: "randomdev101",
    description: "Mount an SMB share and browse it like any other host.",
    about:
      "Adds SMB shares to the file manager. Written by a Termix user, not by us, so read what it asks for before installing it.",
    icon: "FolderTree",
    category: "Files & Transfer",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "0.4.1",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Host setting", "Files source"],
    contributions: {
      hostFields: {
        icon: "FolderTree",
        label: "Samba",
        enableKey: "enableSamba",
        enableLabel: "Mount an SMB share from this host",
        enableDescription: "Shows up as a source in the file manager.",
        fields: [
          {
            key: "shareName",
            label: "Share",
            type: "text",
            placeholder: "media",
          },
          {
            key: "smbVersion",
            label: "Protocol",
            type: "select",
            value: "3.1.1",
            options: ["2.0", "2.1", "3.0", "3.1.1"],
          },
        ],
      },
    },
    downloads: "4.2k",
    cpu: "0.3%",
    ram: "28 MB",
    repository: "github.com/randomdev101/termix-samba",
    history: [
      {
        version: "0.4.1",
        publishedAt: "2026-09-06",
        notes: "Handles shares whose name has a space in it.",
      },
      {
        version: "0.4.0",
        publishedAt: "2026-08-21",
        notes: "First public build.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: false,
  },
  {
    id: "wake-on-lan",
    name: "Wake on LAN",
    author: "randomdev101",
    description: "Send a magic packet to a sleeping host.",
    about:
      "Adds a wake button to hosts that are offline, and can send the packet through another host on the same network.",
    icon: "Power",
    category: "Networking",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "1.0.3",
    capabilities: ["hosts:read", "network:outbound", "ui:surface"],
    contributes: ["Host action", "Host setting"],
    contributions: {
      hostFields: {
        icon: "Power",
        label: "Wake on LAN",
        enableKey: "enableWakeOnLan",
        enableLabel: "Wake this host from the host list",
        enableDescription: "Needs the MAC address of its network card.",
        fields: [
          {
            key: "macAddress",
            label: "MAC address",
            type: "text",
            placeholder: "aa:bb:cc:dd:ee:ff",
          },
        ],
      },
    },
    downloads: "8.7k",
    cpu: "0.0%",
    ram: "5 MB",
    repository: "github.com/randomdev101/termix-wol",
    history: [
      {
        version: "1.0.3",
        publishedAt: "2026-08-30",
        notes: "Broadcast address can be set per host.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: false,
  },
  {
    id: "ansible-runner",
    name: "Ansible Runner",
    author: "hollow-bit",
    description: "Run a playbook against a fleet from inside Termix.",
    about:
      "Points ansible-playbook at a fleet, using the hosts and credentials you already have, and shows the run as it goes.",
    icon: "Rocket",
    category: "Productivity",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "0.6.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Runner panel"],
    downloads: "2.1k",
    cpu: "1.8%",
    ram: "74 MB",
    repository: "github.com/hollow-bit/termix-ansible",
    history: [
      {
        version: "0.6.0",
        publishedAt: "2026-09-04",
        notes: "Reads an inventory from a fleet.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: false,
  },
  {
    id: "netbox-sync",
    name: "NetBox Sync",
    author: "hollow-bit",
    description: "Keep your host list in step with NetBox.",
    about:
      "Pulls devices out of NetBox on a schedule and creates or updates the matching Termix hosts, so the two lists do not drift apart.",
    icon: "RefreshCw",
    category: "Infrastructure",
    tier: "store",
    source: "community",
    registry: "termix-community",
    version: "0.3.2",
    capabilities: [
      "hosts:read",
      "hosts:write",
      "network:outbound",
      "storage:own",
      "storage:secrets",
      "ui:surface",
    ],
    contributes: ["Settings panel"],
    contributions: {
      settings: {
        icon: "RefreshCw",
        groups: [
          {
            title: "Source",
            fields: [
              {
                key: "url",
                label: "NetBox address",
                type: "text",
                placeholder: "https://netbox.example.com",
              },
              {
                key: "token",
                label: "API token",
                description: "Stored encrypted. The plugin never sees the key.",
                type: "text",
                placeholder: "0123456789abcdef",
              },
            ],
          },
          {
            title: "Sync",
            fields: [
              {
                key: "interval",
                label: "Check every",
                type: "select",
                value: "1 hour",
                options: ["15 minutes", "1 hour", "6 hours", "Daily"],
              },
              {
                key: "deleteMissing",
                label: "Remove hosts NetBox has dropped",
                description: "Off by default, because it deletes hosts.",
                type: "switch",
                value: false,
              },
            ],
          },
        ],
      },
    },
    downloads: "1.4k",
    cpu: "0.2%",
    ram: "22 MB",
    repository: "github.com/hollow-bit/termix-netbox",
    history: [
      {
        version: "0.3.2",
        publishedAt: "2026-09-01",
        notes: "Matches on the primary IP when the name differs.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: false,
  },
  {
    id: "deploy",
    name: "Deploy",
    author: "Random Company",
    description: "Ship a build to the boxes that run it.",
    about:
      "Our own release script, wrapped up as a plugin. Pulled from the registry running on the network here, not from the public one.",
    icon: "Rocket",
    category: "Productivity",
    tier: "store",
    source: "local",
    registry: "self-hosted",
    version: "2.4.0",
    capabilities: [
      "hosts:read",
      "credentials:use",
      "ssh:exec",
      "ssh:sftp",
      "storage:own",
      "ui:surface",
    ],
    contributes: ["Deploy panel"],
    downloads: "-",
    cpu: "0.4%",
    ram: "41 MB",
    repository: "git.home.lan/infra/termix-deploy",
    history: [
      {
        version: "2.4.0",
        publishedAt: "2026-09-13",
        notes: "Rolls back when a health check fails.",
      },
    ],
    installed: false,
    state: "disabled",
    autoUpdate: true,
  },
];
