import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  sudo: boolean;
  logRoots: string[];
}

function isCleanPath(path: string): boolean {
  return (
    path.startsWith("/") &&
    path.length < 1024 &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !path.split("/").some((part) => part === ".." || part === ".")
  );
}

/** The log folders a host allows, from its logPaths setting. */
export function logRoots(setting: unknown): string[] {
  const raw = typeof setting === "string" && setting.trim() ? setting : "";
  const roots = (raw || "/var/log")
    .split(/[,\n]/)
    .map((part) => part.trim().replace(/\/+$/, ""))
    .filter((part) => part && isCleanPath(part));
  return roots.length ? [...new Set(roots)].slice(0, 10) : ["/var/log"];
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enableLogSearch !== false,
    sudo: values.useSudo !== false,
    logRoots: logRoots(values.logPaths),
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
