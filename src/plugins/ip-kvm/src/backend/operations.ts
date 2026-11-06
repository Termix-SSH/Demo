import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Device, PowerAction } from "../shared/types.js";
import type { Service } from "./service.js";

const POWER_ACTIONS: Record<string, { action: PowerAction; verb: string }> = {
  "power-on": { action: "on", verb: "turn on" },
  "graceful-shutdown": { action: "graceful-shutdown", verb: "shut down" },
  "power-off": { action: "off", verb: "cut the power of" },
  reset: { action: "reset", verb: "reset" },
};

function summary(devices: Device[]) {
  const bad = devices.filter((device) => device.status === "down");
  const label = bad.length
    ? `${bad.length} need attention`
    : `${devices.length} KVMs`;
  return {
    summary: label,
    data: {
      rows: devices.map((device) => ({
        id: String(device.id),
        name: device.name,
        type: device.driver,
        address: device.address,
        status: device.status,
        power: device.reading?.power ?? "unknown",
        signal: device.reading?.signal ?? null,
        error: device.lastError ?? "",
      })),
      options: devices.map((device) => ({
        value: String(device.id),
        label: device.name,
      })),
      value: bad.length,
      status: bad.length ? "fail" : "ok",
      label,
    },
  };
}

/** The KVM actions, so they can run from rules, the CLI and the assistant. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  // A KVM linked to a host follows that host's sharing
  const find = async (
    value: unknown,
    level: "connect" | "edit",
  ): Promise<Device> => {
    const device = await service.get(Number(value));
    if (device.hostId !== null) {
      const access = await ctx.hosts.checkAccess(device.hostId, level);
      if (!access.hasAccess)
        throw new Error("You do not have access to this host");
    }
    return device;
  };

  ctx.operations.register("ip-kvm.list-devices", {
    run: async () => summary(await service.list()),
  });

  ctx.operations.register("ip-kvm.poll", {
    run: async (input) => {
      const device = await service.poll(
        (await find(input.device, "connect")).id,
      );
      return {
        summary: `${device.name} is ${device.status}, power ${device.reading?.power ?? "unknown"}`,
        data: { status: device.status },
      };
    },
  });

  ctx.operations.register("ip-kvm.power-state", {
    run: async (input) => {
      const device = await service.poll(
        (await find(input.device, "connect")).id,
      );
      const power = device.reading?.power ?? "unknown";
      return {
        summary: `${device.name} is ${power}`,
        data: {
          value: power,
          status:
            device.status === "down"
              ? "fail"
              : power === "on"
                ? "ok"
                : power === "off"
                  ? "warn"
                  : "unknown",
          label: power,
        },
      };
    },
  });

  for (const [name, { action, verb }] of Object.entries(POWER_ACTIONS)) {
    ctx.operations.register(`ip-kvm.${name}`, {
      describe: async (input) =>
        `Would ${verb} ${(await find(input.device, "edit")).name}`,
      run: async (input) => {
        const device = await find(input.device, "edit");
        await service.power(device.id, action);
        return {
          summary: `Asked ${device.name} to ${verb.replace(" of", "")}`,
          changed: true,
        };
      },
    });
  }

  ctx.operations.register("ip-kvm.wake", {
    describe: async (input) =>
      `Would send Wake-on-LAN for ${(await find(input.device, "edit")).name}`,
    run: async (input) => {
      const device = await find(input.device, "edit");
      await service.wake(device.id);
      return {
        summary: `Sent a wake packet for ${device.name}`,
        changed: true,
      };
    },
  });

  ctx.operations.register("ip-kvm.eject-media", {
    describe: async (input) =>
      `Would eject the image on ${(await find(input.device, "edit")).name}`,
    run: async (input) => {
      const device = await find(input.device, "edit");
      await service.mediaEject(device.id);
      return { summary: `Ejected the image on ${device.name}`, changed: true };
    },
  });
}
