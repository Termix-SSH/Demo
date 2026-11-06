export type Health = "ok" | "warn" | "fail" | "unknown";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type VulnSeverity = "critical" | "high" | "medium" | "low" | "unknown";

export type KeyKind = "authorized" | "host" | "private";

/** One SSH key found on a host. */
export interface KeyEntry {
  id: string;
  kind: KeyKind;
  /** Account that owns the file. */
  user: string;
  path: string;
  /** Key algorithm token, like ssh-ed25519. */
  type: string;
  bits: number | null;
  /** SHA256:... as ssh-keygen prints it. */
  fingerprint: string;
  comment: string;
  /** Options in front of an authorized key, like from= or command=. */
  options: string;
  restricted: boolean;
  /** Octal file mode of the file the key lives in, like 600. */
  mode: string;
  /** Last change of the file, seconds since 1970. */
  mtime: number | null;
  /** Private keys only: true when no passphrase protects the file. */
  unprotected: boolean;
  /** Matches a login Termix knows about. */
  known: boolean;
  /** Name of the Termix credential or host login this key matches. */
  knownAs: string;
}

export interface Reading {
  at: number;
  root: boolean;
  os: { id: string; version: string; name: string };
  sshdVersion: string;
  sshd: Record<string, string>;
  sshdRead: boolean;
  keys: KeyEntry[];
  rebootRequired: boolean;
  /** Mode and owner problems on ~/.ssh folders. */
  notes: string[];
}

export interface Finding {
  /** kind|subject, stable across reads. */
  key: string;
  kind: string;
  subject: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface Vuln {
  /** The advisory id, like DSA-5678-1 or CVE-2024-1234. */
  id: string;
  /** CVE ids for the advisory. */
  cves: string[];
  package: string;
  version: string;
  fixed: string;
  severity: VulnSeverity;
  score: number | null;
  kev: boolean;
  summary: string;
  ignored: boolean;
  ignoreNote: string;
}

export interface VulnScan {
  at: number;
  ecosystem: string;
  packages: number;
  vulns: Vuln[];
  /** Advisories whose details are not fetched yet. */
  pending: number;
  unsupported: string;
  error: string;
  kevChecked: boolean;
}

export interface HostConfig {
  hostId: number;
  alerts: boolean;
  intervalMin: number;
  vulnIntervalH: number;
  minRsaBits: number;
  keyMaxAgeDays: number;
}

export interface SecurityEvent {
  id: number;
  hostId: number;
  at: number;
  type: string;
  text: string;
}

export interface HostSummary {
  hostId: number;
  label: string;
  status: Health;
  score: number | null;
  findings: number;
  critical: number;
  kev: number;
  keys: number;
  error: string;
}

export interface IgnoreRule {
  id: number;
  hostId: number;
  advisory: string;
  note: string;
  at: number;
}
