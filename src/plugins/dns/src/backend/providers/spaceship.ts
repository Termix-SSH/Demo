import type { DnsRecord, DomainInfo, RecordInput } from "../../shared/types.js";
import { recordId } from "./adapters.js";
import { jsonCall, MAX_PAGES } from "./http.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { stripDot } from "./wire.js";

const API = "https://spaceship.dev/api/v1";
const PAGE = 500;

const call = <T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  jsonCall<T>(fetch, `${API}${path}`, {
    ...init,
    headers: { "X-API-Key": creds.apiKey, "X-API-Secret": creds.apiSecret },
  });

/** A record as Spaceship sends and takes it, minus ttl and group. */
type Item = Record<string, string | number> & { type: string; name: string };

interface Row {
  type: string;
  name: string;
  ttl: number;
  group?: { type?: string };
  [field: string]: unknown;
}

// The record's data fields, which together with type and name identify it.
const DATA_FIELDS: Record<string, string[]> = {
  A: ["address"],
  AAAA: ["address"],
  CNAME: ["cname"],
  MX: ["exchange", "preference"],
  TXT: ["value"],
  NS: ["nameserver"],
  SRV: ["service", "protocol", "priority", "weight", "port", "target"],
  CAA: ["flag", "tag", "value"],
  PTR: ["pointer"],
};

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];

/** Spaceship keeps the _service._proto labels of SRV apart from the name. */
function srvName(row: Row): string {
  const base = row.name === "@" ? "" : `.${row.name}`;
  return `${String(row.service)}.${String(row.protocol)}${base}`;
}

function toRecord(row: Row): DnsRecord | null {
  const type = row.type.toUpperCase();
  let name = row.name;
  let content: string;
  let priority: number | null = null;
  switch (type) {
    case "A":
    case "AAAA":
      content = String(row.address);
      break;
    case "CNAME":
      content = stripDot(String(row.cname));
      break;
    case "MX":
      content = stripDot(String(row.exchange));
      priority = Number(row.preference);
      break;
    case "TXT":
      content = String(row.value);
      break;
    case "NS":
      content = stripDot(String(row.nameserver));
      break;
    case "SRV":
      name = srvName(row);
      content = `${Number(row.weight)} ${Number(row.port)} ${stripDot(String(row.target))}`;
      priority = Number(row.priority);
      break;
    case "CAA":
      content = `${Number(row.flag)} ${String(row.tag)} "${String(row.value)}"`;
      break;
    default:
      return null;
  }
  return {
    id: recordId(type, name, { content, priority }),
    type,
    name,
    content,
    ttl: row.ttl,
    priority,
    // Records a Spaceship product added can't be changed through the API.
    ...(row.group?.type && row.group.type !== "custom"
      ? { readOnly: true }
      : {}),
  };
}

function toItem(input: {
  type: string;
  name: string;
  content: string;
  priority?: number | null;
}): Item {
  const type = input.type.toUpperCase();
  const name = input.name || "@";
  const content = input.content.trim();
  switch (type) {
    case "A":
    case "AAAA":
      return { type, name, address: content };
    case "CNAME":
      return { type, name, cname: stripDot(content) };
    case "MX":
      return {
        type,
        name,
        exchange: stripDot(content),
        preference: input.priority ?? 10,
      };
    case "TXT":
      return { type, name, value: input.content };
    case "NS":
      return { type, name, nameserver: stripDot(content) };
    case "SRV": {
      const labels = name.split(".");
      if (
        labels.length < 2 ||
        !labels[0].startsWith("_") ||
        !labels[1].startsWith("_")
      ) {
        throw new ProviderError(
          "An SRV name starts with the service and protocol, like _sip._tcp",
        );
      }
      const [weight, port, ...target] = content.split(/\s+/);
      if (!target.length || !/^\d+$/.test(weight) || !/^\d+$/.test(port)) {
        throw new ProviderError(
          "An SRV record looks like: 5 5060 sip.example.com",
        );
      }
      return {
        type,
        name: labels.slice(2).join(".") || "@",
        service: labels[0],
        protocol: labels[1],
        priority: input.priority ?? 0,
        weight: Number(weight),
        port: Number(port),
        target: stripDot(target.join(" ")),
      };
    }
    case "CAA": {
      const match = content.match(/^(\d+)\s+(\S+)\s+"?(.*?)"?$/);
      if (!match)
        throw new ProviderError("A CAA record looks like: 0 issue ca");
      return {
        type,
        name,
        flag: Number(match[1]),
        tag: match[2],
        value: match[3],
      };
    }
    default:
      throw new ProviderError(`Spaceship does not take ${type} records here`);
  }
}

/** The delete body only names the record. */
function deleteItem(item: Item): Item {
  const out: Item = { type: item.type, name: item.name };
  for (const field of DATA_FIELDS[item.type] ?? []) {
    if (item[field] !== undefined) out[field] = item[field];
  }
  return out;
}

async function save(
  fetch: PluginFetch,
  creds: Credentials,
  domain: string,
  item: Item,
  ttl: number,
) {
  await call(fetch, creds, `/dns/records/${encodeURIComponent(domain)}`, {
    method: "PUT",
    // Spaceship takes 60 to 3600 seconds.
    body: {
      force: true,
      items: [{ ...item, ttl: Math.min(3600, Math.max(60, ttl)) }],
    },
  });
}

async function drop(
  fetch: PluginFetch,
  creds: Credentials,
  domain: string,
  item: Item,
) {
  await call(fetch, creds, `/dns/records/${encodeURIComponent(domain)}`, {
    method: "DELETE",
    body: [deleteItem(item)],
  });
}

async function listDomains(
  creds: Credentials,
  fetch: PluginFetch,
): Promise<DomainInfo[]> {
  const out: DomainInfo[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await call<{
      items?: Array<{
        name: string;
        autoRenew?: boolean;
        expirationDate?: string;
        lifecycleStatus?: string;
        eppStatuses?: string[];
        nameservers?: { hosts?: string[] };
      }>;
      total?: number;
    }>(fetch, creds, `/domains?take=100&skip=${page * 100}&orderBy=name`);
    const rows = payload?.items ?? [];
    for (const row of rows) {
      out.push({
        name: row.name.toLowerCase(),
        registrar: "spaceship",
        expiresAt: row.expirationDate ?? null,
        autoRenew: row.autoRenew ?? null,
        locked: row.eppStatuses
          ? row.eppStatuses.includes("clientTransferProhibited")
          : null,
        nameservers: row.nameservers?.hosts ?? [],
        status: row.lifecycleStatus ?? null,
      });
    }
    if (rows.length < 100 || out.length >= (payload?.total ?? 0)) break;
  }
  return out;
}

async function listRows(
  creds: Credentials,
  domain: string,
  fetch: PluginFetch,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await call<{ items?: Row[]; total?: number }>(
      fetch,
      creds,
      `/dns/records/${encodeURIComponent(domain)}?take=${PAGE}&skip=${page * PAGE}`,
    );
    const items = payload?.items ?? [];
    rows.push(...items);
    if (items.length < PAGE || rows.length >= (payload?.total ?? 0)) break;
  }
  return rows;
}

export const spaceship: DnsProvider = {
  id: "spaceship",
  fields: [
    { key: "apiKey", type: "text", required: true },
    { key: "apiSecret", type: "secret", required: true },
  ],
  features: {
    types: TYPES,
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 60,
    domains: true,
  },
  async zones(creds, fetch) {
    const list = await listDomains(creds, fetch);
    return list.map((domain) => ({
      id: domain.name,
      name: domain.name,
      nameservers: domain.nameservers,
    }));
  },
  async records(creds, zone, fetch) {
    const rows = await listRows(creds, zone.name, fetch);
    return rows
      .map(toRecord)
      .filter((record): record is DnsRecord => record !== null);
  },
  async create(creds, zone, input: RecordInput, fetch) {
    await save(fetch, creds, zone.name, toItem(input), input.ttl);
  },
  async update(creds, zone, record, input, fetch) {
    if (record.readOnly) {
      throw new ProviderError(
        "The provider manages this record, it cannot be changed here",
      );
    }
    const before = toItem(record);
    const after = toItem(input);
    // Saving the same record again only changes its TTL.
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      await drop(fetch, creds, zone.name, before);
    }
    await save(fetch, creds, zone.name, after, input.ttl);
  },
  async remove(creds, zone, record, fetch) {
    if (record.readOnly) {
      throw new ProviderError(
        "The provider manages this record, it cannot be changed here",
      );
    }
    await drop(fetch, creds, zone.name, toItem(record));
  },
  domains: listDomains,
};
