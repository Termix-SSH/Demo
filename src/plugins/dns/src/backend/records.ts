import { isIPv4, isIPv6 } from "node:net";
import type {
  DiffEntry,
  DnsRecord,
  ProviderFeatures,
  RecordInput,
} from "../shared/types.js";

const MAX_TTL = 604_800;
const HOST =
  /^(?=.{1,253}\.?$)([a-z0-9_*]([a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;
const LABELS = /^(@|\*|(\*\.)?[a-z0-9_]([a-z0-9_.-]*[a-z0-9_])?)$/i;

/** The name as stored: relative to the zone, "@" for the apex. */
export function relative(name: string, zone: string): string {
  let value = name.trim().toLowerCase().replace(/\.$/, "");
  const root = zone.toLowerCase();
  if (!value || value === root) return "@";
  if (value.endsWith(`.${root}`)) value = value.slice(0, -(root.length + 1));
  return value;
}

function target(value: string, label: string): string | null {
  return HOST.test(value) ? null : `${label} is not a valid host name`;
}

/** Checks one record and returns it cleaned, or the reason it is wrong. */
export function cleanInput(
  raw: Partial<RecordInput>,
  features: ProviderFeatures,
  zone: string,
): RecordInput | string {
  const type = String(raw.type ?? "").toUpperCase();
  if (!features.types.includes(type))
    return `${type || "Type"} is not supported`;
  const name = relative(String(raw.name ?? "@"), zone);
  if (!LABELS.test(name) || name.length > 253) return "The name is not valid";
  const content = String(raw.content ?? "").trim();
  if (!content) return "The value is required";
  if (content.length > 4096) return "The value is too long";

  let ttl = Number(raw.ttl);
  if (!Number.isInteger(ttl)) return "The TTL must be a whole number";
  if (!(features.autoTtl && ttl === 1)) {
    if (ttl < Math.max(features.minTtl, 1) || ttl > MAX_TTL) {
      return `The TTL must be between ${Math.max(features.minTtl, 1)} and ${MAX_TTL}`;
    }
  }

  let problem: string | null = null;
  let priority: number | null = null;
  switch (type) {
    case "A":
      if (!isIPv4(content)) problem = "That is not an IPv4 address";
      break;
    case "AAAA":
      if (!isIPv6(content)) problem = "That is not an IPv6 address";
      break;
    case "CNAME":
      if (name === "@") problem = "The apex cannot be a CNAME";
      else problem = target(content, "The target");
      break;
    case "NS":
    case "PTR":
      problem = target(content, "The target");
      break;
    case "MX": {
      priority = Number(raw.priority ?? 10);
      if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
        problem = "The priority must be 0 to 65535";
      } else problem = target(content, "The mail server");
      break;
    }
    case "SRV": {
      priority = Number(raw.priority ?? 0);
      const match = content.match(/^(\d+)\s+(\d+)\s+(\S+)$/);
      if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
        problem = "The priority must be 0 to 65535";
      } else if (!match) problem = "Use: weight port target";
      else if (Number(match[1]) > 65535 || Number(match[2]) > 65535) {
        problem = "The weight and port must be 0 to 65535";
      } else problem = target(match[3], "The target");
      break;
    }
    case "CAA":
      if (!/^\d+\s+[a-z]+\s+"?[^"]*"?$/i.test(content)) {
        problem = 'Use: 0 issue "letsencrypt.org"';
      }
      break;
    default:
      break;
  }
  if (problem) return problem;

  const out: RecordInput = { type, name, content, ttl };
  if (priority !== null) out.priority = priority;
  if (features.proxied && raw.proxied !== undefined)
    out.proxied = !!raw.proxied;
  if (features.comment && raw.comment) {
    out.comment = String(raw.comment).slice(0, 100);
  }
  return out;
}

const keyOf = (record: {
  type: string;
  name: string;
  content: string;
  priority?: number | null;
}) =>
  `${record.type}|${record.name}|${record.priority ?? ""}|${record.content.toLowerCase()}`;

export interface Plan {
  creates: RecordInput[];
  updates: Array<{ record: DnsRecord; input: RecordInput }>;
  removes: DnsRecord[];
}

/**
 * What it takes to turn `current` into `wanted`. A removed and an added
 * record with the same name and type become one update.
 */
export function plan(
  current: DnsRecord[],
  wanted: RecordInput[],
  options: { keepExtra?: boolean } = {},
): Plan {
  const have = new Map<string, DnsRecord[]>();
  for (const record of current) {
    if (record.readOnly) continue;
    const list = have.get(keyOf(record)) ?? [];
    list.push(record);
    have.set(keyOf(record), list);
  }
  const adds: RecordInput[] = [];
  for (const record of wanted) {
    const list = have.get(keyOf(record));
    if (list?.length) {
      const match = list.shift()!;
      if (match.ttl !== record.ttl && !(record.ttl === 1 && match.ttl === 1)) {
        adds.push(record);
        list.unshift(match);
      }
    } else adds.push(record);
  }
  const leftover = [...have.values()].flat();
  const removes: DnsRecord[] = [];
  const updates: Plan["updates"] = [];
  const creates: RecordInput[] = [];
  const pool = options.keepExtra ? [] : leftover;
  for (const input of adds) {
    const index = pool.findIndex(
      (record) =>
        record.type === input.type &&
        record.name === input.name &&
        record.type !== "MX" &&
        record.type !== "SRV",
    );
    const same = pool.findIndex((record) => keyOf(record) === keyOf(input));
    if (same >= 0) {
      updates.push({ record: pool.splice(same, 1)[0], input });
    } else if (index >= 0) {
      updates.push({ record: pool.splice(index, 1)[0], input });
    } else creates.push(input);
  }
  removes.push(...pool);
  return { creates, updates, removes };
}

export function describePlan(result: Plan): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const input of result.creates) {
    entries.push({
      kind: "add",
      type: input.type,
      name: input.name,
      after: shown(input),
    });
  }
  for (const { record, input } of result.updates) {
    entries.push({
      kind: "change",
      type: input.type,
      name: input.name,
      before: shown(record),
      after: shown(input),
    });
  }
  for (const record of result.removes) {
    entries.push({
      kind: "remove",
      type: record.type,
      name: record.name,
      before: shown(record),
    });
  }
  return entries;
}

function shown(record: {
  content: string;
  ttl: number;
  priority?: number | null;
}): string {
  const priority = record.priority != null ? `${record.priority} ` : "";
  return `${priority}${record.content} (${record.ttl})`;
}

/** A zone as a BIND file. */
export function toZoneFile(zone: string, records: DnsRecord[]): string {
  const lines = [`$ORIGIN ${zone}.`, ""];
  const sorted = [...records]
    .filter((record) => !record.readOnly)
    .sort((a, b) =>
      a.name === b.name
        ? a.type.localeCompare(b.type)
        : a.name === "@"
          ? -1
          : b.name === "@"
            ? 1
            : a.name.localeCompare(b.name),
    );
  for (const record of sorted) {
    const owner = record.name.padEnd(24);
    const ttl = record.ttl <= 1 ? 300 : record.ttl;
    let data = record.content;
    if (record.type === "TXT") {
      data = `"${record.content.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    } else if (record.type === "MX") {
      data = `${record.priority ?? 10} ${fqdn(record.content, zone)}`;
    } else if (record.type === "SRV") {
      const parts = record.content.split(/\s+/);
      parts[2] = fqdn(parts[2] ?? "", zone);
      data = `${record.priority ?? 0} ${parts.join(" ")}`;
    } else if (["CNAME", "NS", "PTR"].includes(record.type)) {
      data = fqdn(record.content, zone);
    }
    lines.push(
      `${owner}${String(ttl).padEnd(8)}IN  ${record.type.padEnd(6)}${data}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function fqdn(value: string, zone: string): string {
  if (value.endsWith(".")) return value;
  if (value === "@") return `${zone}.`;
  return value.includes(".") ? `${value}.` : `${value}.${zone}.`;
}

/** Cuts a ; comment that is not inside quotes. */
function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\\") i += 1;
    else if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) return line.slice(0, i);
  }
  return line;
}

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)) {
    out.push(
      match[1] !== undefined
        ? `"${match[1].replace(/\\(.)/g, "$1")}`
        : match[2],
    );
  }
  return out;
}

export interface ParsedZone {
  records: RecordInput[];
  skipped: string[];
}

/** Reads a BIND zone file. SOA and apex NS lines are left out. */
export function parseZoneFile(
  text: string,
  zone: string,
  features: ProviderFeatures,
): ParsedZone {
  // Join lines inside ( ... )
  const joined: string[] = [];
  let pending = "";
  let depth = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    for (const char of line) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
    }
    const clean = line.replace(/[()]/g, " ");
    pending = pending ? `${pending} ${clean.trim()}` : clean;
    if (depth <= 0) {
      joined.push(pending.replace(/\s+$/, ""));
      pending = "";
      depth = 0;
    }
  }

  let origin = zone;
  let defaultTtl = 3600;
  let lastOwner = "@";
  const records: RecordInput[] = [];
  const skipped: string[] = [];

  for (const line of joined) {
    if (!line.trim()) continue;
    const directive = /^\s*\$(\w+)\s+(\S+)/.exec(line);
    if (directive) {
      if (directive[1].toUpperCase() === "ORIGIN") {
        origin = directive[2].replace(/\.$/, "");
      } else if (directive[1].toUpperCase() === "TTL") {
        defaultTtl = Number(directive[2]) || defaultTtl;
      }
      continue;
    }
    const parts = tokens(line);
    let owner = lastOwner;
    if (!/^\s/.test(line)) owner = parts.shift() ?? lastOwner;
    lastOwner = owner;
    let ttl = defaultTtl;
    while (parts.length) {
      const head = parts[0];
      if (/^\d+[smhdw]?$/i.test(head)) {
        ttl = ttlSeconds(head);
        parts.shift();
      } else if (head.toUpperCase() === "IN") parts.shift();
      else break;
    }
    const type = (parts.shift() ?? "").toUpperCase();
    if (!type) continue;
    const name = ownerName(owner, origin, zone);
    if (type === "SOA" || (type === "NS" && name === "@")) continue;
    if (!features.types.includes(type)) {
      skipped.push(`${name} ${type}`);
      continue;
    }
    let priority: number | undefined;
    let content: string;
    if (type === "TXT") {
      content = parts.map((p) => (p.startsWith('"') ? p.slice(1) : p)).join("");
    } else if (type === "MX") {
      priority = Number(parts.shift());
      content = absTarget(parts.join(" "), origin, zone);
    } else if (type === "SRV") {
      priority = Number(parts.shift());
      const [weight, port, host] = parts;
      content = `${weight} ${port} ${absTarget(host ?? "", origin, zone)}`;
    } else if (["CNAME", "NS", "PTR"].includes(type)) {
      content = absTarget(parts.join(" "), origin, zone);
    } else if (type === "CAA") {
      const [flags, tag, ...rest] = parts;
      content = `${flags} ${tag} "${rest.join(" ").replace(/^"/, "")}"`;
    } else {
      content = parts.join(" ");
    }
    records.push({
      type,
      name,
      content,
      ttl: features.autoTtl || ttl >= features.minTtl ? ttl : features.minTtl,
      ...(priority !== undefined ? { priority } : {}),
    });
  }
  return { records, skipped };
}

function ttlSeconds(value: string): number {
  const match = /^(\d+)([smhdw]?)$/i.exec(value);
  if (!match) return 3600;
  const unit = { "": 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[
    match[2].toLowerCase() as "" | "s" | "m" | "h" | "d" | "w"
  ];
  return Number(match[1]) * unit;
}

function ownerName(owner: string, origin: string, zone: string): string {
  if (owner === "@") return relative(origin, zone);
  if (owner.endsWith(".")) return relative(owner, zone);
  const base = relative(origin, zone);
  const full = base === "@" ? owner : `${owner}.${base}`;
  return full.toLowerCase();
}

function absTarget(value: string, origin: string, zone: string): string {
  if (value.endsWith(".")) return value.slice(0, -1);
  if (value === "@") return origin || zone;
  return `${value}.${origin}`;
}
