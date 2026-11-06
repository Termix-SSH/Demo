import type { Zone } from "../../shared/types.js";
import { rrsetOps, type Rrset } from "./adapters.js";
import { MAX_PAGES, jsonCall } from "./http.js";
import {
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { fromWire, toWire } from "./wire.js";

const API = "https://api.hetzner.cloud/v1";

const call = <T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  jsonCall<T>(fetch, `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.apiToken}` },
  });

interface Pagination {
  meta?: { pagination?: { next_page?: number | null } };
}

async function paged<T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  key: string,
): Promise<T[]> {
  const all: T[] = [];
  const joiner = path.includes("?") ? "&" : "?";
  let page: number | null = 1;
  for (let guard = 0; page && guard < MAX_PAGES; guard += 1) {
    const payload: Pagination & Record<string, T[]> = await call(
      fetch,
      creds,
      `${path}${joiner}per_page=50&page=${page}`,
    );
    all.push(...(payload[key] ?? []));
    page = payload.meta?.pagination?.next_page ?? null;
  }
  return all;
}

const path = (zone: Zone, name: string, type: string) =>
  `/zones/${zone.id}/rrsets/${encodeURIComponent(name)}/${type}`;

const rrsets = rrsetOps({
  async list(creds, zone, fetch) {
    const rows = await paged<{
      name: string;
      type: string;
      ttl: number | null;
      records: Array<{ value: string }>;
    }>(fetch, creds, `/zones/${zone.id}/rrsets`, "rrsets");
    const sets: Rrset[] = [];
    for (const row of rows) {
      if (row.type === "SOA") continue;
      sets.push({
        name: row.name,
        type: row.type,
        ttl: row.ttl ?? 3600,
        values: row.records.map((r) => fromWire(row.type, r.value)),
      });
    }
    return sets;
  },
  async put(creds, zone, set, fetch) {
    const records = set.values.map((value) => ({
      value: toWire(set.type, value, { dot: true }),
    }));
    const existing = await paged<{ name: string; type: string }>(
      fetch,
      creds,
      `/zones/${zone.id}/rrsets?name=${encodeURIComponent(set.name)}&type=${set.type}`,
      "rrsets",
    );
    if (
      existing.some((row) => row.name === set.name && row.type === set.type)
    ) {
      await call(
        fetch,
        creds,
        `${path(zone, set.name, set.type)}/actions/set_records`,
        {
          method: "POST",
          body: { records },
        },
      );
      await call(
        fetch,
        creds,
        `${path(zone, set.name, set.type)}/actions/change_ttl`,
        {
          method: "POST",
          body: { ttl: set.ttl },
        },
      );
      return;
    }
    await call(fetch, creds, `/zones/${zone.id}/rrsets`, {
      method: "POST",
      body: { name: set.name, type: set.type, ttl: set.ttl, records },
    });
  },
  async del(creds, zone, set, fetch) {
    await call(fetch, creds, path(zone, set.name, set.type), {
      method: "DELETE",
    });
  },
});

export const hetzner: DnsProvider = {
  id: "hetzner",
  fields: [{ key: "apiToken", type: "secret", required: true }],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 60,
    domains: false,
  },
  async zones(creds, fetch) {
    const rows = await paged<{ id: number | string; name: string }>(
      fetch,
      creds,
      "/zones",
      "zones",
    );
    return rows.map((row) => ({ id: String(row.id), name: row.name }));
  },
  ...rrsets,
};
