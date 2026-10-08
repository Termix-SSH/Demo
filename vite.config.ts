import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
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
