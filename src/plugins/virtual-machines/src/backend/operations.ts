import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Inventory, PowerAction, VmRow } from "../shared/types.js";
import { VmError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { InventoryStore } from "./inventory.js";
import type { Jobs } from "./jobs.js";
import type { Target, VmProvider } from "./provider.js";
import { requireName, requireNewName, requireUuid } from "./validate.js";

export interface OperationDeps {
  provider: VmProvider;
  inventory: InventoryStore;
  jobs: Jobs;
}

const POWER: Array<[string, PowerAction, string]> = [
  ["start", "start", "Started"],
  ["reboot", "reboot", "Rebooting"],
  ["suspend", "suspend", "Suspended"],
  ["resume", "resume", "Resumed"],
  ["shutdown", "shutdown", "Shutting down"],
  ["force-stop", "stop", "Force stopped"],
];

const SNAPSHOT_KEY_SEPARATOR = "|";

export function snapshotKey(uuid: string, name: string): string {
  return `${uuid}${SNAPSHOT_KEY_SEPARATOR}${name}`;
}

function parseSnapshotKey(key: string | undefined): {
  uuid: string;
  name: string;
} {
  const text = key ?? "";
  const at = text.indexOf(SNAPSHOT_KEY_SEPARATOR);
  if (at < 0) throw new VmError("Pick a snapshot");
  return {
    uuid: requireUuid(text.slice(0, at)),
    name: requireName(text.slice(at + 1), "snapshot"),
  };
}

export function vmRow(vm: VmRow): Record<string, unknown> {
  return {
    uuid: vm.uuid,
    name: vm.name,
    state: vm.state,
    vcpus: vm.vcpus,
    memoryMib: Math.round(vm.maxMemoryKib / 1024),
    ip: vm.ips[0] ?? "",
    autostart: vm.autostart ? "yes" : "no",
  };
}

export function fullestPool(inventory: Inventory): {
  name: string;
  percent: number;
} | null {
  let best: { name: string; percent: number } | null = null;
  for (const pool of inventory.pools) {
    if (!pool.capacity) continue;
    const percent = Math.round((pool.allocation / pool.capacity) * 100);
    if (!best || percent > best.percent) best = { name: pool.name, percent };
  }
  return best;
}

/** Everything Virtual Machines offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  { provider, inventory, jobs }: OperationDeps,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const targetOf = async (
    context: PluginOperationContext,
    change: boolean,
  ): Promise<Target> => {
    if (context.hostId === undefined) throw new Error("This needs a host");
    const settings = await readHostSettings(ctx, context.hostId);
    if (change && settings.readOnly) {
      throw new VmError("This host is read only", 403);
    }
    return { hostId: context.hostId, settings };
  };
  const invFor = async (context: PluginOperationContext) =>
    inventory.get(await targetOf(context, false));
  const vmName = async (context: PluginOperationContext, uuid: string) =>
    (await invFor(context)).vms.find((vm) => vm.uuid === uuid)?.name ?? uuid;
  const uuidOf = (context: PluginOperationContext) =>
    requireUuid(context.resourceKey);

  ctx.operations.register("virtual-machines.list-vms", {
    run: async (_input, context) => {
      const rows = (await invFor(context)).vms.map(vmRow);
      return {
        summary: `${rows.length} VMs`,
        changed: false,
        data: { rows },
      };
    },
  });

  ctx.operations.register("virtual-machines.vm-state", {
    run: async (_input, context) => {
      const uuid = uuidOf(context);
      const target = await targetOf(context, false);
      const vm = (await inventory.get(target, { fresh: true })).vms.find(
        (row) => row.uuid === uuid,
      );
      if (!vm) throw new VmError("VM not found", 404);
      return {
        summary: `${vm.name} is ${vm.state}`,
        changed: false,
        data: vmRow(vm),
      };
    },
  });

  ctx.operations.register("virtual-machines.running-count", {
    run: async (_input, context) => {
      const { vms } = await invFor(context);
      const running = vms.filter((vm) => vm.state === "running").length;
      return {
        summary: `${running} of ${vms.length} running`,
        changed: false,
        data: {
          value: running,
          status: "ok",
          label: `${running} / ${vms.length}`,
        },
      };
    },
  });

  ctx.operations.register("virtual-machines.crashed-count", {
    run: async (_input, context) => {
      const crashed = (await invFor(context)).vms.filter(
        (vm) => vm.state === "crashed",
      );
      return {
        summary: `${crashed.length} crashed`,
        changed: false,
        data: {
          value: crashed.length,
          status: crashed.length ? "fail" : "ok",
          label: crashed.map((vm) => vm.name).join(", ") || "None",
        },
      };
    },
  });

  ctx.operations.register("virtual-machines.pool-usage", {
    run: async (_input, context) => {
      const pool = fullestPool(await invFor(context));
      return {
        summary: pool ? `${pool.name} is ${pool.percent}% used` : "No pools",
        changed: false,
        data: {
          value: pool?.percent ?? 0,
          status: !pool ? "unknown" : pool.percent >= 90 ? "warn" : "ok",
          label: pool ? `${pool.name} ${pool.percent}%` : "No pools",
        },
      };
    },
  });

  ctx.operations.register("virtual-machines.list-snapshots", {
    run: async (_input, context) => {
      const target = await targetOf(context, false);
      const { vms } = await inventory.get(target);
      const rows: Record<string, unknown>[] = [];
      for (const vm of vms.slice(0, 100)) {
        for (const snapshot of await provider.snapshots(target, vm.uuid)) {
          rows.push({
            key: snapshotKey(vm.uuid, snapshot.name),
            name: snapshot.name,
            vm: vm.name,
            state: snapshot.state,
            createdAt: snapshot.createdAt,
          });
        }
      }
      return {
        summary: `${rows.length} snapshots`,
        changed: false,
        data: { rows },
      };
    },
  });

  ctx.operations.register("virtual-machines.list-pools", {
    run: async (_input, context) => {
      const rows = (await invFor(context)).pools;
      return {
        summary: `${rows.length} pools`,
        changed: false,
        data: { rows },
      };
    },
  });

  ctx.operations.register("virtual-machines.list-networks", {
    run: async (_input, context) => {
      const rows = await provider.networks(await targetOf(context, false));
      return {
        summary: `${rows.length} networks`,
        changed: false,
        data: { rows },
      };
    },
  });

  for (const [id, action, verb] of POWER) {
    ctx.operations.register(`virtual-machines.${id}`, {
      describe: async (_input, context) =>
        `Would ${id.replace("-", " ")} ${await vmName(context, uuidOf(context))}`,
      run: async (_input, context) => {
        const uuid = uuidOf(context);
        const target = await targetOf(context, true);
        const name = await vmName(context, uuid);
        inventory.expect(target.hostId, uuid);
        await provider.power(target, uuid, action);
        inventory.invalidate(target.hostId);
        return {
          summary: `${verb} ${name}`,
          changed: true,
          ...(id === "start" || id === "shutdown" ? { undoInput: {} } : {}),
        };
      },
    });
  }

  ctx.operations.register("virtual-machines.set-autostart", {
    describe: async (input, context) =>
      `Would turn autostart ${input.enabled === false ? "off" : "on"} for ${await vmName(context, uuidOf(context))}`,
    run: async (input, context) => {
      const uuid = uuidOf(context);
      const target = await targetOf(context, true);
      const on = input.enabled !== false;
      await provider.autostart(target, uuid, on);
      inventory.invalidate(target.hostId);
      return { summary: `Autostart ${on ? "on" : "off"}`, changed: true };
    },
  });

  ctx.operations.register("virtual-machines.snapshot", {
    describe: async (input, context) =>
      `Would take snapshot ${String(input.name)} of ${await vmName(context, uuidOf(context))}`,
    run: async (input, context) => {
      const uuid = uuidOf(context);
      const target = await targetOf(context, true);
      const name = requireNewName(input.name, "snapshot name");
      const plan = await provider.planSnapshot(
        target,
        uuid,
        name,
        String(input.description ?? "").slice(0, 500),
      );
      const started = await jobs.start(target, "snapshot", plan);
      const job = await jobs.wait(started.id, context.signal);
      if (job.status !== "success") {
        throw new VmError(job.error || "The snapshot failed");
      }
      return {
        summary: `Took snapshot ${name}`,
        changed: true,
      };
    },
  });

  ctx.operations.register("virtual-machines.clone", {
    describe: async (input, context) =>
      `Would copy ${await vmName(context, uuidOf(context))} to a new VM called ${String(input.name)}`,
    run: async (input, context) => {
      const uuid = uuidOf(context);
      const target = await targetOf(context, true);
      const name = requireNewName(input.name, "VM name");
      const job = await jobs.start(
        target,
        "clone",
        await provider.planClone(target, uuid, name),
      );
      return {
        summary: `Cloning to ${name}`,
        changed: true,
        data: { jobId: job.id },
      };
    },
  });

  ctx.operations.register("virtual-machines.revert-snapshot", {
    describe: (_input, context) => {
      const { name } = parseSnapshotKey(context.resourceKey);
      return `Would put the VM back to snapshot ${name}. Anything since then is lost.`;
    },
    run: async (_input, context) => {
      const { uuid, name } = parseSnapshotKey(context.resourceKey);
      const target = await targetOf(context, true);
      inventory.expect(target.hostId, uuid);
      await provider.revertSnapshot(target, uuid, name);
      inventory.invalidate(target.hostId);
      return { summary: `Reverted to ${name}`, changed: true };
    },
  });

  ctx.operations.register("virtual-machines.delete-snapshot", {
    describe: (_input, context) =>
      `Would delete snapshot ${parseSnapshotKey(context.resourceKey).name}`,
    run: async (_input, context) => {
      const { uuid, name } = parseSnapshotKey(context.resourceKey);
      await provider.deleteSnapshot(await targetOf(context, true), uuid, name);
      return { summary: `Deleted snapshot ${name}`, changed: true };
    },
  });

  ctx.operations.register("virtual-machines.delete-vm", {
    describe: async (input, context) =>
      `Would delete ${await vmName(context, uuidOf(context))}${input.deleteDisks === true ? " and its disks" : ", keeping its disks"}`,
    run: async (input, context) => {
      const uuid = uuidOf(context);
      const target = await targetOf(context, true);
      const name = await vmName(context, uuid);
      inventory.expect(target.hostId, uuid);
      const result = await provider.remove(
        target,
        uuid,
        input.deleteDisks === true,
      );
      inventory.invalidate(target.hostId);
      return {
        summary: `Deleted ${name}`,
        changed: true,
        data: result,
      };
    },
  });
}
