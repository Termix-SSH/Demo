import type { DomainInfo } from "../../shared/types.js";
import { rrsetOps, type Rrset } from "./adapters.js";
import { MAX_PAGES, jsonCall } from "./http.js";
import {
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { fromWire, toWire } from "./wire.js";

const API = "https://api.gandi.net/v5";

const call = <T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  jsonCall<T>(fetch, `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${creds.token}` },
  });

async function paged<T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = await call<T[] | null>(
      fetch,
      creds,
      `${path}?per_page=100&page=${page}`,
    );
    all.push(...(rows ?? []));
    if ((rows ?? []).length < 100) break;
  }
  return all;
}

const rrsets = rrsetOps({
  async list(creds, zone, fetch) {
    const rows = await call<Array<{
      rrset_name: string;
      rrset_type: string;
      rrset_ttl: number;
      rrset_values: string[];
    }> | null>(fetch, creds, `/livedns/domains/${zone.id}/records`);
    const sets: Rrset[] = [];
    for (const row of rows ?? []) {
      if (row.rrset_type === "SOA") continue;
      sets.push({
        name: row.rrset_name,
        type: row.rrset_type,
        ttl: row.rrset_ttl,
        values: row.rrset_values.map((v) => fromWire(row.rrset_type, v)),
      });
    }
    return sets;
  },
  async put(creds, zone, set, fetch) {
    await call(
      fetch,
      creds,
      `/livedns/domains/${zone.id}/records/${encodeURIComponent(set.name)}/${set.type}`,
      {
        method: "PUT",
        body: {
          rrset_ttl: set.ttl,
          rrset_values: set.values.map((v) =>
            toWire(set.type, v, { dot: true }),
          ),
        },
      },
    );
  },
  async del(creds, zone, set, fetch) {
    await call(
      fetch,
      creds,
      `/livedns/domains/${zone.id}/records/${encodeURIComponent(set.name)}/${set.type}`,
      { method: "DELETE" },
    );
  },
});

export const gandi: DnsProvider = {
  id: "gandi",
  fields: [{ key: "token", type: "secret", required: true }],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 300,
    domains: true,
  },
  async zones(creds, fetch) {
    const rows = await paged<{ fqdn: string }>(
      fetch,
      creds,
      "/livedns/domains",
    );
    return rows.map((row) => ({ id: row.fqdn, name: row.fqdn }));
  },
  ...rrsets,
  async domains(creds, fetch) {
    const rows = await paged<{
      fqdn: string;
      status?: string[];
      autorenew?: boolean | { enabled?: boolean };
      dates?: { registry_ends_at?: string };
      nameservers?: string[];
    }>(fetch, creds, "/domain/domains");
    return rows.map((row): DomainInfo => {
      const status = row.status ?? [];
      return {
        name: row.fqdn.toLowerCase(),
        registrar: "gandi",
        expiresAt: row.dates?.registry_ends_at ?? null,
        autoRenew:
          typeof row.autorenew === "object"
            ? !!row.autorenew?.enabled
            : (row.autorenew ?? null),
        locked: status.length
          ? status.some((s) => /transfer.?prohibited/i.test(s))
          : null,
        nameservers: row.nameservers ?? [],
        status: status[0] ?? null,
      };
    });
  },
};
