import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Rule } from "../shared/types.js";
import { FirewallError } from "./errors.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import type { Manager } from "./manager.js";
import { parseRuleSpec } from "./validate.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

interface PortInput {
  port: string;
  protocol: string;
  source: string;
}

function portInput(input: Record<string, unknown>): PortInput {
  return {
    port: String(input.port ?? "").trim(),
    protocol: String(input.protocol ?? "tcp"),
    source: String(input.source ?? "").trim(),
  };
}

/** An allow rule for exactly this port, protocol and source. */
function matches(rule: Rule, wanted: PortInput): boolean {
  return (
    rule.action === "allow" &&
    rule.direction === "in" &&
    rule.port === wanted.port &&
    (rule.protocol === wanted.protocol || rule.protocol === "any") &&
    (rule.source || "") === wanted.source
  );
}

/** Everything Firewall offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext, manager: Manager): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settingsFor = async (
    hostId: number,
    change: boolean,
  ): Promise<HostSettings> => {
    const settings = await readHostSettings(ctx, hostId);
    if (change && settings.readOnly) {
      throw new FirewallError("This host is read only", 403);
    }
    return settings;
  };

  const rulesOf = async (hostId: number) => {
    const settings = await settingsFor(hostId, false);
    return (await manager.status(hostId, settings, false)).rules;
  };

  ctx.operations.register("firewall.list-rules", {
    run: async (_input, context) => {
      const rows = (await rulesOf(requireHost(context))).map((rule) => ({
        id: rule.id,
        name: rule.comment || rule.raw,
        action: rule.action,
        direction: rule.direction,
        port: rule.port || rule.service || "any",
        protocol: rule.protocol,
        source: rule.source || "any",
        managed: rule.managed,
      }));
      return { summary: `${rows.length} rules`, data: { rows } };
    },
  });

  ctx.operations.register("firewall.status", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const status = await manager.status(
        hostId,
        await settingsFor(hostId, false),
        false,
      );
      const label = !status.backend
        ? "No firewall"
        : status.active
          ? `${status.backend} is on`
          : `${status.backend} is off`;
      return {
        summary: label,
        data: {
          value: status.active ? "on" : "off",
          status: status.backend && status.active ? "ok" : "warn",
          label,
        },
      };
    },
  });

  ctx.operations.register("firewall.port-allowed", {
    run: async (input, context) => {
      const wanted = portInput(input);
      const found = (await rulesOf(requireHost(context))).some((rule) =>
        matches(rule, wanted),
      );
      return {
        summary: found
          ? `Port ${wanted.port} is allowed`
          : `Port ${wanted.port} is not allowed`,
        data: { compliant: found, status: found ? "ok" : "warn" },
      };
    },
  });

  ctx.operations.register("firewall.allow-port", {
    describe: (input) => {
      const wanted = portInput(input);
      return `Would allow ${wanted.protocol} port ${wanted.port}${wanted.source ? ` from ${wanted.source}` : ""}`;
    },
    run: async (input, context) => {
      const hostId = requireHost(context);
      const wanted = portInput(input);
      if ((await rulesOf(hostId)).some((rule) => matches(rule, wanted))) {
        return {
          summary: `Port ${wanted.port} was already allowed`,
          changed: false,
        };
      }
      const spec = parseRuleSpec({
        action: "allow",
        direction: "in",
        port: wanted.port,
        protocol: wanted.protocol,
        source: wanted.source,
        comment: "Termix",
      });
      // Kept on its own once a new SSH connection still works, so a rollout
      // never waits on a person to press Keep for every host.
      const result = await manager.change(
        hostId,
        await settingsFor(hostId, true),
        { kind: "add", spec },
        { label: `allow ${wanted.port}`, autoKeep: true },
      );
      return {
        summary: `Allowed ${wanted.protocol} port ${wanted.port}`,
        changed: true,
        data: { pending: result.pending !== null },
        undoInput: { ...wanted },
      };
    },
  });

  ctx.operations.register("firewall.remove-port", {
    describe: (input) =>
      `Would remove the rule allowing port ${portInput(input).port}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      const wanted = portInput(input);
      const rule = (await rulesOf(hostId)).find(
        (candidate) => candidate.managed && matches(candidate, wanted),
      );
      if (!rule) {
        return {
          summary: `No rule allows port ${wanted.port}`,
          changed: false,
        };
      }
      await manager.change(
        hostId,
        await settingsFor(hostId, true),
        { kind: "remove", id: rule.id },
        { label: `remove ${wanted.port}`, autoKeep: true },
      );
      return {
        summary: `Removed the rule for port ${wanted.port}`,
        changed: true,
        undoInput: { ...wanted },
      };
    },
  });

  ctx.operations.register("firewall.delete-rule", {
    describe: (_input, context) => `Would delete rule ${context.resourceKey}`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const id = context.resourceKey ?? "";
      if (!id) throw new FirewallError("Pick a rule");
      await manager.change(
        hostId,
        await settingsFor(hostId, true),
        { kind: "remove", id },
        { label: "delete rule", autoKeep: true },
      );
      return { summary: "Deleted the rule", changed: true };
    },
  });
}
