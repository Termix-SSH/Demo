import type {
  Backend,
  Defaults,
  Rule,
  RuleSpec,
  Zone,
} from "../../shared/types.js";

/** Output of the read script, split by its `@@name@@` markers. */
export type Sections = Record<string, string>;

/** The managed rules file Termix keeps on nftables and iptables hosts. */
export interface ManagedRule extends RuleSpec {
  id: string;
}

export interface ManagedDoc {
  version: 1;
  backend: "nftables" | "iptables";
  enabled: boolean;
  defaults: { incoming: Defaults["incoming"]; outgoing: Defaults["outgoing"] };
  rules: ManagedRule[];
}

/** Everything read from a host in one go. */
export interface HostState {
  backend: Backend | null;
  installed: Backend[];
  active: boolean;
  version: string;
  defaults: Defaults | null;
  rules: Rule[];
  zones: Zone[];
  defaultZone: string;
  otherRules: number;
  persistent: boolean;
  warnings: string[];
  ssh: { ports: number[]; client: string };
  packageManager: string;
  os: string;
  root: boolean;
  fail2ban: { installed: boolean; running: boolean };
  /** Rollback folders still waiting on the host. */
  pendingTokens: string[];
  hasSystemd: boolean;
  /** nftables and iptables only. */
  managed?: ManagedDoc;
}

/** What the guard needs to know about a firewall. */
export interface Snapshot {
  active: boolean;
  defaults: Defaults | null;
  rules: Rule[];
  zones: Zone[];
  defaultZone: string;
}

export type Change =
  | { kind: "add"; spec: RuleSpec; zone?: string }
  | { kind: "addMany"; specs: RuleSpec[]; zone?: string }
  | { kind: "update"; id: string; spec: RuleSpec }
  | { kind: "remove"; id: string }
  | { kind: "defaults"; defaults: Partial<Defaults> }
  | { kind: "enable"; allowSsh: boolean }
  | { kind: "disable" }
  | { kind: "zoneTarget"; zone: string; target: string }
  | { kind: "defaultZone"; zone: string };

export interface Plan {
  /** Runs the change on the host. */
  script: string;
  /** The firewall after the change, for the lockout check. */
  after: Snapshot;
  /** Nothing to do. */
  noop?: boolean;
}

export interface BackendModule {
  /** Plans a change against what was just read. Throws FirewallError on bad input. */
  plan: (state: HostState, change: Change) => Plan;
  /** Copies the config into $DIR. */
  backup: string;
  /** Puts the config back from $DIR. */
  restore: string;
  /** Prints the firewall's own view of its rules. */
  raw: string;
}

export function snapshotOf(state: HostState): Snapshot {
  return {
    active: state.active,
    defaults: state.defaults,
    rules: state.rules,
    zones: state.zones,
    defaultZone: state.defaultZone,
  };
}
