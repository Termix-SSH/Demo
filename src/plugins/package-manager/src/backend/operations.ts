import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings } from "./host-settings.js";
import { cleanNames } from "./scripts.js";
import type { PackageService } from "./service.js";
import type { SummaryCache } from "./summary.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

/** Everything Packages offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: PackageService,
  summary: SummaryCache,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Packages", 403);
    }
    return s;
  };

  ctx.operations.register("package-manager.list-updates", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const rows = (
        await service.updates(hostId, await settings(hostId, false))
      ).map((item) => ({
        name: item.name,
        state: item.security ? "security" : "update",
        current: item.current,
        available: item.available,
        repo: item.repo,
      }));
      return { summary: `${rows.length} updates`, data: { rows } };
    },
  });

  ctx.operations.register("package-manager.updates", {
    run: async (_input, context) => {
      const result = await summary.check(requireHost(context));
      if (result.error) throw new Error(result.error);
      return {
        summary: `${result.updates} updates`,
        data: {
          value: result.updates,
          status: result.security > 0 ? "warn" : "ok",
          label:
            result.security > 0
              ? `${result.security} security`
              : result.reboot
                ? "Reboot needed"
                : undefined,
        },
      };
    },
  });

  ctx.operations.register("package-manager.upgrade-all", {
    describe: () => "Would refresh the package index and upgrade every package",
    run: async (_input, context) => {
      const hostId = requireHost(context);
      try {
        const result = await service.act(
          hostId,
          await settings(hostId, true),
          "upgrade-all",
        );
        return {
          summary: "Upgraded all packages",
          changed: true,
          data: { output: result.output },
        };
      } finally {
        summary.forget(hostId);
      }
    },
  });

  for (const action of ["install", "remove"] as const) {
    ctx.operations.register(`package-manager.${action}`, {
      describe: (input) =>
        `Would ${action} ${cleanNames(String(input.package ?? "").split(/\s+/)).join(" ")}`,
      run: async (input, context) => {
        const hostId = requireHost(context);
        const names = cleanNames(String(input.package ?? "").split(/\s+/));
        try {
          const result = await service.act(
            hostId,
            await settings(hostId, true),
            action,
            names,
          );
          return {
            summary: `${action === "install" ? "Installed" : "Removed"} ${names.join(" ")}`,
            changed: true,
            data: { output: result.output },
          };
        } finally {
          summary.forget(hostId);
        }
      },
    });
  }
}
