import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { ServerKind } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import { label } from "./servers.js";
import type { WebService } from "./service.js";
import type { SummaryCache } from "./summary.js";
import { parseSiteKey } from "./validate.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

const up = (state: string) => state === "active" || state === "reloading";

/** Everything Web Servers offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: WebService,
  summary: SummaryCache,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Web Servers", 403);
    }
    return s;
  };

  /** The installed servers an action works on: one, or all of them. */
  const targets = async (hostId: number, choice: unknown) => {
    const status = await service.status(hostId, await settings(hostId, false));
    const installed = status.servers.filter((s) => s.installed);
    const picked =
      choice && choice !== "all"
        ? installed.filter((s) => s.kind === choice)
        : installed;
    if (picked.length === 0) throw new Error("No web server is installed");
    return picked;
  };

  ctx.operations.register("web-servers.status", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const status = await service.status(
        hostId,
        await settings(hostId, false),
      );
      const installed = status.servers.filter((s) => s.installed);
      const down = installed.filter((s) => !up(s.state));
      const label_ =
        installed.length === 0
          ? "No web server"
          : down.length
            ? `${down.map((s) => label(s.kind)).join(", ")} stopped`
            : "Running";
      return {
        summary: label_,
        data: {
          value: label_,
          status: installed.length === 0 ? "warn" : down.length ? "fail" : "ok",
          label: label_,
          servers: installed.map((s) => ({
            kind: s.kind,
            version: s.version,
            state: s.state,
          })),
        },
      };
    },
  });

  ctx.operations.register("web-servers.list-sites", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const sites = await service.sites(hostId, await settings(hostId, false));
      const rows = sites.map((site) => ({
        key: site.key,
        name: site.name,
        state: site.enabled ? "on" : "off",
        server: label(site.server),
        domains: site.names.join(", "),
        https: site.tls ? "yes" : "no",
      }));
      return { summary: `${rows.length} sites`, data: { rows } };
    },
  });

  ctx.operations.register("web-servers.test-config", {
    run: async (input, context) => {
      const hostId = requireHost(context);
      const s = await settings(hostId, false);
      const results = [];
      for (const server of await targets(hostId, input?.server)) {
        results.push({
          server: server.kind,
          ...(await service.test(hostId, s, server.kind)),
        });
      }
      const failed = results.filter((r) => !r.ok);
      return {
        summary: failed.length
          ? `${failed.map((r) => label(r.server)).join(", ")} config has errors`
          : "Config is fine",
        data: { results },
      };
    },
  });

  for (const action of ["reload", "restart"] as const) {
    ctx.operations.register(`web-servers.${action}`, {
      describe: (input) =>
        `Would test the config and ${action} ${input?.server && input.server !== "all" ? label(input.server as ServerKind) : "every web server"}`,
      run: async (input, context) => {
        const hostId = requireHost(context);
        const s = await settings(hostId, true);
        const outputs: string[] = [];
        try {
          for (const server of await targets(hostId, input?.server)) {
            const result = await service.act(hostId, s, server.kind, action);
            outputs.push(result.output);
          }
        } finally {
          summary.forget(hostId);
        }
        return {
          summary: action === "reload" ? "Reloaded" : "Restarted",
          changed: true,
          data: { output: outputs.join("\n").trim() },
        };
      },
    });
  }

  for (const on of [true, false]) {
    ctx.operations.register(`web-servers.${on ? "enable" : "disable"}-site`, {
      describe: (_input, context) =>
        `Would turn ${on ? "on" : "off"} ${parseSiteKey(context.resourceKey).name}`,
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const { server, name } = parseSiteKey(context.resourceKey);
        try {
          const result = await service.toggleSite(
            hostId,
            await settings(hostId, true),
            server,
            name,
            on,
          );
          return {
            summary: `Turned ${on ? "on" : "off"} ${name}`,
            changed: true,
            data: { output: result.output },
          };
        } finally {
          summary.forget(hostId);
        }
      },
    });
  }

  ctx.operations.register("web-servers.delete-site", {
    describe: (_input, context) =>
      `Would delete ${parseSiteKey(context.resourceKey).name} and keep a backup`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { server, name } = parseSiteKey(context.resourceKey);
      try {
        await service.deleteSite(
          hostId,
          await settings(hostId, true),
          server,
          name,
        );
        return { summary: `Deleted ${name}`, changed: true };
      } finally {
        summary.forget(hostId);
      }
    },
  });
}
