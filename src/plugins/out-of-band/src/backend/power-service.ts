import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { PowerAction, PowerState } from "../shared/types.js";
import { ServiceError, type Service } from "./service.js";

/** What other plugins get from `out-of-band.power`. They pass a Termix host id. */
export interface OutOfBandPowerV1 {
  /** Whether a BMC is linked to this host. */
  has: (hostId: number) => Promise<boolean>;
  state: (hostId: number) => Promise<PowerState>;
  set: (hostId: number, action: PowerAction) => Promise<void>;
}

export function createPowerService(
  ctx: PluginContext,
  service: Service,
): OutOfBandPowerV1 {
  // The caller needs the same host access as the Power tab
  const device = async (hostId: number, level: "connect" | "edit") => {
    const access = await ctx.hosts.checkAccess(hostId, level);
    const found = access.hasAccess ? await service.byHost(hostId) : null;
    if (!found) throw new ServiceError("No BMC is linked to this host", 404);
    return found;
  };
  return {
    has: async (hostId) => {
      const access = await ctx.hosts.checkAccess(hostId, "connect");
      return access.hasAccess && (await service.byHost(hostId)) !== null;
    },
    state: async (hostId) =>
      (await service.poll((await device(hostId, "connect")).id)).reading
        ?.power ?? "unknown",
    set: async (hostId, action) =>
      service.power((await device(hostId, "edit")).id, action),
  };
}
