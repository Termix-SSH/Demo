import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Device } from "../shared/types.js";
import type { Service } from "./service.js";

function summary(devices: Device[]) {
  const down = devices.filter((device) => device.status === "down");
  const label = down.length
    ? `${down.length} down`
    : `${devices.length} devices`;
  return {
    summary: label,
    data: {
      rows: devices.map((device) => ({
        id: String(device.id),
        name: device.name,
        type: device.driver,
        address: device.address,
        status: device.status,
        uptime: device.snapshot?.info?.uptimeSec ?? "",
        error: device.lastError ?? "",
      })),
      options: devices.map((device) => ({
        value: String(device.id),
        label: device.name,
      })),
      value: down.length,
      status: down.length ? "fail" : "ok",
      label,
    },
  };
}

/** The device actions, so they can run from rules, the CLI and the assistant. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  const find = async (value: unknown): Promise<Device> =>
    service.get(Number(value));
  const portName = async (device: Device, portId: unknown) => {
    const port = device.snapshot?.ports.find(
      (item) => item.id === String(portId),
    );
    return port?.name ?? String(portId);
  };

  ctx.operations.register("network-devices.list-devices", {
    run: async () => summary(await service.list()),
  });

  ctx.operations.register("network-devices.list-ports", {
    run: async (input) => {
      const device = await find(input.device);
      const ports = device.snapshot?.ports ?? [];
      return {
        summary: `${device.name}: ${ports.filter((port) => port.up).length} of ${ports.length} ports up`,
        data: {
          rows: ports.map((port) => ({
            id: port.id,
            name: port.name,
            link: port.up ? "up" : "down",
            speed: port.speedMbps ?? "",
            vlan: port.vlan ?? "",
          })),
        },
      };
    },
  });

  ctx.operations.register("network-devices.poll", {
    run: async (input) => {
      const device = await service.poll(Number((await find(input.device)).id));
      return {
        summary: `${device.name} is ${device.status}`,
        data: { status: device.status },
      };
    },
  });

  ctx.operations.register("network-devices.set-port", {
    describe: async (input) => {
      const device = await find(input.device);
      return `Would turn ${device.name} port ${await portName(device, input.port)} ${input.state === "down" ? "off" : "on"}`;
    },
    run: async (input) => {
      const device = await find(input.device);
      const up = input.state !== "down";
      await service.setPort(device.id, String(input.port), up);
      return {
        summary: `${device.name} port ${await portName(device, input.port)} turned ${up ? "on" : "off"}`,
        changed: true,
      };
    },
  });

  ctx.operations.register("network-devices.poe-cycle", {
    describe: async (input) => {
      const device = await find(input.device);
      return `Would power cycle PoE on ${device.name} port ${await portName(device, input.port)}`;
    },
    run: async (input) => {
      const device = await find(input.device);
      await service.poeCycle(device.id, String(input.port));
      return {
        summary: `PoE cycled on ${device.name} port ${await portName(device, input.port)}`,
        changed: true,
      };
    },
  });

  ctx.operations.register("network-devices.reboot", {
    describe: async (input) =>
      `Would restart ${(await find(input.device)).name}`,
    run: async (input) => {
      const device = await find(input.device);
      await service.reboot(device.id);
      return { summary: `Restarting ${device.name}`, changed: true };
    },
  });
}
