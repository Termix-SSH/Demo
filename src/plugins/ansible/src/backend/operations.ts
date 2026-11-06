import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";
import type { SummaryCache } from "./summary.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** What Ansible offers to the rest of Termix: list and run playbooks. */
export function registerOperations(
  ctx: PluginContext,
  service: Service,
  summary: SummaryCache,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("ansible.list-playbooks", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { files } = await service.files(
        hostId,
        await readHostSettings(ctx, hostId),
      );
      const rows = files
        .filter((f) => f.playbook)
        .map((f) => ({ id: f.path, name: f.path }));
      return { summary: `${rows.length} playbooks`, data: { rows } };
    },
  });

  ctx.operations.register("ansible.list-runs", {
    run: async (_input, context) => {
      const rows = (await service.runs(requireHost(context))).map((run) => ({
        id: run.id,
        name: run.title,
        state: run.state,
        startedAt: new Date(run.startedAt).toISOString(),
        check: run.check ? "yes" : "no",
      }));
      return { summary: `${rows.length} runs`, data: { rows } };
    },
  });

  ctx.operations.register("ansible.failed", {
    run: async (_input, context) => {
      const result = await summary.check(requireHost(context));
      if (result.error) throw new Error(result.error);
      return {
        summary: `${result.failed} failed runs`,
        data: {
          value: result.failed,
          status: result.failed > 0 ? "warn" : "ok",
          label: result.running > 0 ? `${result.running} running` : undefined,
        },
      };
    },
  });

  ctx.operations.register("ansible.run-playbook", {
    describe: (input) =>
      `Would run ${text(input.playbook)}${input.check === false ? "" : " in check mode"}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      const settings = await readHostSettings(ctx, hostId);
      if (settings.readOnly) {
        throw new HostScriptError("This host is read only in Ansible", 403);
      }
      const run = await service.start(hostId, settings, {
        kind: "playbook",
        playbook: text(input.playbook),
        limit: text(input.limit),
        tags: text(input.tags),
        check: input.check !== false,
      });
      return {
        summary: `Started ${run.title}`,
        changed: input.check === false,
        data: { runId: run.id },
      };
    },
  });
}
