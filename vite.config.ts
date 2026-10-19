import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;
const termixVersion = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(root, "src/synced/info.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/** In dev the app asks for plugin assets under /__termix_api/<port>/. */
function pluginAssets(): Plugin {
  return {
    name: "termix-demo-plugin-assets",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const match = req.url?.match(
          /^\/__termix_api\/\d+(\/plugin-assets\/[^?]*)(\?.*)?$/,
        );
        if (match) req.url = match[1] + (match[2] ?? "");
        next();
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), pluginAssets()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(termixVersion),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  resolve: {
    alias: [
      {
        find: "@termix-ssh/plugin-sdk/frontend",
        replacement: path.resolve(root, "src/sdk/frontend.ts"),
      },
      {
        find: "@termix-ssh/plugin-sdk/ui",
        replacement: path.resolve(root, "src/ui/plugin-host/sdk-ui.ts"),
      },
      {
        find: /^@termix-ssh\/plugin-sdk\/(.*)$/,
        replacement: path.resolve(root, "src/sdk") + "/$1.ts",
      },
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
