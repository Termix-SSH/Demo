import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  /** Certificates with this many days or fewer left count as expiring. */
  warnDays: number;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  const warn = Number(values.expiryWarnDays);
  return {
    enabled: values.enableCertificates === true,
    sudo: values.useSudo !== false,
    readOnly: values.readOnly === true,
    warnDays: Number.isFinite(warn) && warn >= 1 && warn <= 90 ? warn : 14,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
