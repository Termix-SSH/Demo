import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

// Mirrors Termix's alias layout so UI files copy over without rewriting imports.
// "@/types" must be listed before "@/" so the more specific prefix wins.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    // The remaining large chunk is demo code, not vendor: the plugin and host
    // fixtures have to be present before the rail can draw. 900kB keeps the
    // warning meaningful without flagging that known floor on every build.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // React and the shared vendor layer change far less often than demo
        // code, so splitting them keeps first paint small and lets the rest
        // stay cached across deploys.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          const p = id.split(path.sep).join("/");
          // xterm must stay uncharted so it follows DemoTerminal's dynamic
          // import into its own lazily loaded chunk.
          if (p.includes("/node_modules/@xterm/")) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(p)) {
            return "react";
          }
          if (/\/node_modules\/(i18next|react-i18next)\//.test(p)) {
            return "i18n";
          }
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\/types$/,
        replacement: path.resolve(root, "src/types/index.ts"),
      },
      {
        find: /^@\/types\//,
        replacement: path.resolve(root, "src/types") + "/",
      },
      { find: /^@\//, replacement: path.resolve(root, "src/ui") + "/" },
    ],
  },
});
