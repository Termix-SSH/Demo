export type ProviderId =
  | "cloudflare"
  | "route53"
  | "digitalocean"
  | "hetzner"
  | "namecheap"
  | "godaddy"
  | "porkbun"
  | "gandi";

export const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
  "PTR",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];

export interface CredentialField {
  key: string;
  type: "text" | "secret" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface ProviderFeatures {
  // Record types the provider accepts
  types: string[];
  proxied: boolean;
  comment: boolean;
  // A ttl of 1 means automatic
  autoTtl: boolean;
  minTtl: number;
  domains: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  fields: CredentialField[];
  features: ProviderFeatures;
}

/** One record. The name is relative to the zone, "@" for the apex. */
export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number | null;
  proxied?: boolean;
  comment?: string;
  // Shown but not changeable here, such as an alias or provider NS
  readOnly?: boolean;
}

export interface RecordInput {
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number | null;
  proxied?: boolean;
  comment?: string;
}

export interface Zone {
  id: string;
  name: string;
  nameservers?: string[];
}

export interface ZoneRef extends Zone {
  accountId: number;
  accountName: string;
  provider: ProviderId;
}

export interface Account {
  id: number;
  provider: ProviderId;
  name: string;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  autoBackup: boolean;
  checkHealth: boolean;
}

export interface AccountInput {
  provider?: ProviderId;
  name: string;
  autoBackup: boolean;
  checkHealth: boolean;
  credentials?: Record<string, string>;
}

export interface DomainInfo {
  name: string;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  locked: boolean | null;
  nameservers: string[];
  status: string | null;
}

export interface DomainRow extends DomainInfo {
  id: number;
  accountId: number | null;
  accountName: string | null;
  // account: from a connected registrar, watch: looked up with RDAP
  source: "account" | "watch";
  checkedAt: string | null;
  daysLeft: number | null;
}

export interface Snapshot {
  id: number;
  accountId: number;
  zoneId: string;
  zoneName: string;
  label: string;
  source: "manual" | "auto" | "before";
  recordCount: number;
  createdAt: string;
}

export type LinkSource = "host" | "public4" | "public6";

export interface Link {
  id: number;
  accountId: number;
  accountName: string;
  zoneId: string;
  zoneName: string;
  name: string;
  type: "A" | "AAAA";
  source: LinkSource;
  hostId: number | null;
  hostName: string | null;
  ttl: number;
  proxied: boolean;
  enabled: boolean;
  lastValue: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface LinkInput {
  accountId: number;
  zoneId: string;
  zoneName: string;
  name: string;
  type: "A" | "AAAA";
  source: LinkSource;
  hostId?: number | null;
  ttl: number;
  proxied: boolean;
  enabled: boolean;
}

export type HealthLevel = "ok" | "info" | "warn" | "fail";

/** A result with a code the UI turns into text. */
export interface HealthCheck {
  code: string;
  level: HealthLevel;
  params?: Record<string, string | number>;
}

export interface HealthReport {
  zoneName: string;
  at: string;
  checks: HealthCheck[];
}

export interface PropagationRow {
  record: string;
  resolver: string;
  answers: string[];
  match: boolean;
  error?: string;
}

export interface DiffEntry {
  kind: "add" | "remove" | "change";
  type: string;
  name: string;
  before?: string;
  after?: string;
}

export interface HostChoice {
  id: number;
  name: string;
  ip: string;
}
