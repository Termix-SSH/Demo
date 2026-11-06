import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  readOnly: boolean;
  useSudo: boolean;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enableSecurity === true,
    readOnly: values.readOnly === true,
    useSudo: values.useSudo !== false,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}

export interface AdminSettings {
  scanVulns: boolean;
  osvUrl: string;
  checkKev: boolean;
}

export async function readAdminSettings(
  ctx: PluginContext,
): Promise<AdminSettings> {
  const scan = await ctx.settings.get<boolean>("scanVulns").catch(() => true);
  const url = await ctx.settings.get<string>("osvUrl").catch(() => "");
  const kev = await ctx.settings.get<boolean>("checkKev").catch(() => true);
  return {
    scanVulns: scan !== false,
    osvUrl: (typeof url === "string" && url.trim()
      ? url.trim()
      : "https://api.osv.dev"
    ).replace(/\/+$/, ""),
    checkKev: kev !== false,
  };
}
