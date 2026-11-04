import { BlockList, isIP } from "node:net";
import type { Backend, Rule, RuleSpec } from "../shared/types.js";
import type { Change, HostState, Snapshot } from "./backends/types.js";
import { portsCover } from "./validate.js";

type Match = "yes" | "no";

function inRange(client: string, range: string): boolean {
  const [ip, prefix] = range.split("/");
  const type = isIP(ip) === 6 ? "ipv6" : "ipv4";
  const clientType = isIP(client) === 6 ? "ipv6" : "ipv4";
  if (!isIP(ip) || !isIP(client) || type !== clientType) return false;
  const list = new BlockList();
  if (prefix === undefined) list.addAddress(ip, type);
  else list.addSubnet(ip, Number(prefix), type);
  return list.check(client, type);
}

/**
 * Whether a rule applies to a new SSH connection from the client. When
 * Termix can't tell (no client address, an interface name), a block counts
 * as a match and an allow does not, so the check errs on the safe side.
 */
function matches(rule: Rule, port: number, client: string): Match {
  const blocking = rule.action === "deny" || rule.action === "reject";
  const unsure: Match = blocking ? "yes" : "no";
  if (rule.direction !== "in" || rule.protocol === "udp") return "no";
  // A firewalld rich rule Termix could not fully read.
  if (rule.zone && rule.deleteOnly) return unsure;
  if (rule.service) {
    const ports = rule.port || (rule.service === "ssh" ? "22" : "");
    if (!ports || !portsCover(ports, port)) return "no";
  } else if (rule.app) {
    if (!rule.port) return unsure;
    if (!portsCover(rule.port, port)) return "no";
  } else if (!portsCover(rule.port, port)) {
    return "no";
  }
  const clientFamily =
    isIP(client) === 6 ? "ipv6" : isIP(client) === 4 ? "ipv4" : "";
  if (rule.family !== "any" && clientFamily && rule.family !== clientFamily)
    return "no";
  if (rule.source) {
    if (!clientFamily) return unsure;
    if (!inRange(client, rule.source)) return "no";
  }
  if (rule.iface || rule.destination) return unsure;
  return "yes";
}

export interface Reach {
  allowed: boolean;
  reason: string;
}

/** Whether a new SSH connection from the client to `port` gets through. */
export function sshReach(
  backend: Backend | null,
  snap: Snapshot,
  port: number,
  client: string,
): Reach {
  if (!backend || !snap.active) return { allowed: true, reason: "" };
  if (backend === "firewalld") {
    const zone =
      snap.zones.find((z) =>
        z.sources.some((s) => client && inRange(client, s)),
      )?.name ?? snap.defaultZone;
    const rules = snap.rules.filter(
      (r) => (r.zone ?? snap.defaultZone) === zone,
    );
    const blocker = rules.find(
      (r) =>
        (r.action === "deny" || r.action === "reject") &&
        matches(r, port, client) === "yes",
    );
    if (blocker)
      return {
        allowed: false,
        reason: `A ${blocker.action} rule in zone ${zone} blocks port ${port}`,
      };
    if (
      rules.some(
        (r) =>
          (r.action === "allow" || r.action === "limit") &&
          matches(r, port, client) === "yes",
      )
    ) {
      return { allowed: true, reason: "" };
    }
    const target = snap.zones.find((z) => z.name === zone)?.target ?? "default";
    if (target === "ACCEPT") return { allowed: true, reason: "" };
    return {
      allowed: false,
      reason: `Zone ${zone} has no rule that allows port ${port}`,
    };
  }
  for (const rule of snap.rules) {
    if (matches(rule, port, client) !== "yes") continue;
    if (rule.action === "allow" || rule.action === "limit")
      return { allowed: true, reason: "" };
    return {
      allowed: false,
      reason: `A ${rule.action} rule blocks port ${port}`,
    };
  }
  if ((snap.defaults?.incoming ?? "allow") === "allow")
    return { allowed: true, reason: "" };
  return {
    allowed: false,
    reason: `Incoming traffic is ${snap.defaults?.incoming} by default and no rule allows port ${port}`,
  };
}

/** The reason a change would cut off SSH, or empty when it would not. */
export function lockoutReason(
  state: HostState,
  after: Snapshot,
  before: Snapshot,
): string {
  for (const port of state.ssh.ports) {
    const was = sshReach(state.backend, before, port, state.ssh.client);
    if (!was.allowed) continue;
    const now = sshReach(state.backend, after, port, state.ssh.client);
    if (!now.allowed) return now.reason;
  }
  return "";
}

function touchesSsh(
  spec: RuleSpec | Rule | undefined,
  ports: number[],
): boolean {
  if (!spec || spec.direction !== "in" || spec.protocol === "udp") return false;
  if (spec.service)
    return (
      spec.service === "ssh" ||
      ports.some((p) => portsCover(spec.port, p) && !!spec.port)
    );
  return ports.some((p) => portsCover(spec.port, p));
}

/** Changes that could cut off Termix get a timer that undoes them. */
export function isRisky(state: HostState, change: Change): boolean {
  const ports = state.ssh.ports.length ? state.ssh.ports : [22];
  switch (change.kind) {
    case "enable":
    case "addMany":
    case "zoneTarget":
    case "defaultZone":
      return true;
    case "defaults":
      return (
        (!!change.defaults.incoming && change.defaults.incoming !== "allow") ||
        (!!change.defaults.outgoing && change.defaults.outgoing !== "allow")
      );
    case "disable":
      return false;
    case "add":
      return touchesSsh(change.spec, ports);
    case "update":
      return (
        touchesSsh(change.spec, ports) ||
        touchesSsh(
          state.rules.find((r) => r.id === change.id),
          ports,
        )
      );
    case "remove":
      return touchesSsh(
        state.rules.find((r) => r.id === change.id),
        ports,
      );
  }
}
