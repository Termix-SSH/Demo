import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { RequestStore } from "./store.js";
import type { AccessService } from "./access.js";
import type { Workflow } from "./workflow.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

export function registerOperations(
  ctx: PluginContext,
  store: RequestStore,
  access: AccessService,
  workflow: Workflow,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("privileged-access.request", {
    describe: (input) =>
      `Would ask for ${Number(input.hours) || 1} hours of access`,
    run: async (input, context) => {
      const row = await workflow.request({
        hostId: requireHost(context),
        hours: input.hours,
        reason: input.reason,
        ticket: input.ticket,
      });
      return {
        summary:
          row.status === "pending"
            ? `Asked for ${row.hours} hours of access to ${row.hostName}`
            : `Request ${row.id} is ${row.status}`,
        data: { id: row.id, status: row.status },
      };
    },
  });

  ctx.operations.register("privileged-access.pending", {
    run: async () => {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const pending = [];
      for (const row of await store.byStatus(["pending"])) {
        if (!(await access.approveRefusal(userId, row))) pending.push(row);
      }
      return {
        summary: `${pending.length} requests to decide`,
        data: {
          value: pending.length,
          status: pending.length ? "warn" : "ok",
          label: `${pending.length} to decide`,
          rows: pending.slice(0, 50).map((row) => ({
            id: String(row.id),
            host: row.hostName ?? String(row.hostId),
            user: row.username ?? row.userId,
            hours: row.hours,
            reason: row.reason ?? "",
          })),
        },
      };
    },
  });

  ctx.operations.register("privileged-access.status", {
    run: async (_input, context) => {
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const hostId = requireHost(context);
      const settings = await access.hostSettings(hostId);
      if (!settings.privileged) {
        return {
          summary: "Not a privileged host",
          data: { status: "ok", label: "Open" },
        };
      }
      const until = access.grantUntil(userId, hostId);
      const active = !!until && until > Date.now();
      return {
        summary: active
          ? `You have access until ${new Date(until).toISOString()}`
          : "Needs approved access",
        data: {
          status: active ? "ok" : "warn",
          label: active ? "Access approved" : "Needs approval",
        },
      };
    },
  });
}
