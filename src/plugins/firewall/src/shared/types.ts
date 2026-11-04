/** Types shared by the backend routes and the frontend. */

export const BACKENDS = ["ufw", "firewalld", "nftables", "iptables"] as const;
export type Backend = (typeof BACKENDS)[number];

export const ACTIONS = ["allow", "deny", "reject", "limit"] as const;
export type RuleAction = (typeof ACTIONS)[number];

export const POLICIES = ["allow", "deny", "reject"] as const;
export type Policy = (typeof POLICIES)[number];

export type Direction = "in" | "out";
export type Protocol = "tcp" | "udp" | "any";
export type Family = "any" | "ipv4" | "ipv6";

/** A rule as the user writes it. Empty strings mean any. */
export interface RuleSpec {
  action: RuleAction;
  direction: Direction;
  protocol: Protocol;
  /** "22", "80,443" or "8000-8100". */
  port: string;
  /** An address or a CIDR range. */
  source: string;
  destination: string;
  /** Network interface, like eth0. */
  iface: string;
  family: Family;
  comment: string;
  /** firewalld only: a service name such as http, instead of a port. */
  service?: string;
}

/** A rule read from a host. */
export interface Rule extends RuleSpec {
  /** Stable for the same rule on the same host. */
  id: string;
  /** Termix can edit or delete it. */
  managed: boolean;
  /** Termix can delete it but not edit it. */
  deleteOnly?: boolean;
  readOnlyReason?: string;
  /** The rule as the firewall shows it. */
  raw: string;
  /** firewalld zone. */
  zone?: string;
  /** UFW app profile. */
  app?: string;
  /** UFW numbered position of the rule's first entry. */
  position?: number;
}

export interface Defaults {
  incoming: Policy;
  outgoing: Policy;
  /** UFW only. */
  routed?: Policy;
}

export interface Zone {
  name: string;
  target: string;
  active: boolean;
  isDefault: boolean;
  interfaces: string[];
  sources: string[];
}

export interface FirewallStatus {
  /** The firewall Termix manages here, or null when there is none. */
  backend: Backend | null;
  /** Firewalls found on the host. */
  installed: Backend[];
  active: boolean;
  version: string;
  defaults: Defaults | null;
  rules: Rule[];
  zones: Zone[];
  defaultZone: string;
  /** Rules from other tools that Termix leaves alone (nftables and iptables). */
  otherRules: number;
  /** Rules are saved across reboots. */
  persistent: boolean;
  warnings: string[];
  ssh: { ports: number[]; client: string };
  packageManager: string;
  os: string;
  root: boolean;
  fail2ban: { installed: boolean; running: boolean };
  canEdit: boolean;
  readOnly: boolean;
  sshGuard: boolean;
  pending: PendingChange | null;
}

export interface PendingChange {
  token: string;
  hostId: number;
  /** What changed, for the banner. */
  label: string;
  /** ms since epoch when the host undoes the change by itself. */
  expiresAt: number;
  /** Termix could open a new SSH connection after the change. */
  reachable: boolean | null;
}

/** What a change answers. */
export interface ChangeResult {
  ok: true;
  pending: PendingChange | null;
  output?: string;
}

export interface Jail {
  name: string;
  currentlyFailed: number;
  totalFailed: number;
  currentlyBanned: number;
  totalBanned: number;
  banned: string[];
}

export interface Fail2banStatus {
  installed: boolean;
  running: boolean;
  version: string;
  jails: Jail[];
}

export interface RuleSet {
  id: number;
  name: string;
  description: string;
  rules: RuleSpec[];
  hosts: number[];
  updatedAt: string;
}

export interface DriftResult {
  hostId: number;
  backend: Backend | null;
  active: boolean;
  missing: RuleSpec[];
  error?: string;
}

export interface ApplyResult {
  hostId: number;
  added: number;
  kept: boolean;
  skipped?: boolean;
  error?: string;
  code?: string;
}

export interface HostSummary {
  hostId: number;
  backend: Backend | null;
  active: boolean;
  rules: number;
  banned: number;
  pending: boolean;
  watched: boolean;
  error?: string;
  checkedAt: string;
}
