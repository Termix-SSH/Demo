#!/usr/bin/env node
/**
 * Copies the real Termix UI, the plugin SDK and every plugin frontend into the
 * demo. Everything it writes is overwritten on the next run, so never edit
 * src/ui, src/types, src/sdk, src/plugins or src/main.tsx by hand. Demo code
 * lives in src/demo.
 *
 *   npm run sync
 *   npm run sync -- --termix ../Termix --plugins ../Termix-Plugins --registry ../Termix-Registry
 */

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const termixDir = path.resolve(root, arg("termix", "../Termix"));
const pluginsDir = path.resolve(root, arg("plugins", "../Termix-Plugins"));
const registryDir = path.resolve(root, arg("registry", "../Termix-Registry"));

for (const dir of [termixDir, pluginsDir, registryDir]) {
  if (!fs.existsSync(dir)) {
    console.error(`Not found: ${dir}`);
    process.exit(1);
  }
}

const SKIP_DIRS = new Set(["tests", "node_modules", "dist"]);

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (skip(src, entry)) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyDir(src, dest, skip);
    } else if (!/\.test\.tsx?$/.test(entry.name)) {
      fs.copyFileSync(src, dest);
    }
  }
}

function replaceDir(from, to, skip) {
  fs.rmSync(to, { recursive: true, force: true });
  copyDir(from, to, skip);
}

// Core UI, shared types and the entry point.
replaceDir(path.join(termixDir, "src/ui"), path.join(root, "src/ui"));
replaceDir(path.join(termixDir, "src/types"), path.join(root, "src/types"));
fs.copyFileSync(
  path.join(termixDir, "src/main.tsx"),
  path.join(root, "src/main.tsx"),
);

// The SDK's browser entries, resolved from source like core does in dev.
replaceDir(
  path.join(termixDir, "packages/plugin-sdk/src"),
  path.join(root, "src/sdk"),
  (src, entry) => entry.isDirectory() && entry.name === "testing",
);

// Public assets the UI references.
for (const name of [
  "favicon.ico",
  "icon.svg",
  "icon.png",
  "full-icon.png",
  "pdf.worker.min.js",
]) {
  const src = path.join(termixDir, "public", name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, "public", name));
}
for (const dir of ["icons", "fonts"]) {
  const src = path.join(termixDir, "public", dir);
  if (fs.existsSync(src)) replaceDir(src, path.join(root, "public", dir));
}

// Plugin frontends. The whole src/ comes over because frontends import shared
// and type-only backend files; the bundler only pulls in what is imported.
const pluginsOut = path.join(root, "src/plugins");
fs.rmSync(pluginsOut, { recursive: true, force: true });
const ids = [];
for (const name of fs.readdirSync(pluginsDir).sort()) {
  const dir = path.join(pluginsDir, name);
  const manifestPath = path.join(dir, "manifest.json");
  if (!name.startsWith("Plugin-") || !fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const out = path.join(pluginsOut, manifest.id);
  copyDir(path.join(dir, "src"), path.join(out, "src"));
  if (fs.existsSync(path.join(dir, "locales"))) {
    copyDir(path.join(dir, "locales"), path.join(out, "locales"));
  }
  fs.copyFileSync(manifestPath, path.join(out, "manifest.json"));
  for (const extra of ["CHANGELOG.md"]) {
    const src = path.join(dir, extra);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, extra));
  }
  ids.push(manifest.id);
}

// Data the fake backend serves: the official registry, the bundled plugin
// list and the Termix version.
const syncedOut = path.join(root, "src/synced");
fs.rmSync(syncedOut, { recursive: true, force: true });
fs.mkdirSync(syncedOut, { recursive: true });
for (const name of ["index.json", "stats.json"]) {
  const src = path.join(registryDir, "official", name);
  if (fs.existsSync(src))
    fs.copyFileSync(src, path.join(syncedOut, `registry-${name}`));
}
fs.copyFileSync(
  path.join(termixDir, "docker/bundled-plugins.json"),
  path.join(syncedOut, "bundled-plugins.json"),
);
const termixPkg = JSON.parse(
  fs.readFileSync(path.join(termixDir, "package.json"), "utf8"),
);
fs.writeFileSync(
  path.join(syncedOut, "info.json"),
  `${JSON.stringify({ version: termixPkg.version, plugins: ids }, null, 2)}\n`,
);

// Bare imports in the copied frontend code that the demo does not install.
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const installed = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);
const missing = new Map();
const IMPORT = /(?:from|import\(|@import)\s*["']([^"'.][^"']*)["']/g;
function scan(dir, skipBackend) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipBackend && entry.name === "backend") continue;
      scan(full, skipBackend);
    } else if (/\.(tsx?|mjs|css)$/.test(entry.name)) {
      for (const [, spec] of fs.readFileSync(full, "utf8").matchAll(IMPORT)) {
        if (spec.startsWith("@/") || spec.startsWith("@termix-ssh/")) continue;
        const name = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        if (name.startsWith("node:") || installed.has(name)) continue;
        if (!missing.has(name)) missing.set(name, path.relative(root, full));
      }
    }
  }
}
for (const dir of ["src/ui", "src/types", "src/demo"]) {
  if (fs.existsSync(path.join(root, dir))) scan(path.join(root, dir), false);
}
for (const id of ids) scan(path.join(pluginsOut, id, "src"), true);

console.log(`Synced core and ${ids.length} plugins.`);
if (missing.size) {
  console.log("\nPackages imported but not installed:");
  for (const [name, file] of missing) console.log(`  ${name}  (${file})`);
}
