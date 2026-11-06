import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Reading } from "../shared/types.js";
import type { Engine } from "./engine.js";
import { UpsError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";
import type { SourceRow, Store } from "./store.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

type Status = "ok" | "warn" | "fail" | "unknown";

/** How worried to be about a reading. */
export function statusOf(
  reading: Reading | null,
  error: string,
): { status: Status; label: string } {
  if (!reading) {
    return {
      status: "unknown",
      label: error ? "Not reachable" : "No data yet",
    };
  }
  if (reading.flags.includes("low-battery")) {
    return { status: "fail", label: "Battery low" };
  }
  if (reading.flags.includes("overload")) {
    return { status: "fail", label: "Overloaded" };
  }
  if (reading.state === "battery") {
    return { status: "warn", label: "On battery" };
  }
  if (reading.flags.includes("replace-battery")) {
    return { status: "warn", label: "Replace battery" };
  }
  if (reading.state === "online") return { status: "ok", label: "On mains" };
  if (reading.state === "bypass") return { status: "warn", label: "Bypass" };
  if (reading.state === "off") return { status: "warn", label: "Off" };
  return { status: "unknown", label: "Unknown" };
}

const RANK: Record<Status, number> = { ok: 0, unknown: 1, warn: 2, fail: 3 };

const SELF_TEST = {
  quick: ["test.battery.start.quick", "test.battery.start"],
  deep: ["test.battery.start.deep", "test.battery.start"],
} as const;

/** Everything UPS Manager offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  store: Store,
  engine: Engine,
  service: Service,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const sourceId = (input: Record<string, unknown>): number | undefined => {
    const n = Number(input.source);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };

  const settingsFor = async (hostId: number, change: boolean) => {
    const settings = await readHostSettings(ctx, hostId);
    if (change && settings.readOnly) {
      throw new UpsError("This host is read only", 403);
    }
    return settings;
  };

  async function readings(
    hostId: number,
  ): Promise<
    Array<{ row: SourceRow; reading: Reading | null; error: string }>
  > {
    await settingsFor(hostId, false);
    const rows = (await store.forHost(hostId)).filter((r) => r.enabled);
    return Promise.all(
      rows.map(async (row) => {
        const state = await engine.refresh(row);
        return { row, reading: state.reading, error: state.error };
      }),
    );
  }

  ctx.operations.register("ups-manager.list", {
    run: async (_input, context) => {
      const rows = (await readings(requireHost(context))).map((r) => ({
        id: String(r.row.id),
        name: r.row.label,
        backend: r.row.backend,
        state: statusOf(r.reading, r.error).label,
        charge: r.reading?.chargePct ?? null,
        runtime: r.reading?.runtimeSec ?? null,
        load: r.reading?.loadPct ?? null,
      }));
      return { summary: `${rows.length} UPS`, data: { rows } };
    },
  });

  ctx.operations.register("ups-manager.status", {
    run: async (_input, context) => {
      const all = await readings(requireHost(context));
      if (!all.length) {
        return {
          summary: "No UPS",
          data: { value: "none", status: "unknown", label: "No UPS set up" },
        };
      }
      const worst = all
        .map((r) => statusOf(r.reading, r.error))
        .reduce((a, b) => (RANK[b.status] > RANK[a.status] ? b : a));
      return {
        summary: worst.label,
        data: { value: worst.label, status: worst.status, label: worst.label },
      };
    },
  });

  ctx.operations.register("ups-manager.charge", {
    run: async (_input, context) => {
      const all = await readings(requireHost(context));
      const values = all
        .map((r) => r.reading?.chargePct)
        .filter((v): v is number => typeof v === "number");
      if (!values.length) throw new Error("No charge reading");
      const lowest = Math.min(...values);
      return {
        summary: `${lowest}%`,
        data: {
          value: lowest,
          status: lowest <= 30 ? "fail" : lowest <= 60 ? "warn" : "ok",
        },
      };
    },
  });

  ctx.operations.register("ups-manager.runtime", {
    run: async (_input, context) => {
      const all = await readings(requireHost(context));
      const values = all
        .map((r) => r.reading?.runtimeSec)
        .filter((v): v is number => typeof v === "number");
      if (!values.length) throw new Error("No runtime reading");
      const minutes = Math.round(Math.min(...values) / 60);
      return {
        summary: `${minutes} min`,
        data: {
          value: minutes,
          status: minutes <= 5 ? "fail" : minutes <= 10 ? "warn" : "ok",
        },
      };
    },
  });

  ctx.operations.register("ups-manager.self-test", {
    describe: (input) =>
      `Would start a ${input.kind === "deep" ? "deep" : "quick"} battery self test`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await settingsFor(hostId, true);
      const row = await service.pick(hostId, sourceId(input));
      const kind = input.kind === "deep" ? "deep" : "quick";
      const result = await service.sendFirst(row, [...SELF_TEST[kind]]);
      await store.addEvent(row.id, "command", `Started ${result.command}`);
      return {
        summary: `Started a ${kind} self test`,
        changed: true,
        data: { command: result.command, output: result.output },
      };
    },
  });

  ctx.operations.register("ups-manager.beeper", {
    describe: (input) => `Would ${String(input.mode ?? "mute")} the UPS beeper`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await settingsFor(hostId, true);
      const mode = ["enable", "disable", "mute"].includes(String(input.mode))
        ? String(input.mode)
        : "mute";
      const row = await service.pick(hostId, sourceId(input));
      const result = await service.sendFirst(row, [`beeper.${mode}`]);
      await store.addEvent(row.id, "command", `Ran ${result.command}`);
      return {
        summary: `Beeper: ${mode}`,
        changed: true,
        data: { command: result.command },
      };
    },
  });

  ctx.operations.register("ups-manager.calibrate", {
    describe: () =>
      "Would start a runtime calibration, which drains the battery",
    run: async (input, context) => {
      const hostId = requireHost(context);
      await settingsFor(hostId, true);
      const row = await service.pick(hostId, sourceId(input));
      const result = await service.sendFirst(row, ["calibrate.start"]);
      await store.addEvent(row.id, "command", `Ran ${result.command}`);
      return {
        summary: "Started a calibration",
        changed: true,
        data: { command: result.command },
      };
    },
  });
}
