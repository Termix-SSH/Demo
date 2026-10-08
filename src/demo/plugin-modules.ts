import type { ResourceKey } from "i18next";
import type { FrontendModule } from "@termix-ssh/plugin-sdk/frontend";

// Plugin frontends are bundled with the demo instead of served by a backend.
/** The demo's own plugin, served from the same paths a synced one would be. */
export const DEMO_PLUGIN_ID = "termix-demo";

export const frontends: Record<string, () => Promise<FrontendModule>> = {
  ...import.meta.glob<FrontendModule>("../plugins/*/src/frontend/index.tsx"),
  [`../plugins/${DEMO_PLUGIN_ID}/src/frontend/index.tsx`]: () =>
    import("./demo-plugin/index"),
};
export const englishLocales: Record<
  string,
  () => Promise<{ default: ResourceKey }>
> = {
  ...import.meta.glob<{ default: ResourceKey }>("../plugins/*/locales/en.json"),
  [`../plugins/${DEMO_PLUGIN_ID}/locales/en.json`]: () =>
    import("./demo-plugin/locales/en.json"),
};
export const translatedLocales = import.meta.glob<{ default: ResourceKey }>(
  "../plugins/*/locales/translated/*.json",
);

export function hasPluginFrontend(id: string): boolean {
  return `../plugins/${id}/src/frontend/index.tsx` in frontends;
}

export function pluginLocaleFiles(id: string): string[] {
  const files: string[] = [];
  if (`../plugins/${id}/locales/en.json` in englishLocales) files.push("en");
  const prefix = `../plugins/${id}/locales/translated/`;
  for (const path of Object.keys(translatedLocales)) {
    if (path.startsWith(prefix)) {
      files.push(path.slice(prefix.length).replace(/\.json$/, ""));
    }
  }
  return files;
}
