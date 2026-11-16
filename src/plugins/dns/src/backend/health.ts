import { Resolver } from "node:dns/promises";
import { isIP } from "./ip.js";
import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type {
  DnsRecord,
  HealthCheck,
  PropagationRow,
} from "../shared/types.js";

export const PUBLIC_RESOLVERS: Array<{ name: string; ip: string }> = [
  { name: "Cloudflare", ip: "1.1.1.1" },
  { name: "Google", ip: "8.8.8.8" },
  { name: "Quad9", ip: "9.9.9.9" },
];

export interface DnsLookup {
  /** Answers as plain lines, lowercase, no trailing dot. Empty when none. */
  resolve: (name: string, type: string, server?: string) => Promise<string[]>;
  soaSerial: (name: string, server: string) => Promise<number | null>;
}

export function isPrivateIp(ip: string): boolean {
  return (
    /^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      ip,
    ) || /^(::1|fe80:|fc|fd)/i.test(ip)
  );
}

const strip = (value: string) => value.toLowerCase().replace(/\.$/, "");

function lines(type: string, rows: unknown[]): string[] {
  switch (type) {
    case "TXT":
      return (rows as string[][]).map((row) => row.join(""));
    case "MX":
      return (rows as Array<{ exchange: string; priority: number }>).map(
        (row) => `${row.priority} ${strip(row.exchange)}`,
      );
    case "SRV":
      return (
        rows as Array<{
          priority: number;
          weight: number;
          port: number;
          name: string;
        }>
      ).map(
        (row) => `${row.priority} ${row.weight} ${row.port} ${strip(row.name)}`,
      );
    case "CAA":
      return (rows as Array<Record<string, unknown>>).map((row) => {
        const tag =
          Object.keys(row).find((key) => key !== "critical") ?? "issue";
        return `${row.critical ? 128 : 0} ${tag} "${String(row[tag])}"`;
      });
    case "A":
    case "AAAA":
      return (rows as string[]).map((row) => row.toLowerCase());
    default:
      return (rows as string[]).map(strip);
  }
}

/** The lookup used for real. */
export function createLookup(timeoutMs = 4000): DnsLookup {
  const make = (server?: string) => {
    const resolver = new Resolver({ timeout: timeoutMs, tries: 1 });
    if (server) resolver.setServers([server]);
    return resolver;
  };
  return {
    async resolve(name, type, server) {
      try {
        const rows = (await make(server).resolve(
          name,
          type as never,
        )) as unknown[];
        return lines(type, rows);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ENODATA" || code === "ENOTFOUND") return [];
        throw error;
      }
    },
    async soaSerial(name, server) {
      try {
        return (await make(server).resolveSoa(name)).serial;
      } catch {
        return null;
      }
    },
  };
}

const absolute = (name: string, zone: string) =>
  name === "@" ? zone : `${name}.${zone}`;

/** Does what the resolver said equal what the record says. */
export function answerMatches(record: DnsRecord, answers: string[]): boolean {
  const want = (() => {
    if (record.type === "MX") {
      return `${record.priority ?? 10} ${strip(record.content)}`;
    }
    if (
      record.type === "TXT" ||
      record.type === "A" ||
      record.type === "AAAA"
    ) {
      return record.content.toLowerCase();
    }
    return strip(record.content);
  })();
  if (record.type === "AAAA" || record.type === "A") {
    return answers.some((answer) => answer === want);
  }
  return answers.some((answer) => answer === want || answer.endsWith(want));
}

/** Asks the public resolvers about each record. */
export async function checkPropagation(
  lookup: DnsLookup,
  zone: string,
  records: DnsRecord[],
): Promise<PropagationRow[]> {
  const rows: PropagationRow[] = [];
  const chosen = records
    .filter((record) =>
      ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"].includes(record.type),
    )
    .filter((record) => !record.name.includes("*"))
    .slice(0, 20);
  for (const record of chosen) {
    const fqdn = absolute(record.name, zone);
    const label = `${record.name} ${record.type}`;
    for (const resolver of PUBLIC_RESOLVERS) {
      try {
        const answers = await lookup.resolve(fqdn, record.type, resolver.ip);
        rows.push({
          record: label,
          resolver: resolver.name,
          answers,
          match: answerMatches(record, answers),
        });
      } catch (error) {
        rows.push({
          record: label,
          resolver: resolver.name,
          answers: [],
          match: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return rows;
}

interface DohAnswer {
  Status: number;
  AD?: boolean;
  Answer?: unknown[];
}

async function doh(
  fetch: PluginFetch,
  name: string,
  type: string,
): Promise<DohAnswer | null> {
  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { timeoutMs: 8000, headers: { accept: "application/dns-json" } },
    );
    if (!response.ok) return null;
    return (await response.json()) as DohAnswer;
  } catch {
    return null;
  }
}

/** Counts the lookups an SPF record makes. Ten is the limit. */
export function spfLookups(spf: string): number {
  return spf
    .split(/\s+/)
    .filter((term) =>
      /^[+\-~?]?(include:|a\b|mx\b|ptr\b|exists:|redirect=)/i.test(term),
    ).length;
}

export interface HealthInput {
  zone: string;
  records: DnsRecord[];
  // Name servers the provider says serve the zone
  expectedNs?: string[];
}

export async function checkZone(
  input: HealthInput,
  lookup: DnsLookup,
  fetch: PluginFetch,
): Promise<HealthCheck[]> {
  const { zone, records } = input;
  const checks: HealthCheck[] = [];
  const add = (
    code: string,
    level: HealthCheck["level"],
    params?: HealthCheck["params"],
  ) => checks.push({ code, level, ...(params ? { params } : {}) });
  const safe = async (name: string, type: string, server?: string) => {
    try {
      return await lookup.resolve(name, type, server);
    } catch {
      return null;
    }
  };

  // Delegation
  const ns = await safe(zone, "NS", PUBLIC_RESOLVERS[0].ip);
  if (ns === null) add("delegation.error", "warn");
  else if (ns.length === 0) add("delegation.none", "fail");
  else {
    const expected = (input.expectedNs ?? []).map(strip);
    if (expected.length && !expected.some((name) => ns.includes(name))) {
      add("delegation.mismatch", "fail", { found: ns.join(", ") });
    } else add("delegation.ok", "ok", { count: ns.length });

    // Do the name servers agree
    const serials = new Map<string, number>();
    for (const server of ns.slice(0, 6)) {
      const addresses = (await safe(server, "A")) ?? [];
      const ip = addresses.find(
        (address) => isIP(address) && !isPrivateIp(address),
      );
      if (!ip) continue;
      const serial = await lookup.soaSerial(zone, ip);
      if (serial !== null) serials.set(server, serial);
    }
    const distinct = new Set(serials.values());
    if (serials.size > 1 && distinct.size > 1) {
      add("soa.differ", "warn", { count: distinct.size });
    } else if (serials.size > 0) add("soa.same", "ok", { count: serials.size });
  }

  // DNSSEC
  const ds = await doh(fetch, zone, "DS");
  if (!ds) add("dnssec.unknown", "info");
  else if (!ds.Answer?.length) add("dnssec.off", "info");
  else {
    const soa = await doh(fetch, zone, "SOA");
    if (soa?.AD) add("dnssec.valid", "ok");
    else add("dnssec.broken", "fail");
  }

  // Records that break each other
  const byName = new Map<string, DnsRecord[]>();
  for (const record of records) {
    const list = byName.get(record.name) ?? [];
    list.push(record);
    byName.set(record.name, list);
  }
  for (const [name, list] of byName) {
    const cname = list.some((record) => record.type === "CNAME");
    const other = list.some(
      (record) => record.type !== "CNAME" && record.type !== "ALIAS",
    );
    if (cname && other) add("cname.conflict", "fail", { name });
    if (cname && name === "@") add("cname.apex", "fail");
  }

  // CNAME targets that no longer exist
  const cnames = records
    .filter((record) => record.type === "CNAME")
    .slice(0, 40);
  let dangling = 0;
  for (const record of cnames) {
    const target = strip(record.content);
    const fqdn = target.includes(".") ? target : `${target}.${zone}`;
    const v4 = await safe(fqdn, "A");
    if (v4 === null) continue;
    let found = v4.length > 0;
    if (!found) {
      const v6 = await safe(fqdn, "AAAA");
      if (v6 === null) continue;
      found = v6.length > 0;
    }
    if (!found) {
      dangling += 1;
      add("cname.dangling", "warn", { name: record.name, target });
    }
  }
  if (cnames.length && dangling === 0) add("cname.ok", "ok");

  // Mail
  const mx = records.filter((record) => record.type === "MX");
  const txt = (name: string) =>
    records.filter((record) => record.type === "TXT" && record.name === name);
  const spf = txt("@").filter((record) => /^v=spf1\b/i.test(record.content));
  if (mx.length) {
    if (spf.length === 0) add("spf.missing", "warn");
    else if (spf.length > 1) add("spf.multiple", "fail");
    else {
      const count = spfLookups(spf[0].content);
      if (count > 10) add("spf.lookups", "fail", { count });
      else add("spf.ok", "ok", { count });
    }
    const dmarc = txt("_dmarc").find((record) =>
      /^v=DMARC1/i.test(record.content),
    );
    if (!dmarc) add("dmarc.missing", "warn");
    else if (/\bp=none\b/i.test(dmarc.content)) add("dmarc.none", "info");
    else add("dmarc.ok", "ok");
    const dkim = records.filter(
      (record) => record.type === "TXT" && record.name.includes("._domainkey"),
    );
    if (!dkim.length) add("dkim.none", "info");
    else add("dkim.found", "ok", { count: dkim.length });
    for (const record of mx.slice(0, 10)) {
      const host = strip(record.content);
      const fqdn = host.includes(".") ? host : `${host}.${zone}`;
      const a = (await safe(fqdn, "A")) ?? [];
      const aaaa = a.length ? a : ((await safe(fqdn, "AAAA")) ?? []);
      if (!aaaa.length) add("mx.unresolved", "fail", { host });
    }
  } else if (!spf.length) {
    add("mail.none", "info");
  }

  // CAA
  if (records.some((record) => record.type === "CAA")) add("caa.ok", "ok");
  else add("caa.none", "info");

  return checks;
}
