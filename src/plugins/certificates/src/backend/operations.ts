import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings } from "./host-settings.js";
import { parseKey } from "./scripts.js";
import type { CertService } from "./service.js";
import type { SummaryCache } from "./summary.js";
import { levelOf } from "./watches.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

/** Everything Certificates offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: CertService,
  summary: SummaryCache,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Certificates", 403);
    }
    return s;
  };

  ctx.operations.register("certificates.list", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const s = await settings(hostId, false);
      const rows = (await service.list(hostId, s)).map((cert) => ({
        key: cert.key,
        name: cert.name,
        state: levelOf(cert, s.warnDays) ?? "valid",
        client: cert.client,
        domains: cert.domains.join(", "),
        daysLeft: cert.daysLeft,
        expires: cert.expiry,
      }));
      return { summary: `${rows.length} certificates`, data: { rows } };
    },
  });

  ctx.operations.register("certificates.expiring", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const s = await settings(hostId, false);
      const result = await summary.check(hostId);
      if (result.error) throw new Error(result.error);
      const expired = result.certs.filter(
        (c) => c.daysLeft !== null && c.daysLeft < 0,
      ).length;
      const soon = result.certs.filter(
        (c) =>
          c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= s.warnDays,
      ).length;
      return {
        summary: `${expired + soon} expiring`,
        data: {
          value: expired + soon,
          status: expired > 0 ? "fail" : soon > 0 ? "warn" : "ok",
          label: expired > 0 ? `${expired} expired` : undefined,
        },
      };
    },
  });

  ctx.operations.register("certificates.renew", {
    describe: (_input, context) =>
      `Would renew ${parseKey(context.resourceKey).name}`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { client, name } = parseKey(context.resourceKey);
      try {
        const result = await service.renew(
          hostId,
          await settings(hostId, true),
          client,
          name,
        );
        return {
          summary: `Renewed ${name}`,
          changed: true,
          data: { output: result.output },
        };
      } finally {
        summary.forget(hostId);
      }
    },
  });

  ctx.operations.register("certificates.renew-all", {
    describe: () => "Would renew every certbot certificate that is due",
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const s = await settings(hostId, true);
      const status = await service.status(hostId, s);
      try {
        const outputs: string[] = [];
        if (status.certbot) {
          outputs.push(
            (await service.renew(hostId, s, "certbot", null)).output,
          );
        }
        if (status.acmesh) {
          outputs.push(
            (await service.renew(hostId, s, "acme.sh", null)).output,
          );
        }
        return {
          summary: "Renewed certificates that were due",
          changed: true,
          data: { output: outputs.join("\n") },
        };
      } finally {
        summary.forget(hostId);
      }
    },
  });

  ctx.operations.register("certificates.revoke", {
    describe: (_input, context) =>
      `Would revoke and remove ${parseKey(context.resourceKey).name}`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { client, name } = parseKey(context.resourceKey);
      try {
        await service.revoke(
          hostId,
          await settings(hostId, true),
          client,
          name,
        );
        return { summary: `Revoked ${name}`, changed: true };
      } finally {
        summary.forget(hostId);
      }
    },
  });
}
