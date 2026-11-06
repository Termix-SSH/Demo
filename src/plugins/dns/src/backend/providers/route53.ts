import type { DomainInfo } from "../../shared/types.js";
import { rrsetOps, type Rrset } from "./adapters.js";
import { signV4 } from "./auth/sigv4.js";
import { MAX_PAGES, pool, send } from "./http.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { fromWire, relativeName, stripDot, toWire } from "./wire.js";
import { child, childText, parseXml, type XmlNode } from "./xml.js";

const HOST = "https://route53.amazonaws.com";
const BASE = "/2013-04-01";
const NS = "https://route53.amazonaws.com/doc/2013-04-01/";

function keys(creds: Credentials) {
  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken || undefined,
  };
}

async function call(
  fetch: PluginFetch,
  creds: Credentials,
  method: "GET" | "POST",
  path: string,
  body?: string,
): Promise<XmlNode> {
  const url = `${HOST}${path}`;
  const headers = signV4({
    method,
    url,
    region: "us-east-1",
    service: "route53",
    headers: body ? { "content-type": "text/xml" } : {},
    body,
    ...keys(creds),
  });
  const response = await send(fetch, url, { method, headers, body });
  return parseXml(await response.text());
}

const named = (node: XmlNode | undefined, name: string) =>
  node?.children.filter((c) => c.name === name) ?? [];

/** Route 53 writes some characters as \ooo octal. */
function decodeName(name: string): string {
  return name.replace(/\\(\d{3})/g, (_, octal: string) =>
    String.fromCharCode(parseInt(octal, 8)),
  );
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function zoneId(zone: { id: string }): string {
  return zone.id.replace(/^\/?hostedzone\//, "");
}

async function listSets(
  creds: Credentials,
  zone: { id: string; name: string },
  fetch: PluginFetch,
): Promise<Rrset[]> {
  const sets: Rrset[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const root = await call(
      fetch,
      creds,
      "GET",
      `${BASE}/hostedzone/${zoneId(zone)}/rrset?maxitems=300${cursor}`,
    );
    for (const row of named(
      child(root, "ResourceRecordSets"),
      "ResourceRecordSet",
    )) {
      const type = childText(row, "Type") ?? "";
      if (type === "SOA" || child(row, "SetIdentifier")) continue;
      const name = relativeName(
        decodeName(childText(row, "Name") ?? ""),
        zone.name,
      );
      const ttl = Number(childText(row, "TTL") ?? 300);
      const alias = child(row, "AliasTarget");
      if (alias) {
        sets.push({
          name,
          type,
          ttl,
          readOnly: true,
          values: [
            { content: `ALIAS ${stripDot(childText(alias, "DNSName") ?? "")}` },
          ],
        });
        continue;
      }
      const values = named(child(row, "ResourceRecords"), "ResourceRecord").map(
        (record) => fromWire(type, childText(record, "Value") ?? ""),
      );
      sets.push({
        name,
        type,
        ttl,
        values,
        ...(type === "NS" && name === "@" ? { readOnly: true } : {}),
      });
    }
    if (childText(root, "IsTruncated") !== "true") break;
    const nextName = childText(root, "NextRecordName");
    const nextType = childText(root, "NextRecordType");
    if (!nextName || !nextType) break;
    cursor = `&name=${encodeURIComponent(nextName)}&type=${nextType}`;
  }
  return sets;
}

function changeXml(
  action: "UPSERT" | "DELETE",
  zoneName: string,
  set: Rrset,
): string {
  const fqdn = set.name === "@" ? zoneName : `${set.name}.${zoneName}`;
  const records = set.values
    .map(
      (value) =>
        `<ResourceRecord><Value>${escapeXml(toWire(set.type, value, { dot: true }))}</Value></ResourceRecord>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ChangeResourceRecordSetsRequest xmlns="${NS}"><ChangeBatch><Changes><Change>` +
    `<Action>${action}</Action><ResourceRecordSet>` +
    `<Name>${escapeXml(fqdn)}.</Name><Type>${set.type}</Type><TTL>${set.ttl}</TTL>` +
    `<ResourceRecords>${records}</ResourceRecords>` +
    `</ResourceRecordSet></Change></Changes></ChangeBatch></ChangeResourceRecordSetsRequest>`
  );
}

const rrsets = rrsetOps({
  list: listSets,
  async put(creds, zone, set, fetch) {
    await call(
      fetch,
      creds,
      "POST",
      `${BASE}/hostedzone/${zoneId(zone)}/rrset`,
      changeXml("UPSERT", stripDot(zone.name), set),
    );
  },
  async del(creds, zone, target, fetch) {
    const current = (await listSets(creds, zone, fetch)).find(
      (set) => set.name === target.name && set.type === target.type,
    );
    if (!current) return;
    await call(
      fetch,
      creds,
      "POST",
      `${BASE}/hostedzone/${zoneId(zone)}/rrset`,
      changeXml("DELETE", stripDot(zone.name), current),
    );
  },
});

async function domainsCall<T>(
  fetch: PluginFetch,
  creds: Credentials,
  target: string,
  body: unknown,
): Promise<T> {
  const url = "https://route53domains.us-east-1.amazonaws.com/";
  const text = JSON.stringify(body);
  const headers = signV4({
    method: "POST",
    url,
    region: "us-east-1",
    service: "route53domains",
    headers: {
      "content-type": "application/x-amz-json-1.1",
      "x-amz-target": `Route53Domains_v20140515.${target}`,
    },
    body: text,
    ...keys(creds),
  });
  const response = await send(fetch, url, {
    method: "POST",
    headers,
    body: text,
  });
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderError("Route 53 Domains sent an answer that is not JSON");
  }
}

export const route53: DnsProvider = {
  id: "route53",
  fields: [
    { key: "accessKeyId", type: "text", required: true },
    { key: "secretAccessKey", type: "secret", required: true },
    { key: "sessionToken", type: "secret", required: false },
  ],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"],
    proxied: false,
    comment: false,
    autoTtl: false,
    minTtl: 0,
    domains: true,
  },
  async zones(creds, fetch) {
    const zones: Array<{ id: string; name: string }> = [];
    let marker = "";
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const root = await call(
        fetch,
        creds,
        "GET",
        `${BASE}/hostedzone${marker}`,
      );
      for (const row of named(child(root, "HostedZones"), "HostedZone")) {
        zones.push({
          id: zoneId({ id: childText(row, "Id") ?? "" }),
          name: stripDot(decodeName(childText(row, "Name") ?? "")),
        });
      }
      const next = childText(root, "NextMarker");
      if (childText(root, "IsTruncated") !== "true" || !next) break;
      marker = `?marker=${encodeURIComponent(next)}`;
    }
    return zones;
  },
  ...rrsets,
  async domains(creds, fetch) {
    const names: Array<{
      DomainName: string;
      AutoRenew?: boolean;
      TransferLock?: boolean;
      Expiry?: number;
    }> = [];
    let marker: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await domainsCall<{
        Domains?: typeof names;
        NextPageMarker?: string;
      }>(fetch, creds, "ListDomains", marker ? { Marker: marker } : {});
      names.push(...(payload.Domains ?? []));
      marker = payload.NextPageMarker;
      if (!marker) break;
    }
    return pool(names, 4, async (row): Promise<DomainInfo> => {
      let nameservers: string[] = [];
      let status: string | null = null;
      try {
        const detail = await domainsCall<{
          Nameservers?: Array<{ Name: string }>;
          StatusList?: string[];
        }>(fetch, creds, "GetDomainDetail", { DomainName: row.DomainName });
        nameservers = (detail.Nameservers ?? []).map((n) => n.Name);
        status = detail.StatusList?.[0] ?? null;
      } catch {
        // the list already has what matters
      }
      return {
        name: row.DomainName.toLowerCase(),
        registrar: "route53",
        expiresAt: row.Expiry
          ? new Date(row.Expiry * 1000).toISOString()
          : null,
        autoRenew: row.AutoRenew ?? null,
        locked: row.TransferLock ?? null,
        nameservers,
        status,
      };
    });
  },
};
