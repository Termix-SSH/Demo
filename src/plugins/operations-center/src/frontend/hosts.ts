import type { PluginHostRecord } from "@termix-ssh/plugin-sdk/frontend";
import type { CatalogAction } from "./api";

/** The plugin's own host settings, as the host record carries them. */
function settingsOf(
  host: PluginHostRecord,
  pluginId: string,
): Record<string, unknown> {
  const all = (host as { pluginSettings?: Record<string, unknown> })
    .pluginSettings as Record<string, Record<string, unknown>> | undefined;
  return all?.[pluginId] ?? {};
}

/** Whether an action applies to a host, the same test the gate runs. */
export function appliesTo(action: CatalogAction, host: PluginHostRecord) {
  if (action.scope === "server") return false;
  const wanted = action.when?.settings ?? {};
  const settings = settingsOf(host, action.pluginId);
  return Object.entries(wanted).every(
    ([key, value]) => (settings[key] ?? false) === value,
  );
}

export function hostLabel(host: { name?: string | null; ip?: string }) {
  return host.name || host.ip || "";
}

export function splitTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String);
  return String(tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
