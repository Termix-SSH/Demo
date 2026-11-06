import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type {
  CredentialField,
  DnsRecord,
  DomainInfo,
  ProviderFeatures,
  ProviderId,
  RecordInput,
  Zone,
} from "../../shared/types.js";

export type Credentials = Record<string, string>;

export interface DnsProvider {
  id: ProviderId;
  fields: CredentialField[];
  features: ProviderFeatures;
  zones: (creds: Credentials, fetch: PluginFetch) => Promise<Zone[]>;
  records: (
    creds: Credentials,
    zone: Zone,
    fetch: PluginFetch,
  ) => Promise<DnsRecord[]>;
  create: (
    creds: Credentials,
    zone: Zone,
    input: RecordInput,
    fetch: PluginFetch,
  ) => Promise<void>;
  update: (
    creds: Credentials,
    zone: Zone,
    record: DnsRecord,
    input: RecordInput,
    fetch: PluginFetch,
  ) => Promise<void>;
  remove: (
    creds: Credentials,
    zone: Zone,
    record: DnsRecord,
    fetch: PluginFetch,
  ) => Promise<void>;
  /** The registered domains this login holds, when the provider is a registrar. */
  domains?: (creds: Credentials, fetch: PluginFetch) => Promise<DomainInfo[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type { PluginFetch };
