import type { FrontendModule } from "@termix-ssh/plugin-sdk/frontend";
import { configurePluginLoader } from "@/plugin-host/loader";
import type { PluginSummary } from "@/api/plugins-api";
import { englishLocales, frontends, translatedLocales } from "./plugin-modules";

export function configureDemoPlugins(): void {
  configurePluginLoader({
    async importFrontend(summary: PluginSummary) {
      const load = frontends[`../plugins/${summary.id}/src/frontend/index.tsx`];
      if (!load) throw new Error(`${summary.id} has no frontend`);
      const module = (await load()) as FrontendModule & {
        default?: FrontendModule;
      };
      return typeof module.activate === "function"
        ? module
        : (module.default ?? module);
    },
    async loadLocale(summary: PluginSummary, file: string) {
      const load =
        file === "en"
          ? englishLocales[`../plugins/${summary.id}/locales/en.json`]
          : translatedLocales[
              `../plugins/${summary.id}/locales/translated/${file}.json`
            ];
      if (!load) return null;
      return (await load()).default;
    },
    injectCss: () => null,
  });
}
