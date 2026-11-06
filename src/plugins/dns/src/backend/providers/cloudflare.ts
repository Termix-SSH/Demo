import type { DnsRecord, RecordInput, Zone } from "../../shared/types.js";
import { MAX_PAGES, jsonCall } from "./http.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { absoluteName, relativeName } from "./wire.js";

const API = "https://api.cloudflare.com/client/v4";

interface Envelope<T> {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result: T;
  result_info?: { total_pages?: number };
}

async function call<T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Envelope<T>> {
  const payload = await jsonCall<Envelope<T>>(fetch, `${API}${path}`, {
    method: init.method,
    body: init.body,
    headers: { authorization: `Bearer ${creds.apiToken}` },
  });
  if (!payload?.success) {
    const reason =
      payload?.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ") || "Cloudflare refused the request";
    throw new ProviderError(reason);
  }
  return payload;
}

async function pages<T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
): Promise<T[]> {
  const all: T[] = [];
  const joiner = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await call<T[]>(
      fetch,
      creds,
      `${path}${joiner}per_page=100&page=${page}`,
    );
    all.push(...(payload.result ?? []));
    if (page >= (payload.result_info?.total_pages ?? 1)) break;
  }
  return all;
}

interface CfRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
  comment?: string | null;
  data?: Record<string, unknown>;
}

function toRecord(row: CfRecord, zone: Zone): DnsRecord {
  let content = row.content;
  let priority = row.priority ?? null;
  const data = row.data;
  if (row.type === "SRV" && data) {
    content = `${data.weight} ${data.port} ${data.target}`;
    priority = Number(data.priority);
  } else if (row.type === "CAA" && data) {
    content = `${data.flags} ${data.tag} "${data.value}"`;
  } else if (row.type === "TXT") {
    content = content.replace(/^"(.*)"$/s, "$1");
  }
  return {
    id: row.id,
    type: row.type,
    name: relativeName(row.name, zone.name),
    content,
    ttl: row.ttl,
    priority: row.type === "MX" || row.type === "SRV" ? priority : null,
    proxied: !!row.proxied,
    ...(row.comment ? { comment: row.comment } : {}),
  };
}

function toBody(input: RecordInput, zone: Zone): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: input.type,
    name: absoluteName(input.name, zone.name),
    ttl: input.ttl,
    comment: input.comment ?? "",
  };
  if (["A", "AAAA", "CNAME"].includes(input.type)) {
    body.proxied = !!input.proxied;
  }
  if (input.type === "SRV") {
    const [weight, port, ...target] = input.content.trim().split(/\s+/);
    body.data = {
      priority: input.priority ?? 0,
      weight: Number(weight),
      port: Number(port),
      target: target.join(" "),
    };
  } else if (input.type === "CAA") {
    const match = input.content.match(/^(\d+)\s+(\S+)\s+"?(.*?)"?$/);
    if (!match) throw new ProviderError("A CAA record looks like: 0 issue ca");
    body.data = { flags: Number(match[1]), tag: match[2], value: match[3] };
  } else {
    body.content = input.content;
    if (input.type === "MX") body.priority = input.priority ?? 10;
  }
  return body;
}

export const cloudflare: DnsProvider = {
  id: "cloudflare",
  fields: [{ key: "apiToken", type: "secret", required: true }],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"],
    proxied: true,
    comment: true,
    autoTtl: true,
    minTtl: 60,
    domains: false,
  },
  async zones(creds, fetch) {
    const rows = await pages<{
      id: string;
      name: string;
      name_servers?: string[];
    }>(fetch, creds, "/zones");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameservers: row.name_servers,
    }));
  },
  async records(creds, zone, fetch) {
    const rows = await pages<CfRecord>(
      fetch,
      creds,
      `/zones/${zone.id}/dns_records`,
    );
    return rows.map((row) => toRecord(row, zone));
  },
  async create(creds, zone, input, fetch) {
    await call(fetch, creds, `/zones/${zone.id}/dns_records`, {
      method: "POST",
      body: toBody(input, zone),
    });
  },
  async update(creds, zone, record, input, fetch) {
    await call(fetch, creds, `/zones/${zone.id}/dns_records/${record.id}`, {
      method: "PUT",
      body: toBody(input, zone),
    });
  },
  async remove(creds, zone, record, fetch) {
    await call(fetch, creds, `/zones/${zone.id}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  },
};
