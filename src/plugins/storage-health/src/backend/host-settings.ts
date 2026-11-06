import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  readOnly: boolean;
  useSudo: boolean;
  showPanel: boolean;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enableStorage === true,
    readOnly: values.readOnly === true,
    useSudo: values.useSudo !== false,
    showPanel: values.showPanel !== false,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
