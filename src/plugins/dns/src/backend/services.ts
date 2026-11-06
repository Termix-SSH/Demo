import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { relative } from "./records.js";
import type { DnsService } from "./service.js";

/** A record another plugin put in a zone, so it can take it out again. */
export interface DnsRecordHandle {
  accountId: number;
  zoneId: string;
  name: string;
  type: string;
  content: string;
}

export interface DnsRecordsV1 {
  /** The zone that holds a host name, or null when no login has one. */
  findZone: (
    fqdn: string,
  ) => Promise<{ accountId: number; zoneId: string; zoneName: string } | null>;
  /** Adds the record if it is not there. Name is a full host name. */
  setRecord: (input: {
    name: string;
    type: string;
    content: string;
    ttl?: number;
  }) => Promise<DnsRecordHandle>;
  removeRecord: (handle: DnsRecordHandle) => Promise<void>;
}

/** The service other plugins use for DNS challenges and the like. */
export function registerServices(
  ctx: PluginContext,
  service: DnsService,
): void {
  if (typeof ctx.services?.provide !== "function") return;
  ctx.services.provide<DnsRecordsV1>("dns.records", {
    async findZone(fqdn) {
      const zone = await service.zoneFor(fqdn);
      return zone
        ? { accountId: zone.accountId, zoneId: zone.id, zoneName: zone.name }
        : null;
    },
    async setRecord(input) {
      const zone = await service.zoneFor(input.name);
      if (!zone) throw new Error(`No DNS zone holds ${input.name}`);
      const name = relative(input.name, zone.name);
      const type = input.type.toUpperCase();
      const existing = (
        await service.records(zone.accountId, zone.id, true)
      ).find(
        (record) =>
          record.type === type &&
          record.name === name &&
          record.content === input.content,
      );
      if (!existing) {
        await service.saveRecord(zone.accountId, zone.id, {
          type,
          name,
          content: input.content,
          ttl: input.ttl ?? 120,
        });
      }
      return {
        accountId: zone.accountId,
        zoneId: zone.id,
        name,
        type,
        content: input.content,
      };
    },
    async removeRecord(handle) {
      const found = (
        await service.records(handle.accountId, handle.zoneId, true)
      ).find(
        (record) =>
          record.type === handle.type &&
          record.name === handle.name &&
          record.content === handle.content,
      );
      if (found) {
        await service.deleteRecord(handle.accountId, handle.zoneId, found.id);
      }
    },
  });
}
