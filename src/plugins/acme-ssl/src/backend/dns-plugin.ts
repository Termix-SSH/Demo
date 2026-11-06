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

/** Creates the TXT record through the DNS plugin and returns how to remove it. */
export async function createTxtRecordWithDnsPlugin(
  ctx: Pick<PluginContext, "services">,
  name: string,
  content: string,
): Promise<() => Promise<void>> {
  if (!ctx.services.providers("dns.records").includes("")) {
    throw new Error(
      "The DNS plugin is not running. Turn it on or pick another challenge type.",
    );
  }
  const dns = ctx.services.get<DnsRecords>("dns.records");
  const handle = await dns.setRecord({ name, type: "TXT", content, ttl: 120 });
  return () => dns.removeRecord(handle);
}
