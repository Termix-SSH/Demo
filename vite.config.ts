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
