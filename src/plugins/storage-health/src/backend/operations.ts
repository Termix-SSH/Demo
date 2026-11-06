import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Health, Reading } from "../shared/types.js";
import { overall } from "./conditions.js";
import { StorageError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

const LABEL: Record<Health, string> = {
  ok: "All healthy",
  warn: "Needs attention",
  fail: "Failing",
  unknown: "No data yet",
};

export function statusOf(reading: Reading | null, error: string) {
  if (!reading) {
    return {
      status: "unknown" as Health,
      label: error ? "Not reachable" : LABEL.unknown,
    };
  }
  const status = overall(reading);
  return { status, label: LABEL[status] };
}

/** Everything Storage Health offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  const read = async (hostId: number) => {
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new StorageError("Storage Health is turned off for this host", 403);
    }
    return service.fresh(hostId);
  };

  const change = async (hostId: number) => {
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new StorageError("Storage Health is turned off for this host", 403);
    }
    if (settings.readOnly) {
      throw new StorageError("This host is read only", 403);
    }
  };

  ctx.operations.register("storage-health.devices", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const rows = (state.reading?.devices ?? []).map((d) => ({
        id: d.id,
        name: d.model ? `${d.id} (${d.model})` : d.id,
        health: d.health,
        kind: d.kind,
        temp: d.tempC,
        wear: d.wearPct,
        hours: d.powerOnHours,
        test: d.selfTest,
      }));
      return { summary: `${rows.length} drives`, data: { rows } };
    },
  });

  ctx.operations.register("storage-health.pools", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const reading = state.reading;
      const rows = [
        ...(reading?.pools ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          kind: "zfs",
          health: p.health,
          state: p.state,
          detail: p.scan,
        })),
        ...(reading?.arrays ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.level || "md",
          health: a.health,
          state: `${a.active}/${a.total} ${a.state}`,
          detail: a.syncAction
            ? `${a.syncAction} ${a.syncPct ?? ""}%`.trim()
            : "",
        })),
        ...(reading?.btrfs ?? []).map((b) => ({
          id: b.id,
          name: b.mount,
          kind: "btrfs",
          health: b.health,
          state: b.errors ? `${b.errors} errors` : "ok",
          detail: b.scrub,
        })),
        ...(reading?.groups ?? []).flatMap((g) =>
          g.thin.map((t) => ({
            id: `${g.id}/${t.name}`,
            name: `${g.name}/${t.name}`,
            kind: "lvm thin",
            health: g.health,
            state: `${t.dataPct ?? "?"}% data`,
            detail: `${t.metaPct ?? "?"}% metadata`,
          })),
        ),
      ];
      return { summary: `${rows.length} pools and arrays`, data: { rows } };
    },
  });

  ctx.operations.register("storage-health.status", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const { status, label } = statusOf(state.reading, state.error);
      const problems = [...state.active].length;
      return {
        summary: label,
        data: {
          value: label,
          status,
          label: problems ? `${label}, ${problems} open` : label,
        },
      };
    },
  });

  ctx.operations.register("storage-health.temperature", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const temps = (state.reading?.devices ?? [])
        .map((d) => d.tempC)
        .filter((t): t is number => typeof t === "number");
      if (!temps.length) throw new Error("No temperature reading");
      const hottest = Math.max(...temps);
      return {
        summary: `${hottest} C`,
        data: {
          value: hottest,
          status: hottest >= 65 ? "fail" : hottest >= 50 ? "warn" : "ok",
        },
      };
    },
  });

  ctx.operations.register("storage-health.selftest", {
    describe: (input) =>
      `Would ${input.action === "abort" ? "stop the self test on" : `start a ${input.action === "long" ? "long" : "short"} self test on`} ${String(input.device ?? "a drive")}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const action =
        input.action === "long" || input.action === "abort"
          ? input.action
          : "short";
      const text = await service.selfTest(
        hostId,
        String(input.device ?? ""),
        action,
      );
      return { summary: text, changed: true, data: { message: text } };
    },
  });

  ctx.operations.register("storage-health.scrub", {
    describe: (input) =>
      `Would ${input.stop === true ? "stop" : "start"} a scrub on ${String(input.target ?? "a pool")}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const text = await service.scrub(
        hostId,
        String(input.target ?? ""),
        input.stop === true,
      );
      return { summary: text, changed: true, data: { message: text } };
    },
  });
}
