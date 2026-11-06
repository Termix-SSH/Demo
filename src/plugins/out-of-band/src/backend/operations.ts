import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { BootTarget, Device, PowerAction } from "../shared/types.js";
import type { Service } from "./service.js";

const POWER_ACTIONS: Record<string, { action: PowerAction; verb: string }> = {
  "power-on": { action: "on", verb: "turn on" },
  "graceful-shutdown": { action: "graceful-shutdown", verb: "shut down" },
  "power-off": { action: "off", verb: "cut the power of" },
  "power-cycle": { action: "cycle", verb: "power cycle" },
  reset: { action: "reset", verb: "reset" },
};

function summary(devices: Device[]) {
  const bad = devices.filter(
    (device) =>
      device.status === "down" ||
      device.reading?.health === "critical" ||
      device.reading?.health === "warning",
  );
  const label = bad.length
    ? `${bad.length} need attention`
    : `${devices.length} BMCs`;
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
        health: device.reading?.health ?? "unknown",
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

/** The BMC actions, so they can run from rules, the CLI and the assistant. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  // A BMC linked to a host follows that host's sharing
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

  ctx.operations.register("out-of-band.list-devices", {
    run: async () => summary(await service.list()),
  });

  ctx.operations.register("out-of-band.poll", {
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

  ctx.operations.register("out-of-band.power-state", {
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
    ctx.operations.register(`out-of-band.${name}`, {
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

  ctx.operations.register("out-of-band.set-boot-once", {
    describe: async (input) =>
      `Would boot ${(await find(input.device, "edit")).name} from ${String(input.boot)} next time`,
    run: async (input) => {
      const device = await find(input.device, "edit");
      await service.bootOnce(
        device.id,
        String(input.boot) as BootTarget,
        input.uefi !== false,
      );
      return {
        summary: `${device.name} boots from ${String(input.boot)} next time`,
        changed: true,
      };
    },
  });

  ctx.operations.register("out-of-band.clear-log", {
    describe: async (input) =>
      `Would clear the hardware event log of ${(await find(input.device, "edit")).name}`,
    run: async (input) => {
      const device = await find(input.device, "edit");
      await service.clearLog(device.id);
      return {
        summary: `Cleared the event log of ${device.name}`,
        changed: true,
      };
    },
  });
}
