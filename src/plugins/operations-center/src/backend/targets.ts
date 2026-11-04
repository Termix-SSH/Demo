import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { TargetSpec } from "../shared/types.js";

interface FleetsService {
  members: (
    fleetId: number,
  ) => Promise<Array<{ id: number; name: string | null; ip: string }>>;
}

export interface Target {
  hostId: number;
  hostName: string;
}

function splitTags(tags: string | null): string[] {
  return (tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseTargets(raw: unknown): TargetSpec {
  if (typeof raw === "string") {
    try {
      return parseTargets(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  const value = (raw ?? {}) as Record<string, unknown>;
  const ints = (list: unknown) =>
    Array.isArray(list)
      ? list.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
  const strings = (list: unknown) =>
    Array.isArray(list)
      ? list.filter((s): s is string => typeof s === "string" && !!s.trim())
      : [];
  return {
    hostIds: ints(value.hostIds),
    tags: strings(value.tags),
    fleetIds: ints(value.fleetIds),
  };
}

/** The hosts a spec names that the current user can see, in a stable order. */
export async function resolveTargets(
  ctx: PluginContext,
  spec: TargetSpec,
): Promise<Target[]> {
  const hosts = await ctx.hosts.list();
  const byId = new Map(hosts.map((host) => [host.id, host]));
  const picked = new Set<number>();

  for (const hostId of spec.hostIds ?? []) {
    if (byId.has(hostId)) picked.add(hostId);
  }
  if (spec.tags?.length) {
    for (const host of hosts) {
      if (splitTags(host.tags).some((tag) => spec.tags!.includes(tag))) {
        picked.add(host.id);
      }
    }
  }
  if (spec.fleetIds?.length) {
    try {
      const fleets = ctx.services.get<FleetsService>("fleets.access");
      for (const fleetId of spec.fleetIds) {
        for (const member of await fleets.members(fleetId)) {
          if (byId.has(member.id)) picked.add(member.id);
        }
      }
    } catch {
      // Fleets is off, so fleet targets match nothing.
    }
  }

  return [...picked]
    .map((hostId) => {
      const host = byId.get(hostId)!;
      return { hostId, hostName: host.name || host.ip };
    })
    .sort((a, b) => a.hostName.localeCompare(b.hostName));
}
