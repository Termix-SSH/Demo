import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  readOnly: boolean;
  roots: string[];
}

const ROOT_RE = /^(~|~\/[^\0\r\n]*|\/[^\0\r\n]*)$/;

/** Scan folders from the comma separated setting. Default is the home folder. */
export function parseRoots(value: unknown): string[] {
  const list =
    typeof value === "string"
      ? value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => ROOT_RE.test(v))
      : [];
  return list.length ? list.slice(0, 10) : ["~"];
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enableGit === true,
    sudo: values.useSudo === true,
    readOnly: values.readOnly === true,
    roots: parseRoots(values.repoRoots),
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
