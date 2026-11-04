import { isIP } from "node:net";
import {
  ACTIONS,
  POLICIES,
  type Family,
  type Policy,
  type RuleAction,
  type RuleSpec,
} from "../shared/types.js";
import { FirewallError } from "./errors.js";

const IFACE_RE = /^[A-Za-z0-9_.:@-]{1,15}$/;
const SERVICE_RE = /^[a-z0-9][a-z0-9_.+-]{0,63}$/;
const ZONE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const JAIL_RE = /^[A-Za-z0-9_.-]{1,64}$/;
// Kept out of comments: quotes, backslashes, and anything not printable.
const COMMENT_BAD_RE = /["'\\`$\u0000-\u001f\u007f]/;

/** The most separate ports one rule can hold (iptables multiport counts a range as two). */
export const MAX_PORT_SLOTS = 15;

export interface PortPart {
  from: number;
  to: number;
}

function portNumber(text: string): number {
  if (!/^\d{1,5}$/.test(text)) throw new FirewallError(`Bad port: ${text}`);
  const n = Number(text);
  if (n < 1 || n > 65535) throw new FirewallError(`Bad port: ${text}`);
  return n;
}

/** Parses "22", "80,443" or "8000-8100" (a colon works for ranges too). */
export function parsePorts(value: string): PortPart[] {
  const text = value.trim();
  if (!text) return [];
  const parts = text.split(",").map((part) => part.trim());
  const out: PortPart[] = [];
  let slots = 0;
  for (const part of parts) {
    const range = part.split(/[-:]/);
    if (range.length === 1) {
      const n = portNumber(range[0]);
      out.push({ from: n, to: n });
      slots += 1;
    } else if (range.length === 2) {
      const from = portNumber(range[0]);
      const to = portNumber(range[1]);
      if (to <= from) throw new FirewallError(`Bad port range: ${part}`);
      out.push({ from, to });
      slots += 2;
    } else {
      throw new FirewallError(`Bad port: ${part}`);
    }
  }
  if (slots > MAX_PORT_SLOTS) {
    throw new FirewallError(
      "A rule can hold up to 15 ports (a range counts as two)",
    );
  }
  return out;
}

/** The canonical text for ports: sorted, ranges with a dash. */
export function formatPorts(parts: PortPart[]): string {
  return [...parts]
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((p) => (p.from === p.to ? String(p.from) : `${p.from}-${p.to}`))
    .join(",");
}

export function normalizePorts(value: string): string {
  return formatPorts(parsePorts(value));
}

/** True when a port list covers `port`. An empty list covers every port. */
export function portsCover(value: string, port: number): boolean {
  const parts = parsePortsLoose(value);
  if (parts === null) return false;
  if (parts.length === 0) return true;
  return parts.some((p) => port >= p.from && port <= p.to);
}

function parsePortsLoose(value: string): PortPart[] | null {
  try {
    return parsePorts(value);
  } catch {
    return null;
  }
}

/** An address or CIDR range, or empty. Returns the canonical text. */
export function parseAddress(value: unknown, label = "address"): string {
  const text = String(value ?? "").trim();
  if (!text || text === "any" || text === "Anywhere") return "";
  const [ip, prefix, extra] = text.split("/");
  const version = isIP(ip);
  if (!version || extra !== undefined) {
    throw new FirewallError(`Bad ${label}: ${text}`);
  }
  if (prefix !== undefined) {
    if (
      !/^\d{1,3}$/.test(prefix) ||
      Number(prefix) > (version === 4 ? 32 : 128)
    ) {
      throw new FirewallError(`Bad ${label}: ${text}`);
    }
  }
  return prefix === undefined
    ? ip.toLowerCase()
    : `${ip.toLowerCase()}/${Number(prefix)}`;
}

/** ipv4, ipv6 or any for an address. */
export function familyOf(address: string): Family {
  if (!address) return "any";
  return address.includes(":") ? "ipv6" : "ipv4";
}

export function requireIface(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!IFACE_RE.test(text)) throw new FirewallError(`Bad interface: ${text}`);
  return text;
}

export function requireService(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!SERVICE_RE.test(text))
    throw new FirewallError(`Bad service name: ${text}`);
  return text;
}

export function requireZone(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!ZONE_RE.test(text)) throw new FirewallError(`Bad zone name: ${text}`);
  return text;
}

export function requireJail(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!JAIL_RE.test(text)) throw new FirewallError(`Bad jail name: ${text}`);
  return text;
}

/** A single address (no range), for Fail2ban. */
export function requireIp(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!isIP(text)) throw new FirewallError(`Bad IP address: ${text}`);
  return text.toLowerCase();
}

export function requireComment(value: unknown): string {
  const text = String(value ?? "").trim();
  if (text.length > 120)
    throw new FirewallError("A comment can be up to 120 characters");
  if (COMMENT_BAD_RE.test(text)) {
    throw new FirewallError(
      "A comment can't hold quotes, backslashes, $ or line breaks",
    );
  }
  return text;
}

export function requirePolicy(value: unknown): Policy {
  if (!POLICIES.includes(value as Policy)) {
    throw new FirewallError(`Bad policy: ${String(value)}`);
  }
  return value as Policy;
}

/** Checks a rule from a request body and returns it in canonical form. */
export function parseRuleSpec(input: unknown): RuleSpec {
  const body = (input ?? {}) as Record<string, unknown>;
  const action = String(body.action ?? "allow") as RuleAction;
  if (!ACTIONS.includes(action))
    throw new FirewallError(`Bad action: ${action}`);
  const direction = body.direction === "out" ? "out" : "in";
  if (
    body.direction !== undefined &&
    body.direction !== "in" &&
    body.direction !== "out"
  ) {
    throw new FirewallError("Direction must be in or out");
  }
  const protocol = String(body.protocol ?? "any");
  if (protocol !== "tcp" && protocol !== "udp" && protocol !== "any") {
    throw new FirewallError("Protocol must be tcp, udp or any");
  }
  const parts = parsePorts(String(body.port ?? ""));
  if (
    protocol === "any" &&
    (parts.length > 1 || parts.some((p) => p.from !== p.to))
  ) {
    throw new FirewallError("Pick tcp or udp for a port list or range");
  }
  const source = parseAddress(body.source, "source");
  const destination = parseAddress(body.destination, "destination");
  const sf = familyOf(source);
  const df = familyOf(destination);
  if (sf !== "any" && df !== "any" && sf !== df) {
    throw new FirewallError(
      "Source and destination must both be IPv4 or both IPv6",
    );
  }
  let family = String(body.family ?? "any") as Family;
  if (family !== "any" && family !== "ipv4" && family !== "ipv6") {
    throw new FirewallError("Family must be any, ipv4 or ipv6");
  }
  const fromAddress = sf !== "any" ? sf : df;
  if (fromAddress !== "any") {
    if (family !== "any" && family !== fromAddress) {
      throw new FirewallError("The address does not match the family");
    }
    family = fromAddress;
  }
  const service = body.service ? requireService(body.service) : undefined;
  if (service && parts.length) {
    throw new FirewallError("Pick a service or ports, not both");
  }
  return {
    action,
    direction,
    protocol,
    port: formatPorts(parts),
    source,
    destination,
    iface: requireIface(body.iface),
    family,
    comment: requireComment(body.comment),
    ...(service ? { service } : {}),
  };
}

/** A key that is the same for two rules that do the same thing. Comments don't count. */
export function specKey(spec: RuleSpec): string {
  let port = spec.port;
  try {
    port = normalizePorts(spec.port);
  } catch {
    // Keep the text as is.
  }
  const action = spec.action === "limit" ? "limit" : spec.action;
  return [
    action,
    spec.direction,
    spec.protocol,
    port,
    spec.source,
    spec.destination,
    spec.iface,
    spec.source || spec.destination
      ? familyOf(spec.source || spec.destination)
      : spec.family,
    spec.service ?? "",
  ].join("|");
}

/** A rule with every field filled, for reading untrusted stored JSON. */
export function emptySpec(over: Partial<RuleSpec> = {}): RuleSpec {
  return {
    action: "allow",
    direction: "in",
    protocol: "any",
    port: "",
    source: "",
    destination: "",
    iface: "",
    family: "any",
    comment: "",
    ...over,
  };
}
