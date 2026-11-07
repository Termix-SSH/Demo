import type { PluginContext, SyncRow } from "@termix-ssh/plugin-sdk/backend";
import type { FleetRepository } from "./repository.js";

/** Static members travel as host syncIds, since local host ids differ per side. */
export const MEMBERS_FIELD = "memberHostSyncIds";

function syncIdsFromWire(row: SyncRow): string[] {
  const value = row[MEMBERS_FIELD];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && !!v);
}

export function registerFleetSync(
  ctx: PluginContext,
  table: unknown,
  repo: FleetRepository,
) {
  ctx.sync.registerEntity({
    type: "fleets",
    table,
    // Hosts sync at 50, so their ids resolve before fleets arrive.
    order: 60,
    permissions: {
      create: "fleets.manage",
      update: "fleets.manage",
      delete: "fleets.manage",
    },
    serialize: async (row, resolveSyncId) => {
      const hostIds = await repo.listStaticMemberIds(Number(row.id));
      const syncIds: string[] = [];
      for (const hostId of hostIds) {
        const syncId = await resolveSyncId("hosts", hostId);
        if (syncId) syncIds.push(syncId);
      }
      syncIds.sort();
      return { ...row, [MEMBERS_FIELD]: syncIds };
    },
    afterWrite: async ({ id, wire, resolveId }) => {
      if (id === null || !resolveId) return;
      const wanted = new Set<number>();
      for (const syncId of syncIdsFromWire(wire)) {
        const hostId = await resolveId("hosts", syncId);
        if (hostId !== null) wanted.add(hostId);
      }
      await repo.replaceMembers(id, [...wanted]);
    },
  });
}
