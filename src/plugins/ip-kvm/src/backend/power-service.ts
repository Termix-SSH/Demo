import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { PowerAction, PowerState } from "../shared/types.js";
import { ServiceError, type Service } from "./service.js";

/** What other plugins get from `ip-kvm.power`. They pass a Termix host id. */
export interface IpKvmPowerV1 {
  /** Whether a KVM that can switch power is linked to this host. */
  has: (hostId: number) => Promise<boolean>;
  state: (hostId: number) => Promise<PowerState>;
  set: (hostId: number, action: PowerAction) => Promise<void>;
}

export function createPowerService(
  ctx: PluginContext,
  service: Service,
): IpKvmPowerV1 {
  // The caller needs the same host access as the Power tab
  const device = async (hostId: number, level: "connect" | "edit") => {
    const access = await ctx.hosts.checkAccess(hostId, level);
    const found = access.hasAccess ? await service.byHost(hostId) : null;
    if (!found) throw new ServiceError("No KVM is linked to this host", 404);
    return found;
  };
  return {
    has: async (hostId) => {
      const access = await ctx.hosts.checkAccess(hostId, "connect");
      const found = access.hasAccess ? await service.byHost(hostId) : null;
      return !!found && found.driver !== "jetkvm";
    },
    state: async (hostId) =>
      (await service.poll((await device(hostId, "connect")).id)).reading
        ?.power ?? "unknown",
    set: async (hostId, action) =>
      service.power((await device(hostId, "edit")).id, action),
  };
}
