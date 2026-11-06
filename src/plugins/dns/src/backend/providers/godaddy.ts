import type { DomainInfo } from "../../shared/types.js";
import { groupSets, rrsetOps, type Rrset } from "./adapters.js";
import { jsonCall } from "./http.js";
import {
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { stripDot, withDot } from "./wire.js";

const HOSTS: Record<string, string> = {
  production: "https://api.godaddy.com",
  ote: "https://api.ote-godaddy.com",
};

const call = <T>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  jsonCall<T>(fetch, `${HOSTS[creds.environment] ?? HOSTS.production}${path}`, {
    ...init,
    headers: {
      authorization: `sso-key ${creds.apiKey}:${creds.apiSecret}`,
    },
  });

interface GdRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
}

const TARGETS = ["CNAME", "MX", "NS", "PTR"];

const rrsets = rrsetOps({
  async list(creds, zone, fetch) {
    const rows =
      (await call<GdRecord[] | null>(
        fetch,
        creds,
        `/v1/domains/${zone.id}/records`,
      )) ?? [];
    return groupSets(
      rows
        .filter((row) => row.type !== "SOA")
        .map((row) => {
          if (row.type === "SRV") {
            return {
              name: row.name,
              type: row.type,
              ttl: row.ttl,
              value: {
                priority: row.priority ?? 0,
                content: `${row.weight ?? 0} ${row.port ?? 0} ${stripDot(row.data)}`,
              },
            };
          }
          return {
            name: row.name,
            type: row.type,
            ttl: row.ttl,
            value: {
              content: TARGETS.includes(row.type)
                ? stripDot(row.data)
                : row.data,
              priority: row.type === "MX" ? (row.priority ?? 10) : null,
            },
          };
        }),
    ) as Rrset[];
  },
  async put(creds, zone, set, fetch) {
    const body = set.values.map((value) => {
      if (set.type === "SRV") {
        const [weight, port, ...target] = value.content.trim().split(/\s+/);
        return {
          data: withDot(target.join(" ")),
          ttl: set.ttl,
          priority: value.priority ?? 0,
          weight: Number(weight),
          port: Number(port),
        };
      }
      return {
        data: TARGETS.includes(set.type)
          ? value.content.includes(".")
            ? withDot(value.content)
            : value.content
          : value.content,
        ttl: set.ttl,
        ...(set.type === "MX" ? { priority: value.priority ?? 10 } : {}),
      };
    });
    await call(
      fetch,
      creds,
      `/v1/domains/${zone.id}/records/${set.type}/${encodeURIComponent(set.name)}`,
      { method: "PUT", body },
    );
  },
  async del(creds, zone, set, fetch) {
    await call(
      fetch,
      creds,
      `/v1/domains/${zone.id}/records/${set.type}/${encodeURIComponent(set.name)}`,
      { method: "DELETE" },
    );
  },
});

async function listDomains(
  creds: Credentials,
  fetch: PluginFetch,
): Promise<DomainInfo[]> {
  const rows =
    (await call<
      Array<{
        domain: string;
        status?: string;
        expires?: string;
        renewAuto?: boolean;
        locked?: boolean;
        nameServers?: string[] | null;
      }>
    >(fetch, creds, "/v1/domains?statuses=ACTIVE&limit=1000")) ?? [];
  return rows.map((row) => ({
    name: row.domain.toLowerCase(),
    registrar: "godaddy",
    expiresAt: row.expires ?? null,
    autoRenew: row.renewAuto ?? null,
    locked: row.locked ?? null,
    nameservers: row.nameServers ?? [],
    status: row.status ?? null,
  }));
}

export const godaddy: DnsProvider = {
  id: "godaddy",
  fields: [
    { key: "apiKey", type: "text", required: true },
    { key: "apiSecret", type: "secret", required: true },
    {
      key: "environment",
      type: "select",
      required: false,
      options: ["production", "ote"],
    },
  ],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 600,
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
  ...rrsets,
  domains: listDomains,
};
