import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

export interface HostSettings {
  enabled: boolean;
  projectDir: string;
  vaultPasswordFile: string;
  readOnly: boolean;
  alerts: boolean;
}

const PATH_RE = /^[A-Za-z0-9._~/-]+$/;

function cleanPath(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  if (!PATH_RE.test(text) || text.split("/").includes("..")) return fallback;
  return text.length > 1 ? text.replace(/\/+$/, "") : text;
}

export function parseHostSettings(
  values: Record<string, unknown>,
): HostSettings {
  return {
    enabled: values.enableAnsible === true,
    projectDir: cleanPath(values.projectDir, "~/ansible"),
    vaultPasswordFile: cleanPath(values.vaultPasswordFile, ""),
    readOnly: values.readOnly === true,
    alerts: values.alertRuns !== false,
  };
}

export async function readHostSettings(
  ctx: PluginContext,
  hostId: number,
): Promise<HostSettings> {
  return parseHostSettings(await ctx.settings.getAll("host", hostId));
}
