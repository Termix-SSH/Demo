import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { AcmeRunner } from "./runner.js";

const DAY_MS = 86_400_000;
const WARN_DAYS = 14;
const FAIL_DAYS = 3;

/** Days left on a certificate that ends at notAfter. */
export function daysLeft(notAfter: string, now = Date.now()): number {
  return Math.floor((Date.parse(notAfter) - now) / DAY_MS);
}

/** Everything ACME Certificates offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  runner: AcmeRunner,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("acme-ssl.certificate", {
    run: async () => {
      const tls = await ctx.system.tlsStatus();
      const cert = tls.certificate;
      if (!tls.enabled || !cert) {
        return {
          summary: "No HTTPS certificate",
          data: { status: "unknown", label: "No HTTPS certificate" },
        };
      }
      const days = daysLeft(cert.notAfter);
      const label =
        days < 0 ? "Expired" : `Expires in ${days} day${days === 1 ? "" : "s"}`;
      return {
        summary: label,
        data: {
          value: days,
          status:
            days <= FAIL_DAYS ? "fail" : days <= WARN_DAYS ? "warn" : "ok",
          label,
        },
      };
    },
  });

  ctx.operations.register("acme-ssl.request", {
    describe: () => "Would request a new certificate and reload HTTPS",
    run: async () => {
      const result = await runner.issue();
      return {
        summary: result.reload.message || "Certificate issued",
        changed: true,
      };
    },
  });
}
