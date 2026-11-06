export const MONITOR_TYPES = [
  "http",
  "tcp",
  "ping",
  "dns",
  "tls",
  "push",
  "host",
  "docker",
  "systemd",
  "command",
] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

/** Types that can run from a chosen host instead of the Termix server. */
export const REMOTE_TYPES: readonly MonitorType[] = [
  "http",
  "tcp",
  "ping",
  "dns",
  "tls",
];

/** Types that always log in to a host over SSH. */
export const SSH_TYPES: readonly MonitorType[] = [
  "docker",
  "systemd",
  "command",
];

export const DNS_RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "NS",
  "TXT",
  "SRV",
] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type AuthType = "none" | "basic" | "bearer";

export type MonitorStatus =
  "up" | "down" | "pending" | "maintenance" | "paused" | "unknown";

export type AccessLevel = "owner" | "edit" | "view";

/** The settings of a monitor that are safe to show to people it is shared with. */
export interface MonitorConfig {
  url?: string;
  method?: HttpMethod;
  body?: string;
  acceptedStatus?: string;
  keyword?: string;
  keywordAbsent?: boolean;
  ignoreTls?: boolean;
  followRedirects?: boolean;
  authType?: AuthType;
  username?: string;
  target?: string;
  port?: number;
  recordType?: DnsRecordType;
  dnsServer?: string;
  expected?: string;
  certWarnDays?: number;
  graceSec?: number;
  container?: string;
  unit?: string;
  command?: string;
}

/** Sealed at rest and never sent back to a browser. */
export interface MonitorSecrets {
  password?: string;
  token?: string;
  headers?: Record<string, string>;
}

export interface CertInfo {
  daysLeft: number;
  validTo: string;
  issuer: string;
}

export interface MonitorInput {
  name: string;
  type: MonitorType;
  groupName?: string;
  tags?: string[];
  config: MonitorConfig;
  /** Left out keeps what is stored. */
  secrets?: MonitorSecrets;
  hostId?: number | null;
  fromHostId?: number | null;
  intervalSec?: number;
  retries?: number;
  retryIntervalSec?: number;
  timeoutSec?: number;
  resendMinutes?: number;
  enabled?: boolean;
}

export interface UptimeNumbers {
  day: number | null;
  week: number | null;
  month: number | null;
  quarter: number | null;
}

export interface MonitorView {
  id: number;
  key: string;
  name: string;
  type: MonitorType;
  groupName: string;
  tags: string[];
  config: MonitorConfig;
  hasSecrets: boolean;
  hostId: number | null;
  fromHostId: number | null;
  intervalSec: number;
  retries: number;
  retryIntervalSec: number;
  timeoutSec: number;
  resendMinutes: number;
  enabled: boolean;
  access: AccessLevel;
  owner: boolean;
  status: MonitorStatus;
  statusSince: number | null;
  lastCheckAt: number | null;
  latencyMs: number | null;
  message: string;
  cert: CertInfo | null;
  uptime: UptimeNumbers;
  /** Newest last, as `status` letters and latency. */
  beats: BeatView[];
  watching: boolean;
  /** Set once on create and on a new token. */
  pushUrl?: string;
}

/** t is seconds, s is the status. */
export interface BeatView {
  t: number;
  s: MonitorStatus;
  ms: number | null;
}

export interface HistoryPoint {
  t: number;
  up: number;
  down: number;
  ms: number | null;
  min: number | null;
  max: number | null;
}

export type HistoryRange = "day" | "week" | "month" | "quarter";

export interface IncidentView {
  id: number;
  monitorId: number;
  monitorName: string;
  startedAt: number;
  endedAt: number | null;
  cause: string;
  ackBy: string | null;
  ackAt: number | null;
  note: string;
}

export interface CheckResult {
  ok: boolean;
  latencyMs: number | null;
  message: string;
  cert?: CertInfo;
}

export interface MaintenanceInput {
  name: string;
  scope: "all" | "monitors" | "tag";
  monitorKeys?: string[];
  tag?: string;
  kind: "once" | "weekly";
  startsAt?: number;
  endsAt?: number;
  /** 0 is Sunday. */
  days?: number[];
  startMinute?: number;
  durationMinutes?: number;
  timezone?: string;
  enabled?: boolean;
}

export interface MaintenanceView extends MaintenanceInput {
  id: number;
  monitorKeys: string[];
  active: boolean;
}

export interface StatusGroup {
  name: string;
  monitorKeys: string[];
}

export interface StatusPageInput {
  slug: string;
  title: string;
  description?: string;
  published?: boolean;
  showLatency?: boolean;
  groups: StatusGroup[];
}

export interface StatusPageView extends StatusPageInput {
  id: number;
  description: string;
  published: boolean;
  showLatency: boolean;
  url: string;
}

export type NoteLevel = "info" | "warning" | "critical";

export interface StatusNoteView {
  id: number;
  title: string;
  body: string;
  level: NoteLevel;
  createdAt: number;
  resolvedAt: number | null;
}

export interface ShareGrant {
  id?: number;
  userId?: string | null;
  roleId?: number | null;
  level: "view" | "edit";
  name?: string;
}

export interface UptimeSummary {
  total: number;
  up: number;
  down: number;
  pending: number;
  paused: number;
  maintenance: number;
  uptimeMonth: number | null;
}

/** The public view of a status page. Never holds a target or an error text. */
export interface PublicMonitor {
  name: string;
  status: "up" | "down" | "maintenance" | "unknown";
  uptime: number | null;
  latencyMs?: number | null;
  /** Oldest first, one per day, percent or null with no data. */
  days: Array<number | null>;
}

export interface PublicGroup {
  name: string;
  monitors: PublicMonitor[];
}

export interface PublicNote {
  title: string;
  body: string;
  level: NoteLevel;
  createdAt: number;
  resolvedAt: number | null;
}

export interface PublicPage {
  title: string;
  description: string;
  overall: "operational" | "degraded" | "outage" | "maintenance" | "unknown";
  updatedAt: number;
  groups: PublicGroup[];
  notes: PublicNote[];
}

export const STATUS_LETTERS: Record<MonitorStatus, number> = {
  unknown: 0,
  up: 1,
  down: 2,
  pending: 3,
  maintenance: 4,
  paused: 5,
};

export const STATUS_NAMES: MonitorStatus[] = [
  "unknown",
  "up",
  "down",
  "pending",
  "maintenance",
  "paused",
];

/** "200-299,301" into ranges. Null when it can't be read. */
export function parseStatusRanges(
  value: string,
): Array<[number, number]> | null {
  const ranges: Array<[number, number]> = [];
  for (const piece of value.split(",")) {
    const match = /^\s*(\d{3})(?:\s*-\s*(\d{3}))?\s*$/.exec(piece);
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2] ?? match[1]);
    if (low > high || low < 100 || high > 599) return null;
    ranges.push([low, high]);
  }
  return ranges.length ? ranges : null;
}

export function statusAccepted(
  code: number,
  ranges: Array<[number, number]>,
): boolean {
  return ranges.some(([low, high]) => code >= low && code <= high);
}
