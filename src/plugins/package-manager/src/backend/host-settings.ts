import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  alerts: boolean;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enablePackages === true,
    sudo: values.useSudo !== false,
    readOnly: values.readOnly === true,
    alerts: values.alertUpdates === true,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
