import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Health } from "../shared/types.js";
import { openVulns } from "./conditions.js";
import { SecurityError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

const LABEL: Record<Health, string> = {
  ok: "No problems found",
  warn: "Needs attention",
  fail: "Serious problems",
  unknown: "No data yet",
};

const SEV_HEALTH = { critical: "fail", high: "warn" } as const;

/** Everything Security Center offers to the rest of Termix. */
export function registerOperations(ctx: PluginContext, service: Service): void {
  if (typeof ctx.operations?.register !== "function") return;

  const read = async (hostId: number) => {
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new SecurityError(
        "Security Center is turned off for this host",
        403,
      );
    }
    return service.fresh(hostId);
  };

  const change = async (hostId: number) => {
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new SecurityError(
        "Security Center is turned off for this host",
        403,
      );
    }
    if (settings.readOnly) {
      throw new SecurityError("This host is read only", 403);
    }
  };

  ctx.operations.register("security-center.keys", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const weak = new Set(
        state.findings
          .filter((f) => f.severity === "critical" || f.severity === "high")
          .map((f) => f.subject),
      );
      const rows = (state.reading?.keys ?? []).map((k) => ({
        id: k.id,
        name: `${k.user}: ${k.comment || k.fingerprint}`,
        kind: k.kind,
        algo: `${k.type}${k.bits ? ` ${k.bits}` : ""}`,
        owner: k.user,
        health:
          weak.has(`${k.fingerprint}@${k.path}`) || weak.has(k.path)
            ? "warn"
            : "ok",
        fingerprint: k.fingerprint,
        path: k.path,
      }));
      return { summary: `${rows.length} keys`, data: { rows } };
    },
  });

  ctx.operations.register("security-center.findings", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const rows = state.findings.map((f) => ({
        id: f.key,
        name: f.title,
        severity: f.severity,
        detail: f.detail,
      }));
      return { summary: `${rows.length} findings`, data: { rows } };
    },
  });

  ctx.operations.register("security-center.vulns", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const rows = openVulns(state.scan?.vulns ?? [])
        .slice(0, 300)
        .map((v) => ({
          id: `${v.id}|${v.package}`,
          name: v.id,
          package: `${v.package} ${v.version}`,
          fixed: v.fixed || "-",
          severity: v.severity,
          knownExploited: v.kev,
          health: v.kev
            ? "fail"
            : (SEV_HEALTH[v.severity as keyof typeof SEV_HEALTH] ?? "ok"),
        }));
      return { summary: `${rows.length} open advisories`, data: { rows } };
    },
  });

  ctx.operations.register("security-center.status", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await read(hostId);
      const check = await service.check(hostId);
      const label = LABEL[check.status];
      return {
        summary: label,
        data: {
          value: label,
          status: check.status,
          label:
            check.score === null ? label : `${label}, score ${check.score}`,
        },
      };
    },
  });

  ctx.operations.register("security-center.critical-vulns", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await read(hostId);
      const check = await service.check(hostId);
      const count = check.criticalVulns + check.knownExploited;
      return {
        summary: `${count} critical`,
        data: { value: count, status: count ? "fail" : "ok" },
      };
    },
  });

  ctx.operations.register("security-center.weak-keys", {
    run: async (_input, context) => {
      const { state } = await read(requireHost(context));
      const count = state.findings.filter(
        (f) =>
          (f.kind.startsWith("key-") || f.kind.startsWith("authkeys")) &&
          (f.severity === "critical" || f.severity === "high"),
      ).length;
      return {
        summary: `${count} key problems`,
        data: { value: count, status: count ? "warn" : "ok" },
      };
    },
  });

  ctx.operations.register("security-center.scan", {
    describe: () =>
      "Would scan the installed packages for known vulnerabilities",
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const state = await service.scanNow(hostId);
      const open = openVulns(state.scan?.vulns ?? []);
      return {
        summary: `${open.length} open advisories`,
        changed: true,
        data: { total: open.length },
      };
    },
  });

  ctx.operations.register("security-center.rotate-key", {
    describe: () => "Would replace the key Termix logs in to this host with",
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const text = await service.rotateLoginKey(hostId);
      return { summary: text, changed: true, data: { message: text } };
    },
  });

  ctx.operations.register("security-center.revoke-key", {
    describe: (input) =>
      `Would remove the key ${String(input.fingerprint ?? "")} from ${String(input.path ?? "a file")}`,
    run: async (input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const text = await service.revoke(
        hostId,
        String(input.path ?? ""),
        String(input.fingerprint ?? ""),
      );
      return { summary: text, changed: true, data: { message: text } };
    },
  });

  ctx.operations.register("security-center.rotate-host-keys", {
    describe: () =>
      "Would make new SSH host keys and reload sshd. Clients will see a changed host key",
    run: async (_input, context) => {
      const hostId = requireHost(context);
      await change(hostId);
      const text = await service.rotateHostKeys(hostId);
      return { summary: text, changed: true, data: { message: text } };
    },
  });
}
