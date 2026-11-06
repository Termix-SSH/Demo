import type { DnsRecord, DomainInfo, Zone } from "../../shared/types.js";
import { recordId } from "./adapters.js";
import { send } from "./http.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";

const API = "https://api.namecheap.com/xml.response";

type Tag = Record<string, string>;

function unescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Attributes of every `<name ... />` or `<name ...>` tag in the answer. */
export function tags(xml: string, name: string): Tag[] {
  const out: Tag[] = [];
  const open = new RegExp(`<${name}\\b([^>]*?)/?>`, "g");
  for (const match of xml.matchAll(open)) {
    const attrs: Tag = {};
    for (const pair of match[1].matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
      attrs[pair[1]] = unescape(pair[2]);
    }
    out.push(attrs);
  }
  return out;
}

async function call(
  fetch: PluginFetch,
  creds: Credentials,
  command: string,
  params: Record<string, string> = {},
): Promise<string> {
  const body = new URLSearchParams({
    ApiUser: creds.apiUser,
    ApiKey: creds.apiKey,
    UserName: creds.userName || creds.apiUser,
    ClientIp: creds.clientIp,
    Command: command,
    ...params,
  }).toString();
  const response = await send(fetch, API, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const xml = await response.text();
  const status = tags(xml, "ApiResponse")[0]?.Status;
  if (status !== "OK") {
    const message = /<Error\b[^>]*>([^<]*)<\/Error>/.exec(xml)?.[1];
    throw new ProviderError(
      message ? unescape(message) : "Namecheap refused the request",
    );
  }
  return xml;
}

function split(domain: string): { sld: string; tld: string } {
  const dot = domain.indexOf(".");
  return { sld: domain.slice(0, dot), tld: domain.slice(dot + 1) };
}

function hostParams(zone: Zone): Record<string, string> {
  const { sld, tld } = split(zone.name);
  return { SLD: sld, TLD: tld };
}

interface Host {
  name: string;
  type: string;
  address: string;
  ttl: number;
  pref: number | null;
}

interface Listed extends DomainInfo {
  ourDns: boolean;
}

async function listAll(
  creds: Credentials,
  fetch: PluginFetch,
): Promise<Listed[]> {
  const out: Listed[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const xml = await call(fetch, creds, "namecheap.domains.getList", {
      PageSize: "100",
      Page: String(page),
    });
    const rows = tags(xml, "Domain");
    for (const row of rows) {
      const [month, day, year] = (row.Expires ?? "").split("/");
      out.push({
        name: row.Name.toLowerCase(),
        registrar: "namecheap",
        expiresAt: year
          ? new Date(Date.UTC(+year, +month - 1, +day)).toISOString()
          : null,
        autoRenew: row.AutoRenew ? row.AutoRenew === "true" : null,
        locked: row.IsLocked ? row.IsLocked === "true" : null,
        nameservers: [],
        status: row.IsExpired === "true" ? "expired" : "active",
        ourDns: row.IsOurDNS === "true",
      });
    }
    if (rows.length < 100) break;
  }
  return out;
}

async function getHosts(
  creds: Credentials,
  zone: Zone,
  fetch: PluginFetch,
): Promise<Host[]> {
  const xml = await call(
    fetch,
    creds,
    "namecheap.domains.dns.getHosts",
    hostParams(zone),
  );
  return tags(xml, "host").map((row) => ({
    name: row.Name,
    type: row.Type,
    address: row.Address,
    ttl: Number(row.TTL) || 1800,
    pref: row.MXPref ? Number(row.MXPref) : null,
  }));
}

async function setHosts(
  creds: Credentials,
  zone: Zone,
  hosts: Host[],
  fetch: PluginFetch,
): Promise<void> {
  const params: Record<string, string> = hostParams(zone);
  hosts.forEach((host, index) => {
    const n = index + 1;
    params[`HostName${n}`] = host.name;
    params[`RecordType${n}`] = host.type;
    params[`Address${n}`] = host.address;
    params[`TTL${n}`] = String(host.ttl);
    if (host.type === "MX") params[`MXPref${n}`] = String(host.pref ?? 10);
  });
  if (hosts.some((host) => host.type === "MX")) params.EmailType = "MX";
  await call(fetch, creds, "namecheap.domains.dns.setHosts", params);
}

const toRecord = (host: Host): DnsRecord => {
  const content = host.address;
  const priority = host.type === "MX" ? (host.pref ?? 10) : null;
  return {
    id: recordId(host.type, host.name, { content, priority }),
    type: host.type,
    name: host.name,
    content,
    ttl: host.ttl,
    priority,
  };
};

const toHost = (input: {
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority?: number | null;
}): Host => ({
  name: input.name,
  type: input.type,
  address: input.content,
  ttl: input.ttl,
  pref: input.type === "MX" ? (input.priority ?? 10) : null,
});

export const namecheap: DnsProvider = {
  id: "namecheap",
  fields: [
    { key: "apiUser", type: "text", required: true },
    { key: "apiKey", type: "secret", required: true },
    { key: "userName", type: "text", required: false },
    {
      key: "clientIp",
      type: "text",
      required: true,
      placeholder: "The IP address you added to the API allow list",
    },
  ],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 60,
    domains: true,
  },
  async zones(creds, fetch) {
    const list = await listAll(creds, fetch);
    return list
      .filter((domain) => domain.ourDns)
      .map((domain) => ({ id: domain.name, name: domain.name }));
  },
  async records(creds, zone, fetch) {
    return (await getHosts(creds, zone, fetch)).map(toRecord);
  },
  async create(creds, zone, input, fetch) {
    const hosts = await getHosts(creds, zone, fetch);
    await setHosts(creds, zone, [...hosts, toHost(input)], fetch);
  },
  async update(creds, zone, record, input, fetch) {
    const hosts = await getHosts(creds, zone, fetch);
    const next = hosts.map((host) =>
      toRecord(host).id === record.id ? toHost(input) : host,
    );
    await setHosts(creds, zone, next, fetch);
  },
  async remove(creds, zone, record, fetch) {
    const hosts = await getHosts(creds, zone, fetch);
    await setHosts(
      creds,
      zone,
      hosts.filter((host) => toRecord(host).id !== record.id),
      fetch,
    );
  },
  async domains(creds, fetch) {
    return (await listAll(creds, fetch)).map(
      ({ ourDns: _own, ...domain }) => domain,
    );
  },
};
