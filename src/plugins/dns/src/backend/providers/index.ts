import type { ProviderId, ProviderInfo } from "../../shared/types.js";
import { cloudflare } from "./cloudflare.js";
import { digitalocean } from "./digitalocean.js";
import { gandi } from "./gandi.js";
import { godaddy } from "./godaddy.js";
import { hetzner } from "./hetzner.js";
import { namecheap } from "./namecheap.js";
import { porkbun } from "./porkbun.js";
import { route53 } from "./route53.js";
import type { DnsProvider } from "./types.js";

export const providers: DnsProvider[] = [
  cloudflare,
  route53,
  digitalocean,
  hetzner,
  namecheap,
  godaddy,
  porkbun,
  gandi,
];

export function getProvider(id: string): DnsProvider | undefined {
  return providers.find((provider) => provider.id === id);
}

export function providerInfo(): ProviderInfo[] {
  return providers.map((provider) => ({
    id: provider.id as ProviderId,
    fields: provider.fields,
    features: provider.features,
  }));
}

export { ProviderError } from "./types.js";
export type { Credentials, DnsProvider } from "./types.js";
