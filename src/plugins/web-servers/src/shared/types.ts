export type ServerKind = "nginx" | "apache" | "caddy";
export const SERVER_KINDS: ServerKind[] = ["nginx", "apache", "caddy"];

/** Debian style sites-available and sites-enabled, or one conf.d folder. */
export type Layout = "debian" | "confd" | "caddy";

export type ServiceAction =
  "start" | "stop" | "restart" | "reload" | "enable" | "disable";

export interface ServerInfo {
  kind: ServerKind;
  installed: boolean;
  version: string;
  /** systemd or OpenRC service name. */
  unit: string;
  /** "active", "inactive", "failed" and so on, or empty when unknown. */
  state: string;
  /** Starts at boot. */
  boot: boolean;
  layout: Layout;
  /** Everything the raw editor may touch lives under this folder. */
  root: string;
  mainFile: string;
  /** Where site files live. */
  siteDir: string;
  /** Debian layout only: where the enabled links live. */
  enabledDir: string;
  logDir: string;
}

export interface WebStatus {
  os: string;
  root: boolean;
  systemd: boolean;
  manager: string;
  /** certbot version, or empty. */
  certbot: string;
  certbotNginx: boolean;
  certbotApache: boolean;
  servers: ServerInfo[];
  /** php-fpm sockets found on the host, for PHP sites. */
  phpSockets: string[];
  watching: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

export type SiteType = "static" | "proxy" | "php" | "redirect";

/** What the site form edits. Termix keeps it in a comment in the file. */
export interface SiteSpec {
  type: SiteType;
  names: string[];
  port: number;
  root: string;
  index: string;
  /** Static sites: send unknown paths to /index.html. */
  spa: boolean;
  upstream: string;
  websockets: boolean;
  redirectTo: string;
  /** Keep the path when redirecting. */
  keepPath: boolean;
  phpSocket: string;
  https: boolean;
  httpsPort: number;
  certPath: string;
  keyPath: string;
  /** Send plain HTTP to HTTPS. */
  forceHttps: boolean;
  gzip: boolean;
  /** Largest upload in MB, 0 for the server default. */
  maxBodyMb: number;
  accessLog: boolean;
}

export interface Site {
  /** "nginx:example" */
  key: string;
  server: ServerKind;
  /** File name without .conf, .caddy or .disabled. */
  name: string;
  file: string;
  enabled: boolean;
  names: string[];
  listen: string[];
  root: string;
  upstream: string;
  tls: boolean;
  certPath: string;
  /** ISO time the certificate ends, or empty. */
  certExpiry: string;
  certDaysLeft: number | null;
  accessLog: string;
  errorLog: string;
  /** Made with the site form, so it can be edited there again. */
  spec: SiteSpec | null;
}

export interface ConfigFile {
  path: string;
  size: number;
  /** A link, like a file in sites-enabled. */
  link: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  backups: Backup[];
}

export interface Backup {
  id: string;
  /** ISO time. */
  at: string;
  size: number;
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export interface TestResult {
  ok: boolean;
  output: string;
}

export type LogSource =
  { kind: "file"; path: string } | { kind: "journal"; server: ServerKind };

export interface LogFile {
  path: string;
  size: number;
}

export interface LogStats {
  lines: number;
  status: Record<"2xx" | "3xx" | "4xx" | "5xx" | "other", number>;
  paths: Array<{ value: string; count: number }>;
  clients: Array<{ value: string; count: number }>;
}

export interface LogResult {
  lines: string[];
  stats: LogStats | null;
}

export interface SiteBody {
  server: ServerKind;
  name: string;
  spec: SiteSpec;
}

export interface TlsBody {
  email?: string;
  staging?: boolean;
}

export interface HostSummary {
  hostId: number;
  servers: Array<{
    kind: ServerKind;
    version: string;
    state: string;
    sites: number;
  }>;
  error?: string;
  checkedAt: string;
}
