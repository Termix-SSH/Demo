import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { AppAction, ManagerKind, ProcessRow } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import {
  cleanAppKey,
  cleanManager,
  cleanNice,
  cleanPid,
  cleanSignal,
  needsEdit,
  parseTarget,
} from "./scripts.js";
import type { ProcessService } from "./service.js";
import type { WatchStore } from "./watches.js";

type Status = "ok" | "warn" | "fail" | "unknown";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function requirePid(context: PluginOperationContext): number {
  return cleanPid(context.resourceKey);
}

function requireApp(context: PluginOperationContext): {
  manager: ManagerKind;
  key: string;
} {
  const raw = context.resourceKey ?? "";
  const i = raw.indexOf(":");
  if (i < 1) throw new HostScriptError("The app key is not valid");
  const manager = cleanManager(raw.slice(0, i));
  return { manager, key: cleanAppKey(manager, raw.slice(i + 1)) };
}

const state = (row: ProcessRow) => {
  const c = row.stat.charAt(0);
  return c === "R"
    ? "running"
    : c === "Z"
      ? "zombie"
      : c === "T" || c === "t"
        ? "stopped"
        : c === "D"
          ? "waiting"
          : "sleeping";
};

/** Everything Process Manager offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: ProcessService,
  watches: WatchStore,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError(
        "This host is read only in Process Manager",
        403,
      );
    }
    return s;
  };
  const actor = () => {
    const id = ctx.currentActor();
    if (!id) throw new HostScriptError("This needs a signed in user", 401);
    return id;
  };

  ctx.operations.register("process-manager.list-processes", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const list = await service.processes(
        hostId,
        await settings(hostId, false),
      );
      const rows = list.processes.slice(0, 300).map((p) => ({
        pid: String(p.pid),
        name: p.command,
        user: p.user,
        cpu: p.cpu,
        mem: p.mem,
        rss: p.rss * 1024,
        state: state(p),
        args: p.args,
      }));
      return { summary: `${rows.length} processes`, data: { rows } };
    },
  });

  ctx.operations.register("process-manager.list-apps", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const view = await service.managers(
        hostId,
        await settings(hostId, false),
      );
      const rows = view.apps.map((a) => ({
        id: `${a.manager}:${a.key}`,
        name: a.name,
        manager: a.manager,
        state: a.status,
        restarts: a.restarts,
        cpu: a.cpu,
        mem: a.mem,
        pid: a.pid,
      }));
      return { summary: `${rows.length} apps`, data: { rows } };
    },
  });

  for (const id of ["signal-process", "kill-process"] as const) {
    const kill = id === "kill-process";
    ctx.operations.register(`process-manager.${id}`, {
      describe: (input, context) =>
        `Would send ${kill ? "KILL" : cleanSignal(input.signal ?? "TERM")} to process ${requirePid(context)}`,
      run: async (input, context) => {
        const hostId = requireHost(context);
        const signal = kill ? "KILL" : cleanSignal(input.signal ?? "TERM");
        if (!kill && signal === "KILL") {
          throw new HostScriptError("Use Kill process for KILL");
        }
        const result = await service.signal(
          hostId,
          await settings(hostId, true),
          requirePid(context),
          signal,
          String(input.expectedCommand ?? ""),
        );
        return { summary: result.output || `Sent ${signal}`, changed: true };
      },
    });
  }

  ctx.operations.register("process-manager.renice", {
    describe: (input, context) =>
      `Would set the priority of process ${requirePid(context)} to ${cleanNice(input.nice)}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      const result = await service.renice(
        hostId,
        await settings(hostId, true),
        requirePid(context),
        cleanNice(input.nice),
        String(input.expectedCommand ?? ""),
      );
      return { summary: result.output || "Priority changed", changed: true };
    },
  });

  for (const action of ["start", "stop", "restart", "reload"] as const) {
    ctx.operations.register(`process-manager.app-${action}`, {
      describe: (_input, context) => {
        const app = requireApp(context);
        return `Would ${action} ${app.manager} app ${app.key}`;
      },
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const { manager, key } = requireApp(context);
        const result = await service.appAction(
          hostId,
          await settings(hostId, true),
          manager,
          key,
          action as AppAction,
        );
        if (!result.ok) throw new HostScriptError(result.output || "It failed");
        return {
          summary: `${action} ${key}`,
          changed: true,
          data: { output: result.output },
        };
      },
    });
  }

  for (const [id, verb] of [
    ["app-delete", "delete"],
    ["app-flush-logs", "flush"],
  ] as const) {
    ctx.operations.register(`process-manager.${id}`, {
      describe: (_input, context) => {
        const app = requireApp(context);
        return `Would ${verb} ${app.manager} app ${app.key}`;
      },
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const { manager, key } = requireApp(context);
        const result = await service.appAction(
          hostId,
          await settings(hostId, true),
          manager,
          key,
          verb,
        );
        if (!result.ok) throw new HostScriptError(result.output || "It failed");
        return { summary: `${verb} ${key}`, changed: true };
      },
    });
  }

  ctx.operations.register("process-manager.tail-logs", {
    run: async (input, context) => {
      const hostId = requireHost(context);
      const source = String(input.source ?? "journal");
      const target = parseTarget({
        kind: source,
        unit: input.target,
        key: input.target,
        pid: input.target,
        fd: input.fd,
        stream: input.stream,
      });
      if (
        needsEdit(target) &&
        !(await ctx.hosts.checkAccess(hostId, "edit")).hasAccess
      ) {
        throw new HostScriptError(
          "You need edit access to read open files",
          403,
        );
      }
      const logs = await service.logs(
        hostId,
        await settings(hostId, false),
        target,
        Number(input.lines) || 100,
        String(input.grep ?? ""),
      );
      return {
        summary: `${logs.lines} lines`,
        data: { text: logs.text.slice(-60_000) },
      };
    },
  });

  ctx.operations.register("process-manager.add-watch", {
    describe: (input) => `Would watch ${String(input.target ?? "")}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await settings(hostId, false);
      await watches.add(actor(), hostId, {
        kind: input.kind as never,
        target: String(input.target ?? ""),
        rule: (input.rule ?? "down") as never,
        threshold: Number(input.threshold) || 0,
        autoRestart: input.autoRestart === true,
      });
      return { summary: "Watch added", changed: true };
    },
  });

  ctx.operations.register("process-manager.remove-watch", {
    describe: (input) => `Would remove watch ${String(input.id ?? "")}`,
    run: async (input) => {
      const id = Number(input.id);
      if (!Number.isInteger(id)) throw new HostScriptError("Pick a watch");
      await watches.remove(actor(), id);
      return { summary: "Watch removed", changed: true };
    },
  });

  // Status tiles. Each read is one cheap host call.
  const signal = (
    id: string,
    read: (hostId: number) => Promise<{
      value: number | string;
      status: Status;
      label: string;
      items?: { label: string; status?: Status }[];
    }>,
  ) =>
    ctx.operations.register(`process-manager.${id}`, {
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const data = await read(hostId);
        return { summary: data.label, data };
      },
    });

  signal("read-zombies", async (hostId) => {
    const list = await service.processes(hostId, await settings(hostId, false));
    return {
      value: list.zombies,
      status: list.zombies > 0 ? "warn" : "ok",
      label: `${list.zombies} zombie processes`,
    };
  });

  signal("read-busy", async (hostId) => {
    const list = await service.processes(hostId, await settings(hostId, false));
    const busy = list.processes.filter((p) => p.cpu >= 50).length;
    return {
      value: busy,
      status: busy > 0 ? "warn" : "ok",
      label: `${busy} processes above 50% CPU`,
    };
  });

  signal("read-top-cpu", async (hostId) => {
    const list = await service.processes(hostId, await settings(hostId, false));
    const top = list.processes[0];
    const value = top ? Math.round(top.cpu) : 0;
    return {
      value,
      status: value >= 90 ? "fail" : value >= 60 ? "warn" : "ok",
      label: top ? `${top.command} uses ${value}% CPU` : "No processes",
    };
  });

  signal("read-top-processes", async (hostId) => {
    const list = await service.processes(hostId, await settings(hostId, false));
    const items = list.processes.slice(0, 8).map((p) => ({
      label: `${p.command} ${p.cpu.toFixed(0)}% CPU, ${p.mem.toFixed(0)}% memory`,
      status: (p.cpu >= 90 ? "warn" : "ok") as Status,
    }));
    return { value: items.length, status: "ok", label: "Top processes", items };
  });

  signal("read-apps-down", async (hostId) => {
    const view = await service.managers(hostId, await settings(hostId, false));
    const down = view.apps.filter((a) => a.health === "down");
    return {
      value: down.length,
      status: down.length > 0 ? "fail" : "ok",
      label: down.length
        ? `${down.length} apps are down`
        : `${view.apps.length} apps are running`,
      items: down.map((a) => ({
        label: `${a.name} is ${a.status}`,
        status: "fail" as Status,
      })),
    };
  });

  signal("read-managers", async (hostId) => {
    const view = await service.managers(hostId, await settings(hostId, false));
    const found = [view.pm2 ? "pm2" : "", view.supervisor ? "supervisor" : ""]
      .filter(Boolean)
      .join(", ");
    return {
      value: found || "none",
      status: found ? "ok" : "unknown",
      label: found ? `Found ${found}` : "No pm2 or supervisor",
    };
  });
}
