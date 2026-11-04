import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  sshGuard: boolean;
  rollbackSeconds: number;
  confirmAll: boolean;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  const seconds = Number(values.rollbackSeconds);
  return {
    enabled: values.enableFirewall === true,
    sudo: values.useSudo !== false,
    readOnly: values.readOnly === true,
    sshGuard: values.sshGuard !== false,
    rollbackSeconds: Number.isFinite(seconds)
      ? Math.min(600, Math.max(20, Math.round(seconds)))
      : 60,
    confirmAll: values.confirmAll === true,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
