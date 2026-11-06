import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type { DomainInfo } from "../shared/types.js";

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, unknown, string, string]>];
}

interface RdapDomain {
  ldhName?: string;
  status?: string[];
  events?: Array<{ eventAction: string; eventDate: string }>;
  nameservers?: Array<{ ldhName?: string }>;
  entities?: RdapEntity[];
}

export const DOMAIN_NAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function cleanDomain(value: string): string | null {
  const name = value.trim().toLowerCase().replace(/\.$/, "");
  return DOMAIN_NAME.test(name) ? name : null;
}

/** Looks a domain up through the public RDAP service. */
export async function lookupDomain(
  fetch: PluginFetch,
  name: string,
): Promise<DomainInfo> {
  const response = await fetch(
    `https://rdap.org/domain/${encodeURIComponent(name)}`,
    {
      timeoutMs: 20_000,
      headers: { accept: "application/rdap+json, application/json" },
    },
  );
  if (response.status === 404) throw new Error("No registration found");
  if (!response.ok) {
    throw new Error(`The RDAP service answered ${response.status}`);
  }
  const data = (await response.json()) as RdapDomain;
  const expiry = data.events?.find((event) =>
    /expiration/i.test(event.eventAction),
  )?.eventDate;
  const registrar = data.entities
    ?.find((entity) => entity.roles?.includes("registrar"))
    ?.vcardArray?.[1]?.find((row) => row[0] === "fn")?.[3];
  const status = data.status ?? [];
  return {
    name,
    registrar: registrar ?? null,
    expiresAt: expiry ? new Date(expiry).toISOString() : null,
    autoRenew: null,
    locked: status.length
      ? status.some((s) => /transfer prohibited/i.test(s))
      : null,
    nameservers: (data.nameservers ?? [])
      .map((ns) => (ns.ldhName ?? "").toLowerCase())
      .filter(Boolean),
    status: status[0] ?? null,
  };
}
