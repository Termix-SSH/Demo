import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

/** The part of the DNS plugin's dns.records service this plugin uses. */
interface DnsRecords {
  setRecord: (input: {
    name: string;
    type: string;
    content: string;
    ttl?: number;
  }) => Promise<unknown>;
  removeRecord: (handle: unknown) => Promise<void>;
}

/** The user whose DNS access scheduled renewals use. */
export const DNS_USER_KEY = "dnsUser";

type DnsCtx = Pick<PluginContext, "services" | "kv" | "currentActor">;

/** Remembers who asked, so a renewal with no request behind it can act as them. */
export async function rememberDnsUser(ctx: DnsCtx): Promise<void> {
  const actor = ctx.currentActor?.();
  if (actor) await ctx.kv.set(DNS_USER_KEY, actor);
}

/** Creates the TXT record through the DNS plugin and returns how to remove it. */
export async function createTxtRecordWithDnsPlugin(
  ctx: DnsCtx,
  name: string,
  content: string,
): Promise<() => Promise<void>> {
  if (!ctx.services.providers("dns.records").includes("")) {
    throw new Error(
      "The DNS plugin is not running. Turn it on or pick another challenge type.",
    );
  }
  let options: { userId: string } | undefined;
  if (!ctx.currentActor?.()) {
    const stored = await ctx.kv.get(DNS_USER_KEY);
    if (typeof stored !== "string" || !stored) {
      throw new Error(
        "Request a certificate once by hand so renewals know whose DNS access to use.",
      );
    }
    options = { userId: stored };
  }
  const dns = ctx.services.get<DnsRecords>("dns.records", options);
  const handle = await dns.setRecord({ name, type: "TXT", content, ttl: 120 });
  return () => dns.removeRecord(handle);
}
