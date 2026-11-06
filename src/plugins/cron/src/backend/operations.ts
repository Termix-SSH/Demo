import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { describeSchedule } from "../shared/schedule.js";
import { readHostSettings } from "./host-settings.js";
import type { CronService } from "./service.js";
import type { SummaryCache } from "./summary.js";

const ID_RE = /^[0-9a-f]{8}(-\d+)?$/;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function requireJob(context: PluginOperationContext): string {
  const id = context.resourceKey ?? "";
  if (!ID_RE.test(id)) throw new Error("Invalid job id");
  return id;
}

/**
 * Everything Cron offers to the rest of Termix. Actions work on the login
 * user's own crontab.
 */
export function registerOperations(
  ctx: PluginContext,
  service: CronService,
  summary: SummaryCache,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Cron", 403);
    }
    return s;
  };

  ctx.operations.register("cron.list-jobs", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const tab = await service.crontab(
        hostId,
        await settings(hostId, false),
        "",
      );
      const rows = tab.jobs.map((job) => ({
        id: job.id,
        name: job.label || job.command,
        state: job.enabled ? "on" : "off",
        schedule: job.schedule,
        summary: describeSchedule(job.schedule).key,
        command: job.command,
      }));
      return { summary: `${rows.length} jobs`, data: { rows } };
    },
  });

  ctx.operations.register("cron.status", {
    run: async (_input, context) => {
      const result = await summary.check(requireHost(context));
      if (result.error) throw new Error(result.error);
      const down = result.installed && !result.running;
      return {
        summary: down ? "Cron is not running" : "Cron is running",
        data: {
          value: result.jobs,
          status: !result.installed ? "unknown" : down ? "fail" : "ok",
          label: !result.installed
            ? "Not installed"
            : down
              ? "Stopped"
              : result.disabled > 0
                ? `${result.disabled} off`
                : undefined,
        },
      };
    },
  });

  for (const [id, enabled] of [
    ["cron.enable", true],
    ["cron.disable", false],
  ] as const) {
    ctx.operations.register(id, {
      describe: (_input, context) =>
        `Would turn ${enabled ? "on" : "off"} job ${requireJob(context)}`,
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const job = requireJob(context);
        await service.setEnabled(
          hostId,
          await settings(hostId, true),
          "",
          job,
          enabled,
        );
        return {
          summary: `Job turned ${enabled ? "on" : "off"}`,
          changed: true,
        };
      },
    });
  }

  ctx.operations.register("cron.run-now", {
    describe: (_input, context) => `Would run job ${requireJob(context)} now`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const result = await service.runNow(
        hostId,
        await settings(hostId, true),
        "",
        requireJob(context),
      );
      return {
        summary:
          result.code === 0
            ? "The job ran"
            : `The job exited with ${result.code}`,
        changed: true,
        data: { output: result.output, code: result.code },
      };
    },
  });

  ctx.operations.register("cron.delete", {
    describe: (_input, context) => `Would delete job ${requireJob(context)}`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await service.remove(
        hostId,
        await settings(hostId, true),
        "",
        requireJob(context),
      );
      return { summary: "Job deleted", changed: true };
    },
  });
}
