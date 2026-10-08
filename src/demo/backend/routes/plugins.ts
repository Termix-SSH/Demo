import { del, get, HttpError, patch, post, put } from "../router";
import { value } from "../store";
import { rawFetch } from "../fetch";
import { hosts } from "./hosts";
import {
  DEMO_PLUGIN_ID,
  hasPluginFrontend,
  pluginLocaleFiles,
} from "../../plugin-modules";
import demoManifest from "../../demo-plugin/manifest.json";
import { parseChangelog } from "@termix-ssh/plugin-sdk/changelog";
import {
  applyOrder,
  resolvePluginChoices,
  type PluginChoice,
} from "@/types/plugin-onboarding";
import registryIndex from "../../../synced/registry-index.json";
import registryStats from "../../../synced/registry-stats.json";
import bundled from "../../../synced/bundled-plugins.json";

type Manifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: { name?: string };
  category?: string;
  icon?: string;
  repository?: string;
  docs?: string;
  video?: string;
  features?: string[];
  env?: unknown[];
  capabilities?: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  contributes?: {
    guest?: boolean;
    guestViews?: string[];
    auth?: { loginMethods?: unknown[]; secondFactors?: unknown[] };
    permissions?: Array<{
      name: string;
      titleKey: string;
      descriptionKey: string;
    }>;
    settings?: {
      admin?: SettingsField[];
      user?: SettingsField[];
      host?: {
        enableKey?: string;
        enableDefault?: boolean;
        fields?: SettingsField[];
      };
    };
    [key: string]: unknown;
  };
};
type SettingsField = { key: string; type: string; default?: unknown };

const manifestModules = import.meta.glob<Manifest>(
  "../../../plugins/*/manifest.json",
  {
    eager: true,
    import: "default",
  },
);
const changelogs = import.meta.glob<string>("../../../plugins/*/CHANGELOG.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

export const MANIFESTS: Record<string, Manifest> = Object.fromEntries(
  [...Object.values(manifestModules), demoManifest as Manifest].map((m) => [
    m.id,
    m,
  ]),
);

type RegistryEntry = (typeof registryIndex.plugins)[number] & {
  docs?: string;
  features?: string[];
  videoId?: string;
};
const REGISTRY = new Map<string, RegistryEntry>(
  registryIndex.plugins.map((p) => [p.id, p as RegistryEntry]),
);
const STATS = registryStats.plugins as Record<string, { downloads: number }>;
const BUNDLED = new Map(
  (
    bundled.plugins as Array<{
      id: string;
      onboarding?: { recommended?: boolean; consent?: boolean };
    }>
  ).map((p) => [p.id, p]),
);

/** What a fresh demo has switched on before the setup picker runs. */
const ENABLED_BY_DEFAULT = new Set([
  DEMO_PLUGIN_ID,
  "alerts",
  "automations",
  "docker",
  "file-manager",
  "fleets",
  "homepage",
  "host-metrics",
  "network-topology",
  "proxmox",
  "remote-desktop",
  "session-recording",
  "session-sharing",
  "snippets",
  "ssh-terminal",
  "termix-identity",
  "tmux-monitor",
  "totp",
  "tunnels",
  "wake-on-lan",
  "webauthn",
  "workspaces",
]);

interface InstallState {
  installed: boolean;
  enabled: boolean;
  autoUpdate: boolean;
  pinned: boolean;
  channel: "stable" | "beta";
}

const pluginState = value<Record<string, InstallState>>("plugin-state", () =>
  Object.fromEntries(
    Object.keys(MANIFESTS).map((id) => [
      id,
      {
        installed: true,
        enabled: ENABLED_BY_DEFAULT.has(id),
        autoUpdate: true,
        pinned: false,
        channel: "stable",
      },
    ]),
  ),
);
const developerMode = value("plugin-developer-mode", () => false);
const onboardingDone = value("plugin-onboarding-done", () => false);

function stateOf(id: string): InstallState {
  return (
    pluginState.get()[id] ?? {
      installed: false,
      enabled: false,
      autoUpdate: true,
      pinned: false,
      channel: "stable",
    }
  );
}

function setState(id: string, changes: Partial<InstallState>): InstallState {
  const next = { ...stateOf(id), ...changes };
  pluginState.update((all) => ({ ...all, [id]: next }));
  return next;
}

function summary(id: string) {
  const m = MANIFESTS[id];
  const s = stateOf(id);
  const reg = REGISTRY.get(id);
  return {
    id,
    name: m.name,
    version: m.version,
    enabled: s.enabled,
    state: s.enabled ? "enabled" : "disabled",
    contributes: m.contributes ?? null,
    icon: m.icon,
    dependencies: m.dependencies ?? {},
    optionalDependencies: m.optionalDependencies ?? {},
    docs: m.docs ?? reg?.docs,
    frontend: hasPluginFrontend(id),
    css: false,
    assetVersion: m.version,
    locales: pluginLocaleFiles(id),
    tier: "bundled",
    source: "registry",
    registryId: "official",
    autoUpdate: s.autoUpdate,
    pinnedVersion: s.pinned ? m.version : null,
    channel: s.channel,
    description: m.description,
    author: m.author?.name ?? "Termix",
    repository: m.repository ?? reg?.repository,
    videoId: undefined,
    features: m.features ?? reg?.features ?? [],
    env: m.env ?? [],
    signedBy: "official",
    capabilities: m.capabilities ?? [],
    grantedCapabilities: m.capabilities ?? [],
    lastError: null,
    publicRoutes: { http: [], ws: [] },
  };
}

function installedIds(): string[] {
  return Object.keys(MANIFESTS).filter((id) => stateOf(id).installed);
}

export function isPluginEnabled(id: string): boolean {
  const s = stateOf(id);
  return s.installed && s.enabled;
}

get("/plugins", () => installedIds().map(summary));

get("/plugins/public", () =>
  installedIds()
    .filter((id) => isPluginEnabled(id) && MANIFESTS[id].contributes?.guest)
    .map((id) => ({
      ...summary(id),
      version: "",
      contributes: {
        guest: true,
        guestViews: MANIFESTS[id].contributes?.guestViews ?? [],
      },
    })),
);

get("/plugins/public-manifest", () =>
  installedIds()
    .filter((id) => {
      const auth = MANIFESTS[id].contributes?.auth;
      return (
        isPluginEnabled(id) &&
        ((auth?.loginMethods?.length ?? 0) > 0 ||
          (auth?.secondFactors?.length ?? 0) > 0)
      );
    })
    .map((id) => ({
      ...summary(id),
      version: "",
      contributes: { auth: MANIFESTS[id].contributes?.auth },
    })),
);

function registryVersions(id: string) {
  const reg = REGISTRY.get(id);
  const m = MANIFESTS[id];
  const versions = reg?.versions ?? [
    { version: m.version, capabilities: m.capabilities ?? [], size: 0 },
  ];
  const notes = changelogFor(id);
  return versions.map((v) => ({
    version: v.version,
    prerelease: false,
    compatible: true,
    capabilities: v.capabilities ?? [],
    publishedAt: (v as { publishedAt?: string }).publishedAt,
    releaseNotesUrl: (v as { releaseNotesUrl?: string }).releaseNotesUrl,
    notes: notes.find((r) => r.version === v.version)?.notes,
    size: v.size ?? 0,
  }));
}

function changelogFor(id: string) {
  const raw = changelogs[`../../../plugins/${id}/CHANGELOG.md`];
  if (!raw) return [];
  try {
    return parseChangelog(raw).changelog.releases as unknown as Array<{
      version: string;
      notes?: unknown;
    }>;
  } catch {
    return [];
  }
}

get("/plugins/registry", () => {
  const ids = new Set([...REGISTRY.keys(), ...Object.keys(MANIFESTS)]);
  return {
    registry: {
      id: "official",
      url: "https://raw.githubusercontent.com/Termix-SSH/Termix-Registry/main/official/index.json",
      lastCheckedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      error: null,
    },
    managedByServer: false,
    plugins: [...ids]
      .filter((id) => MANIFESTS[id] && id !== DEMO_PLUGIN_ID)
      .map((id) => {
        const m = MANIFESTS[id];
        const reg = REGISTRY.get(id);
        const s = stateOf(id);
        return {
          id,
          name: reg?.name ?? m.name,
          description: reg?.description ?? m.description ?? "",
          author: reg?.author ?? m.author?.name ?? "Termix",
          category: reg?.category ?? m.category ?? "Productivity",
          repository: reg?.repository ?? m.repository,
          icon: reg?.icon ?? m.icon,
          features: m.features ?? reg?.features ?? [],
          docs: m.docs ?? reg?.docs,
          versions: registryVersions(id),
          latestVersion: m.version,
          latestBeta: null,
          channel: s.channel,
          installed: s.installed,
          installedVersion: s.installed ? m.version : null,
          updateAvailable: false,
          addedCapabilities: [],
          pinnedVersion: s.pinned ? m.version : null,
          autoUpdate: s.autoUpdate,
          bundled: true,
          installCount: STATS[id]?.downloads ?? null,
          installCountSource: STATS[id] ? "downloads" : null,
        };
      }),
  };
});

post("/plugins/:id/install", (req) => {
  const id = req.params.id;
  if (!MANIFESTS[id]) throw new HttpError(404, { error: "Unknown plugin" });
  setState(id, { installed: true, enabled: true });
  return { id, version: MANIFESTS[id].version, state: "enabled" };
});
post("/plugins/:id/update", (req) => {
  const id = req.params.id;
  return { id, version: MANIFESTS[id]?.version, state: "enabled" };
});
post("/plugins/update-all", () => ({
  updated: [],
  needsReview: [],
  failed: [],
}));
function keepDemoPlugin(id: string) {
  if (id === DEMO_PLUGIN_ID) {
    throw new HttpError(400, { error: "The demo needs this plugin to run." });
  }
}

del("/plugins/:id", (req) => {
  keepDemoPlugin(req.params.id);
  setState(req.params.id, { installed: false, enabled: false });
});
post("/plugins/:id/retry", () => undefined);

function dependents(id: string): string[] {
  return installedIds().filter(
    (other) =>
      isPluginEnabled(other) && id in (MANIFESTS[other].dependencies ?? {}),
  );
}
function requirements(id: string): string[] {
  return Object.keys(MANIFESTS[id]?.dependencies ?? {}).filter(
    (dep) => !isPluginEnabled(dep),
  );
}

patch("/plugins/:id/state", (req) => {
  const id = req.params.id;
  keepDemoPlugin(id);
  const { enabled } = req.body as { enabled: boolean };
  const enable = enabled ? requirements(id) : [];
  const disable = enabled ? [] : dependents(id);
  if (req.query.dryRun) {
    return { id, enabled, enable, disable, missing: [] };
  }
  for (const dep of enable) setState(dep, { enabled: true });
  for (const dep of disable) setState(dep, { enabled: false });
  setState(id, { enabled });
  return {
    id,
    enabled,
    enable,
    disable,
    missing: [],
    state: enabled ? "enabled" : "disabled",
  };
});
patch("/plugins/:id/options", (req) => {
  const body = req.body as {
    autoUpdate?: boolean;
    pinned?: boolean;
    channel?: "stable" | "beta";
  };
  const s = setState(req.params.id, {
    ...(body.autoUpdate !== undefined ? { autoUpdate: body.autoUpdate } : {}),
    ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
    ...(body.channel ? { channel: body.channel } : {}),
  });
  return {
    autoUpdate: s.autoUpdate,
    pinnedVersion: s.pinned ? MANIFESTS[req.params.id]?.version : null,
    channel: s.channel,
  };
});
post("/plugins/channel", (req) => {
  const { channel } = req.body as { channel: "stable" | "beta" };
  for (const id of installedIds()) setState(id, { channel });
  return { changed: installedIds() };
});
get("/plugins/:id/data", (req) => {
  const id = req.params.id;
  const m = MANIFESTS[id];
  return {
    id,
    tables: [],
    kvKeys: 0,
    settings: {
      admin: m?.contributes?.settings?.admin?.length ?? 0,
      user: m?.contributes?.settings?.user?.length ?? 0,
      host: 0,
      secret: 0,
    },
    migrations: [],
    grants: (m?.capabilities ?? []).map((capability) => ({
      capability,
      source: "install",
      grantedAt: "2026-10-06T10:00:00.000Z",
    })),
    filesBytes: 0,
  };
});
del("/plugins/:id/data", () => undefined);
get("/plugins/:id/changelog", (req) => ({
  releases: changelogFor(req.params.id),
}));
get("/plugins/developer-mode", () => ({
  enabled: developerMode.get(),
  signedOnly: false,
}));
put("/plugins/developer-mode", (req) => {
  developerMode.set(!!(req.body as { enabled: boolean }).enabled);
});
post("/plugins/upload", () => {
  throw new HttpError(400, {
    error: "Installing from a file is not available in the demo.",
  });
});

// Onboarding picker
function onboardingIds(): string[] {
  return installedIds().filter((id) => id !== DEMO_PLUGIN_ID);
}

function choicePlugins() {
  return onboardingIds().map((id) => ({
    id,
    dependencies: Object.keys(MANIFESTS[id].dependencies ?? {}),
  }));
}
get("/plugins/onboarding", () => ({
  pending: !onboardingDone.get(),
  reason: onboardingDone.get() ? null : "fresh",
  managedByLinkedServer: false,
  plugins: onboardingIds().map((id) => {
    const m = MANIFESTS[id];
    const onboarding = BUNDLED.get(id)?.onboarding;
    return {
      id,
      name: m.name,
      description: m.description ?? "",
      icon: m.icon ?? null,
      category: REGISTRY.get(id)?.category ?? m.category ?? "Productivity",
      version: m.version,
      source: "bundled",
      state: stateOf(id).enabled ? "enabled" : "disabled",
      dependencies: Object.keys(m.dependencies ?? {}),
      recommended: !!onboarding?.recommended || ENABLED_BY_DEFAULT.has(id),
      consent: !!onboarding?.consent,
    };
  }),
}));
post("/plugins/onboarding/apply", (req) => {
  const { choices = {} } = req.body as {
    choices?: Record<string, PluginChoice>;
  };
  const plugins = choicePlugins();
  const resolved = resolvePluginChoices(plugins, choices);
  const order = applyOrder(plugins, resolved.choices);
  for (const id of order.enable) setState(id, { enabled: true });
  for (const id of order.disable) setState(id, { enabled: false });
  for (const id of order.remove)
    setState(id, { installed: false, enabled: false });
  onboardingDone.set(true);
  return {
    resolved: resolved.choices,
    adjustments: resolved.adjustments,
    enabled: order.enable,
    disabled: order.disable,
    removed: order.remove,
    failed: [],
  };
});

// Settings, for the admin, user and host scopes a manifest declares.
const settingsStore = value<Record<string, Record<string, unknown>>>(
  "plugin-settings",
  () => ({}),
);
function fieldDefaults(fields: SettingsField[] | undefined) {
  return Object.fromEntries(
    (fields ?? [])
      .filter((f) => f.default !== undefined)
      .map((f) => [f.key, f.default]),
  );
}
function scopeValues(id: string, scope: "admin" | "user") {
  const fields = MANIFESTS[id]?.contributes?.settings?.[scope];
  return {
    ...fieldDefaults(fields),
    ...(settingsStore.get()[`${id}:${scope}`] ?? {}),
  };
}
for (const scope of ["admin", "user"] as const) {
  get(`/plugins/:id/settings/${scope}`, (req) => ({
    values: scopeValues(req.params.id, scope),
  }));
  put(`/plugins/:id/settings/${scope}`, (req) => {
    const key = `${req.params.id}:${scope}`;
    settingsStore.update((all) => ({
      ...all,
      [key]: { ...(all[key] ?? {}), ...(req.body as object) },
    }));
    return { values: scopeValues(req.params.id, scope) };
  });
}
function hostValues(id: string, hostId: string) {
  const host = hosts.find(hostId);
  const contribution = MANIFESTS[id]?.contributes?.settings?.host;
  const defaults = fieldDefaults(contribution?.fields);
  if (contribution?.enableKey && contribution.enableDefault !== undefined) {
    defaults[contribution.enableKey] = contribution.enableDefault;
  }
  return { ...defaults, ...(host?.pluginSettings?.[id] ?? {}) };
}
get("/plugins/:id/settings/host/:hostId", (req) => ({
  values: hostValues(req.params.id, req.params.hostId),
}));
put("/plugins/:id/settings/host/:hostId", (req) => {
  const host = hosts.find(req.params.hostId);
  if (host) {
    hosts.patch(host.id, {
      pluginSettings: {
        ...(host.pluginSettings ?? {}),
        [req.params.id]: {
          ...(host.pluginSettings?.[req.params.id] ?? {}),
          ...(req.body as object),
        },
      },
    });
  }
  return { values: hostValues(req.params.id, req.params.hostId) };
});

// Plugin assets: locales are bundled, so anything fetched here is missing.
rawFetch(
  (path) => path.startsWith("/plugin-assets/"),
  async () => new Response("", { status: 404 }),
);
