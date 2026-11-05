import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { cleanRunUser } from "./scripts.js";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  /** Run pm2 as this user. Empty means the login user. */
  pm2User: string;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  let pm2User = "";
  try {
    pm2User = cleanRunUser(values.pm2User);
  } catch {
    pm2User = "";
  }
  return {
    enabled: values.enableProcesses === true,
    sudo: values.useSudo !== false,
    readOnly: values.readOnly === true,
    pm2User,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
