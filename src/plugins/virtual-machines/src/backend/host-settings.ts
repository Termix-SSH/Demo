import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export const DEFAULT_URI = "qemu:///system";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  uri: string;
}

const URI_RE = /^[a-z][a-z0-9+]*:\/\/[A-Za-z0-9@._:/?=&-]*$/;

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  const uri = typeof values.connectUri === "string" ? values.connectUri : "";
  return {
    enabled: values.enableVirtualMachines === true,
    sudo: values.useSudo !== false,
    readOnly: values.readOnly === true,
    uri: URI_RE.test(uri.trim()) ? uri.trim() : DEFAULT_URI,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
