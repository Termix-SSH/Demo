import type {
  PluginContext,
  PluginNotificationSeverity,
} from "@termix-ssh/plugin-sdk/backend";

const SEVERITIES = ["info", "success", "warning", "critical"];

interface Unread {
  unreadCount: (userId: string) => Promise<number>;
}

function actor(ctx: PluginContext): string {
  const userId = ctx.currentActor();
  if (!userId) throw new Error("This needs a user");
  return userId;
}

/** Alerts as actions, so a rule or rollout can tell the user something. */
export function registerOperations(
  ctx: PluginContext,
  repository: Unread,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("alerts.unread", {
    run: async () => {
      const count = await repository.unreadCount(actor(ctx));
      return {
        summary: `${count} unread alerts`,
        data: {
          value: count,
          status: count ? "warn" : "ok",
          label: `${count} unread`,
        },
      };
    },
  });

  ctx.operations.register("alerts.send", {
    describe: (input) => `Would send you the alert ${String(input.title)}`,
    run: async (input) => {
      const userId = actor(ctx);
      const severity = SEVERITIES.includes(String(input.severity))
        ? (String(input.severity) as PluginNotificationSeverity)
        : "info";
      const result = await ctx.notify.send({
        title: String(input.title ?? "").slice(0, 200),
        body: input.body ? String(input.body).slice(0, 4000) : undefined,
        severity,
        category: "alerts.action",
        audience: { userId },
      });
      return { summary: "Alert sent", changed: true, data: { ...result } };
    },
  });
}
