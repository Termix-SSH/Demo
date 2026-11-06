import type { DnsRecord, DomainInfo, RecordInput } from "../../shared/types.js";
import { jsonCall } from "./http.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import { relativeName } from "./wire.js";

const API = "https://api.porkbun.com/api/json/v3";

async function call<T extends object>(
  fetch: PluginFetch,
  creds: Credentials,
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const payload = await jsonCall<T & { status?: string; message?: string }>(
    fetch,
    `${API}${path}`,
    {
      method: "POST",
      body: {
        apikey: creds.apiKey,
        secretapikey: creds.secretApiKey,
        ...body,
      },
    },
  );
  if (payload?.status !== "SUCCESS") {
    throw new ProviderError(payload?.message || "Porkbun refused the request");
  }
  return payload;
}

interface PorkRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: string;
  prio?: string | null;
  notes?: string | null;
}

function toRecord(row: PorkRecord, zone: string): DnsRecord {
  return {
    id: row.id,
    type: row.type,
    name: relativeName(row.name, zone),
    content: row.content,
    ttl: Number(row.ttl) || 600,
    priority:
      row.type === "MX" || row.type === "SRV" ? Number(row.prio ?? 0) : null,
    ...(row.notes ? { comment: row.notes } : {}),
  };
}

function toBody(input: RecordInput) {
  return {
    name: input.name === "@" ? "" : input.name,
    type: input.type,
    content: input.content,
    ttl: String(input.ttl),
    ...(input.priority != null ? { prio: String(input.priority) } : {}),
    ...(input.comment ? { notes: input.comment } : {}),
  };
}

const flag = (value: unknown) => value === "1" || value === 1 || value === true;

export const porkbun: DnsProvider = {
  id: "porkbun",
  fields: [
    { key: "apiKey", type: "text", required: true },
    { key: "secretApiKey", type: "secret", required: true },
  ],
  features: {
    types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"],
    proxied: false,
    comment: true,
    autoTtl: false,
    minTtl: 600,
    domains: true,
  },
  async zones(creds, fetch) {
    const list = await this.domains!(creds, fetch);
    return list.map((domain) => ({ id: domain.name, name: domain.name }));
  },
  async records(creds, zone, fetch) {
    const payload = await call<{ records?: PorkRecord[] }>(
      fetch,
      creds,
      `/dns/retrieve/${zone.name}`,
    );
    return (payload.records ?? []).map((row) => toRecord(row, zone.name));
  },
  async create(creds, zone, input, fetch) {
    await call(fetch, creds, `/dns/create/${zone.name}`, toBody(input));
  },
  async update(creds, zone, record, input, fetch) {
    await call(
      fetch,
      creds,
      `/dns/edit/${zone.name}/${record.id}`,
      toBody(input),
    );
  },
  async remove(creds, zone, record, fetch) {
    await call(fetch, creds, `/dns/delete/${zone.name}/${record.id}`);
  },
  async domains(creds, fetch) {
    const out: DomainInfo[] = [];
    for (let start = 0; start < 10_000; start += 1000) {
      const payload = await call<{
        domains?: Array<{
          domain: string;
          status?: string;
          expireDate?: string;
          securityLock?: unknown;
          autoRenew?: unknown;
        }>;
      }>(fetch, creds, "/domain/listAll", { start: String(start) });
      const rows = payload.domains ?? [];
      for (const row of rows) {
        out.push({
          name: row.domain.toLowerCase(),
          registrar: "porkbun",
          expiresAt: row.expireDate
            ? new Date(`${row.expireDate.replace(" ", "T")}Z`).toISOString()
            : null,
          autoRenew: flag(row.autoRenew),
          locked: flag(row.securityLock),
          nameservers: [],
          status: row.status ?? null,
        });
      }
      if (rows.length < 1000) break;
    }
    return out;
  },
};
