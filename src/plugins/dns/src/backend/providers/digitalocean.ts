import type { DnsRecord, RecordInput } from "../../shared/types.js";
import { MAX_PAGES, jsonCall } from "./http.js";
import {
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { dotTarget, stripDot } from "./wire.js";

const API = "https://api.digitalocean.com/v2";

const call = <T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  jsonCall<T>(fetch, path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.apiToken}` },
  });

interface DoRecord {
  id: number;
  type: string;
  name: string;
  data: string;
  priority: number | null;
  port: number | null;
  ttl: number;
  weight: number | null;
  flags: number | null;
  tag: string | null;
}

function toRecord(row: DoRecord): DnsRecord {
  let content = row.data;
  if (row.type === "SRV") {
    content = `${row.weight ?? 0} ${row.port ?? 0} ${stripDot(row.data)}`;
  } else if (row.type === "CAA") {
    content = `${row.flags ?? 0} ${row.tag} "${row.data}"`;
  } else if (["CNAME", "MX", "NS", "PTR"].includes(row.type)) {
    content = stripDot(row.data);
  }
  return {
    id: String(row.id),
    type: row.type,
    name: row.name,
    content,
    ttl: row.ttl,
    priority: row.type === "MX" || row.type === "SRV" ? row.priority : null,
  };
}

function toBody(input: RecordInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    type: input.type,
    name: input.name,
    ttl: input.ttl,
  };
  if (input.type === "SRV") {
    const [weight, port, ...target] = input.content.trim().split(/\s+/);
    Object.assign(body, {
      priority: input.priority ?? 0,
      weight: Number(weight),
      port: Number(port),
      data: dotTarget("CNAME", target.join(" ")),
    });
  } else if (input.type === "CAA") {
    const match = input.content.match(/^(\d+)\s+(\S+)\s+"?(.*?)"?$/);
    Object.assign(body, {
      flags: Number(match?.[1] ?? 0),
      tag: match?.[2] ?? "issue",
      data: match?.[3] ?? input.content,
    });
  } else {
    body.data = dotTarget(input.type, input.content);
    if (input.type === "MX") body.priority = input.priority ?? 10;
  }
  return body;
}

export const digitalocean: DnsProvider = {
  id: "digitalocean",
  fields: [{ key: "apiToken", type: "secret", required: true }],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 30,
    domains: false,
  },
  async zones(creds, fetch) {
    const zones: Array<{ id: string; name: string }> = [];
    let url: string | null = "/domains?per_page=200";
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const payload: {
        domains: Array<{ name: string }>;
        links?: { pages?: { next?: string } };
      } = await call(fetch, creds, url);
      for (const domain of payload.domains ?? []) {
        zones.push({ id: domain.name, name: domain.name });
      }
      url = payload.links?.pages?.next ?? null;
    }
    return zones;
  },
  async records(creds, zone, fetch) {
    const all: DnsRecord[] = [];
    let url: string | null = `/domains/${zone.id}/records?per_page=200`;
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const payload: {
        domain_records: DoRecord[];
        links?: { pages?: { next?: string } };
      } = await call(fetch, creds, url);
      all.push(...(payload.domain_records ?? []).map(toRecord));
      url = payload.links?.pages?.next ?? null;
    }
    return all;
  },
  async create(creds, zone, input, fetch) {
    await call(fetch, creds, `/domains/${zone.id}/records`, {
      method: "POST",
      body: toBody(input),
    });
  },
  async update(creds, zone, record, input, fetch) {
    await call(fetch, creds, `/domains/${zone.id}/records/${record.id}`, {
      method: "PUT",
      body: toBody(input),
    });
  },
  async remove(creds, zone, record, fetch) {
    await call(fetch, creds, `/domains/${zone.id}/records/${record.id}`, {
      method: "DELETE",
    });
  },
};
