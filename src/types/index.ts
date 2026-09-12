// Subset of Termix's src/types/index.ts that the demo UI actually needs.
// Kept under the same module path so copied files import it unchanged.

import type { StatsConfig } from "./stats-widgets";
import type { GuacamoleConfig } from "./guacamole-config";

export interface TerminalConfig {
  localEcho?: "default" | "off" | "auto" | "on";
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
  macOptionIsMeta: boolean;
  fastScrollModifier: "alt" | "ctrl" | "shift";
  fastScrollSensitivity: number;
  minimumContrastRatio: number;

  backspaceMode: "normal" | "control-h";
  agentForwarding: boolean;
  environmentVariables: Array<{ key: string; value: string }>;
  startupSnippetId: number | null;
  autoMosh: boolean;
  moshCommand: string;
  sudoPasswordAutoFill: boolean;
  sudoPassword?: string | null;
  keepaliveInterval?: number;
  keepaliveCountMax?: number;
  autoTmux: boolean;
  syntaxHighlighting: boolean;
  syntaxHighlightingOptions?: {
    logLevels: boolean;
    paths: boolean;
    timestamps: boolean;
    ipAddresses: boolean;
    urls: boolean;
    numbers: boolean;
  };
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  allowLegacyAlgorithms?: boolean;
  linkClickBehavior?: "confirm" | "direct";
  useSSHTitle?: boolean;
  agentSocketPath?: string;
  agentIdentity?: string;
  customThemeColors?: {
    background: string;
    foreground: string;
    cursor?: string;
    cursorAccent?: string;
    selectionBackground?: string;
    selectionForeground?: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export interface FileItem {
  name: string;
  path: string;
  isPinned?: boolean;
  type: "file" | "directory" | "link";
  sshSessionId?: string;
  size?: number;
  modified?: string;
  modifiedTimestamp?: number;
  permissions?: string;
  owner?: string;
  group?: string;
  linkTarget?: string;
  executable?: boolean;
}

export interface ShortcutItem {
  name: string;
  path: string;
}

export interface FileManagerFile {
  name: string;
  path: string;
  type?: "file" | "directory";
  isSSH?: boolean;
  sshSessionId?: string;
}

export interface FileManagerShortcut {
  name: string;
  path: string;
}

export interface TunnelConnection {
  scope?: TunnelScope;
  mode?: TunnelMode;
  tunnelType?: "local" | "remote";
  bindHost?: string;
  sourceHostId?: number;
  sourceHostSyncId?: string;
  sourceHostName?: string;
  sourcePort: number;
  endpointPort: number;
  endpointHost?: string;
  targetHost?: string;

  endpointPassword?: string;
  endpointKey?: string;
  endpointKeyPassword?: string;
  endpointAuthType?: string;
  endpointKeyType?: string;

  maxRetries: number;
  retryInterval: number;
  autoStart: boolean;
}

export interface TunnelConfig {
  name: string;
  scope?: TunnelScope;
  mode?: TunnelMode;
  tunnelType?: "local" | "remote";
  bindHost?: string;
  targetHost?: string;

  sourceHostId: number;
  sourceHostSyncId?: string;
  tunnelIndex: number;

  requestingUserId?: string;

  hostName: string;
  sourceIP: string;
  sourceSSHPort: number;
  sourceUsername: string;
  sourcePassword?: string;
  sourceAuthMethod: string;
  sourceSSHKey?: string;
  sourceKeyPassword?: string;
  sourceKeyType?: string;
  sourceCredentialId?: number;
  sourceUserId?: string;
  endpointIP: string;
  endpointSSHPort: number;
  endpointUsername: string;
  endpointHost: string;
  endpointPassword?: string;
  endpointAuthMethod: string;
  endpointSSHKey?: string;
  endpointKeyPassword?: string;
  endpointKeyType?: string;
  endpointCredentialId?: number;
  endpointUserId?: string;
  sourcePort: number;
  endpointPort: number;
  maxRetries: number;
  retryInterval: number;
  autoStart: boolean;
  isPinned: boolean;

  useSocks5?: boolean;
  socks5Host?: string;
  socks5Port?: number;
  socks5Username?: string;
  socks5Password?: string;
  socks5ProxyChain?: ProxyNode[];

  keepaliveInterval?: number;
  keepaliveCountMax?: number;
}

export interface TunnelStatus {
  connected: boolean;
  status: ConnectionState;
  retryCount?: number;
  maxRetries?: number;
  nextRetryIn?: number;
  reason?: string;
  errorType?: ErrorType;
  manualDisconnect?: boolean;
  retryExhausted?: boolean;
  connectionLogs?: Array<{
    type: "info" | "success" | "warning" | "error";
    stage: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
}

export interface ProxyNode {
  host: string;
  port: number;
  /**
   * The host editor writes "socks4"/"socks5"/"http", while proxy-helper.ts
   * tests for "http" and casts everything else to 4|5 before handing it to the
   * socks client. The two spellings have never agreed; typed as the union of
   * what is actually stored rather than pretending one side is right.
   */
  type: 4 | 5 | "http" | "socks4" | "socks5";
  username?: string;
  password?: string;
}

export interface SSHFolder {
  id: number;
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  credentialId?: number | null;
  sortOrder?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface HostFeatureFlags {
  enableTerminal: boolean; // SSH, Telnet only
  enableTunnel: boolean; // SSH only
  enableFileManager: boolean; // SSH only
  enableDocker: boolean; // SSH only
  enableTmuxMonitor: boolean; // SSH only
  enableTerminalToolbar: boolean; // SSH, RDP, VNC, and Telnet
  enableRemoteDesktop: boolean; // RDP, VNC only
}

export type ConnectionState =
  (typeof CONNECTION_STATES)[keyof typeof CONNECTION_STATES];

export type ErrorType =
  | "CONNECTION_FAILED"
  | "AUTHENTICATION_FAILED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface TermixAlert {
  id: string;
  title: string;
  message: string;
  expiresAt: string;
  priority?: "low" | "medium" | "high" | "critical";
  type?: "info" | "warning" | "error" | "success";
  actionUrl?: string;
  actionText?: string;
}

export interface HostInfo {
  id: number;
  name?: string;
  ip: string;
  port: number;
  createdAt: string;
}

export interface JumpHost {
  hostId: number;
}

export interface QuickAction {
  name: string;
  snippetId: number;
}

export type TunnelScope = "s2s" | "c2s";

export type TunnelMode = "local" | "remote" | "dynamic";

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  status?: number;
}

export const CONNECTION_STATES = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  VERIFYING: "verifying",
  FAILED: "failed",
  UNSTABLE: "unstable",
  RETRYING: "retrying",
  WAITING: "waiting",
  DISCONNECTING: "disconnecting",
} as const;

export interface HostData {
  name?: string;
  ip: string;
  port: number;
  username: string;
  folder?: string;
  /** Sub-host nesting: mutually exclusive with folder. */
  parentHostId?: number | string | null;
  tags?: string[];
  pin?: boolean;
  authType:
    | "password"
    | "key"
    | "credential"
    | "none"
    | "opkssh"
    | "stepca"
    | "tailscale"
    | "agent"
    | "vault";
  useWarpgate?: boolean;
  shareSshAuth?: boolean;
  password?: string;
  key?: File | string | null;
  keyPassword?: string;
  keyType?: string;
  sudoPassword?: string;
  credentialId?: number | null;
  vaultProfileId?: number | null;
  connectionOrigin?: "local" | "remote" | null;
  overrideCredentialUsername?: boolean;
  enableTerminal?: boolean;
  enableSessionLogging?: boolean;
  enableCommandHistory?: boolean;
  enableTunnel?: boolean;
  enableFileManager?: boolean;
  scpLegacy?: boolean;
  enableDocker?: boolean;
  enableProxmox?: boolean;
  enableTmuxMonitor?: boolean;
  enableTerminalToolbar?: boolean;
  allowSessionSharing?: boolean;
  proxmoxConfig?: ProxmoxConfig | Record<string, unknown> | null;
  enableProxmoxStats?: boolean;
  proxmoxStatsConfig?: ProxmoxStatsConfig | Record<string, unknown> | null;
  showTerminalInSidebar?: boolean;
  showFileManagerInSidebar?: boolean;
  showTunnelInSidebar?: boolean;
  showDockerInSidebar?: boolean;
  showServerStatsInSidebar?: boolean;
  defaultPath?: string;
  forceKeyboardInteractive?: boolean;
  tunnelConnections?: TunnelConnection[];
  jumpHosts?: JumpHostData[];
  quickActions?: QuickActionData[];
  statsConfig?: string | StatsConfig;
  terminalConfig?: Partial<TerminalConfig>;
  notes?: string;

  useSocks5?: boolean;
  socks5Host?: string;
  socks5Port?: number;
  socks5Username?: string;
  socks5Password?: string;
  socks5ProxyChain?: ProxyNode[];

  macAddress?: string;
  wolBroadcastAddress?: string;
  portKnockSequence?: Array<{
    port: number;
    protocol?: "tcp" | "udp";
    delay?: number;
  }>;

  connectionType?: "ssh" | "rdp" | "vnc" | "telnet";
  domain?: string;
  security?: string;
  ignoreCert?: boolean;
  guacamoleConfig?: GuacamoleConfig | null;
  dockerConfig?: Record<string, unknown> | null;

  enableSsh?: boolean;
  enableRdp?: boolean;
  enableVnc?: boolean;
  enableTelnet?: boolean;
  sshPort?: number;
  rdpPort?: number;
  vncPort?: number;
  telnetPort?: number;
  rdpCredentialId?: number | null;
  rdpUser?: string;
  rdpPassword?: string;
  rdpDomain?: string;
  rdpSecurity?: string;
  rdpIgnoreCert?: boolean;
  vncCredentialId?: number | null;
  vncPassword?: string;
  vncUser?: string;
  telnetUser?: string;
  telnetPassword?: string;
  telnetCredentialId?: number | null;
  rdpAuthType?: "direct" | "credential" | "none" | null;
  vncAuthType?: "direct" | "credential" | null;
  telnetAuthType?: "direct" | "credential" | null;
}

export interface JumpHostData {
  hostId: number;
}

export interface QuickActionData {
  name: string;
  snippetId: number;
}

export interface ProxmoxStatsConfig {
  nodeName?: string | null;
  pollInterval?: number;
  enabledCards?: string[];
}

export interface ProxmoxConfig {
  defaultCredentialId: number | null;
  defaultAuthType?: string;
  windowsPatterns: string;
  dockerPatterns: string;
  preferredPrefixes: string;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
  markMissingGuests?: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error";
  lastSyncError?: string | null;
  lastSyncResult?: {
    created: number;
    updated: number;
    markedMissing: number;
    skipped: number;
    errors: string[];
  };
}

export type SSHHostData = HostData;

/** Re-exported so copied files importing them from "@/types" still resolve. */
export type { StatsConfig, GuacamoleConfig };
