import {
  DEMO_PLUGINS,
  DEMO_REGISTRIES,
  type DemoPlugin,
  type DemoRegistry,
} from "./plugin-data";

// Same shape as demo-store: fixtures stay untouched so a refresh returns a
// known state, edits land here, subscribers re-render.

let plugins: DemoPlugin[] = DEMO_PLUGINS.map((p) => ({ ...p }));
let registries: DemoRegistry[] = DEMO_REGISTRIES.map((r) => ({ ...r }));
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getPlugins(): DemoPlugin[] {
  return plugins;
}

export function getRegistries(): DemoRegistry[] {
  return registries;
}

export function subscribePlugins(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function patch(id: string, updates: Partial<DemoPlugin>) {
  plugins = plugins.map((p) => (p.id === id ? { ...p, ...updates } : p));
  emit();
}

export function installPlugin(id: string): void {
  patch(id, { installed: true, state: "enabled" });
}

export function uninstallPlugin(id: string): void {
  patch(id, { installed: false, state: "disabled" });
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  patch(id, { state: enabled ? "enabled" : "disabled" });
}

/** Retry a plugin whose worker died. Always succeeds in the demo. */
export function retryPlugin(id: string): void {
  patch(id, { state: "enabled" });
}

export function updatePlugin(id: string): void {
  const target = plugins.find((p) => p.id === id);
  if (!target?.latestVersion) return;
  patch(id, {
    version: target.latestVersion,
    latestVersion: undefined,
    addedCapabilities: undefined,
    capabilities: [...target.capabilities, ...(target.addedCapabilities ?? [])],
  });
}

export function setAutoUpdate(id: string, on: boolean): void {
  patch(id, { autoUpdate: on });
}

export function setRegistryEnabled(id: string, enabled: boolean): void {
  registries = registries.map((r) => (r.id === id ? { ...r, enabled } : r));
  emit();
}
