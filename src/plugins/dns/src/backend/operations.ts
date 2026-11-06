import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { DnsService } from "./service.js";

/** A zone value looks like "<account id>:<zone id>". */
export function parseZone(value: unknown): {
  accountId: number;
  zoneId: string;
} {
  const text = String(value ?? "");
  const cut = text.indexOf(":");
  const accountId = Number(text.slice(0, cut));
  const zoneId = text.slice(cut + 1);
  if (cut < 1 || !Number.isInteger(accountId) || !zoneId) {
    throw new Error("Pick a zone");
  }
  return { accountId, zoneId };
}

/** DNS as actions, so the assistant, rules and the CLI can use it. */
export function registerOperations(
  ctx: PluginContext,
  service: DnsService,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("dns.list-zones", {
    run: async () => {
      const { zones, errors } = await service.zones();
      return {
        summary: `${zones.length} zones`,
        data: {
          rows: zones.map((zone) => ({
            id: `${zone.accountId}:${zone.id}`,
            name: zone.name,
            account: zone.accountName,
            provider: zone.provider,
          })),
          options: zones.map((zone) => ({
            value: `${zone.accountId}:${zone.id}`,
            label: `${zone.name} (${zone.accountName})`,
          })),
          errors: errors.map((item) => `${item.name}: ${item.error}`),
        },
      };
    },
  });

  ctx.operations.register("dns.list-records", {
    run: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const records = await service.records(accountId, zoneId);
      return {
        summary: `${records.length} records`,
        data: {
          rows: records.map((record) => ({
            id: record.id,
            type: record.type,
            name: record.name,
            value: record.content,
            ttl: record.ttl,
          })),
        },
      };
    },
  });

  ctx.operations.register("dns.list-domains", {
    run: async () => {
      const rows = await service.domains();
      const soon = rows.filter(
        (row) => row.daysLeft !== null && row.daysLeft <= 30,
      );
      const expired = soon.filter((row) => (row.daysLeft ?? 0) < 0).length;
      const label = soon.length
        ? `${soon.length} expiring soon`
        : `${rows.length} domains`;
      return {
        summary: label,
        data: {
          rows: rows.map((row) => ({
            id: String(row.id),
            name: row.name,
            registrar: row.registrar ?? "",
            expires: row.expiresAt ?? "",
            daysLeft: row.daysLeft ?? "",
            autoRenew: row.autoRenew === null ? "" : String(row.autoRenew),
          })),
          value: soon.length,
          status: expired ? "fail" : soon.length ? "warn" : "ok",
          label,
        },
      };
    },
  });

  ctx.operations.register("dns.check-zone", {
    run: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const report = await service.health(accountId, zoneId);
      const failed = report.checks.filter((check) => check.level === "fail");
      const warned = report.checks.filter((check) => check.level === "warn");
      return {
        summary: `${report.zoneName}: ${failed.length} failing, ${warned.length} warnings`,
        data: { ...report },
      };
    },
  });

  ctx.operations.register("dns.upsert-record", {
    describe: async (input) => {
      return `Would set ${input.type} ${input.name} to ${input.content}`;
    },
    run: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const type = String(input.type ?? "").toUpperCase();
      const name = String(input.name ?? "@");
      const records = await service.records(accountId, zoneId, true);
      const same = records.find(
        (record) =>
          record.type === type &&
          (record.name === name || (name === "" && record.name === "@")) &&
          !["MX", "TXT", "NS", "SRV", "CAA"].includes(type),
      );
      await service.saveRecord(
        accountId,
        zoneId,
        {
          type,
          name,
          content: String(input.content ?? ""),
          ttl: Number(input.ttl ?? same?.ttl ?? 300),
          priority:
            input.priority === undefined ? undefined : Number(input.priority),
        },
        same?.id,
      );
      return {
        summary: `${same ? "Updated" : "Added"} ${type} ${name}`,
        changed: true,
      };
    },
  });

  ctx.operations.register("dns.delete-record", {
    describe: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const records = await service.records(accountId, zoneId);
      const hits = matching(records, input);
      return `Would delete ${hits.length} ${String(input.type).toUpperCase()} record(s) named ${input.name}`;
    },
    run: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const records = await service.records(accountId, zoneId, true);
      const hits = matching(records, input);
      if (hits.length === 0) throw new Error("No record matches");
      for (const hit of hits) {
        await service.deleteRecord(accountId, zoneId, hit.id);
      }
      return { summary: `Deleted ${hits.length} record(s)`, changed: true };
    },
  });

  ctx.operations.register("dns.snapshot-zone", {
    describe: async (input) => {
      parseZone(input.zone);
      return "Would save a copy of the zone records";
    },
    run: async (input) => {
      const { accountId, zoneId } = parseZone(input.zone);
      const snap = await service.takeSnapshot(
        accountId,
        zoneId,
        String(input.label || "From an action"),
        "manual",
      );
      return {
        summary: `Saved ${snap.recordCount} records`,
        changed: true,
        data: { ...snap },
      };
    },
  });

  ctx.operations.register("dns.sync-links", {
    describe: async () => "Would update every linked record now",
    run: async () => {
      await service.runLinks("all");
      const links = await service.links();
      const failing = links.filter((link) => link.lastError).length;
      return {
        summary: failing
          ? `${links.length} links, ${failing} failing`
          : `${links.length} links updated`,
        changed: true,
      };
    },
  });
}

function matching(
  records: Array<{ id: string; type: string; name: string; content: string }>,
  input: Record<string, unknown>,
) {
  const type = String(input.type ?? "").toUpperCase();
  const name = String(input.name ?? "");
  const content = input.content ? String(input.content) : null;
  return records.filter(
    (record) =>
      record.type === type &&
      record.name === (name === "" ? "@" : name) &&
      (content === null || record.content === content),
  );
}
