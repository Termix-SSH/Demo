import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { MonitorStatus, MonitorView } from "../shared/types.js";
import type { UptimeEngine } from "./engine.js";
import { worst, type MonitorService } from "./service.js";

const SIGNAL_STATUS: Record<MonitorStatus, "ok" | "warn" | "fail" | "unknown"> =
  {
    up: "ok",
    down: "fail",
    pending: "warn",
    maintenance: "ok",
    paused: "unknown",
    unknown: "unknown",
  };

function hostOf(context: { hostId?: number }): number {
  if (!context.hostId) throw new Error("This action needs a host");
  return context.hostId;
}

function row(view: MonitorView) {
  return {
    id: view.key,
    name: view.name,
    type: view.type,
    status: view.status,
    uptime: view.uptime.month,
    latency: view.latencyMs,
    message: view.message,
  };
}

export function registerOperations(
  ctx: PluginContext,
  monitors: MonitorService,
  engine: UptimeEngine,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const find = async (key: unknown, level: "view" | "edit") => {
    const entry = engine.byKey(String(key));
    if (!entry) throw new Error("Monitor not found");
    await monitors.need(entry.row.id, level);
    return entry;
  };

  ctx.operations.register("uptime.summary", {
    run: async () => {
      const summary = await monitors.summary();
      return {
        summary: `${summary.up} up, ${summary.down} down of ${summary.total}`,
        data: {
          ...summary,
          down_monitors: (await monitors.list())
            .filter((view) => view.status === "down")
            .map((view) => ({ name: view.name, message: view.message })),
        },
      };
    },
  });

  ctx.operations.register("uptime.monitors", {
    run: async () => {
      const rows = (await monitors.list()).map(row);
      return { summary: `${rows.length} monitors`, data: { rows } };
    },
  });

  ctx.operations.register("uptime.host-monitors", {
    run: async (_input, context) => {
      const rows = (await monitors.hostViews(hostOf(context))).map(row);
      return { summary: `${rows.length} monitors`, data: { rows } };
    },
  });

  ctx.operations.register("uptime.host-health", {
    run: async (_input, context) => {
      const views = await monitors.hostViews(hostOf(context));
      if (views.length === 0) {
        return {
          summary: "No monitors",
          data: { value: null, status: "unknown", label: "No monitors" },
        };
      }
      const status = worst(views.map((view) => view.status));
      const down = views.filter((view) => view.status === "down").length;
      const label = down ? `${down} down` : `${views.length} monitors`;
      return {
        summary: label,
        data: {
          value: views.length - down,
          status: SIGNAL_STATUS[status],
          label,
          items: views.map((view) => ({
            label: view.name,
            status: SIGNAL_STATUS[view.status],
          })),
          link: { tab: "uptime" },
        },
      };
    },
  });

  ctx.operations.register("uptime.run", {
    run: async (input) => {
      const entry = await find(input.monitor, "view");
      if (entry.row.type === "push") {
        return { summary: "A push monitor waits for its URL to be called" };
      }
      await engine.runNow(entry.row.id);
      return {
        summary: `${entry.row.name}: ${entry.state.status}. ${entry.state.message}`,
        data: { status: entry.state.status, latency: entry.state.latencyMs },
      };
    },
  });

  ctx.operations.register("uptime.pause", {
    describe: (input) => `Would pause monitor ${input.monitor}`,
    run: async (input) => {
      const entry = await find(input.monitor, "edit");
      await monitors.applyPause(entry.row.id, true, null);
      return {
        summary: `Paused ${entry.row.name}`,
        changed: true,
        undoInput: { monitor: input.monitor },
      };
    },
  });

  ctx.operations.register("uptime.resume", {
    describe: (input) => `Would resume monitor ${input.monitor}`,
    run: async (input) => {
      const entry = await find(input.monitor, "edit");
      await monitors.applyPause(entry.row.id, false, null);
      return {
        summary: `Resumed ${entry.row.name}`,
        changed: true,
        undoInput: { monitor: input.monitor },
      };
    },
  });

  ctx.operations.register("uptime.add-host", {
    describe: () => "Would add a monitor for this host",
    run: async (_input, context) => {
      const added = await monitors.addHosts([hostOf(context)]);
      return {
        summary: added ? "Added a monitor" : "This host already has one",
        changed: added > 0,
      };
    },
  });
}
