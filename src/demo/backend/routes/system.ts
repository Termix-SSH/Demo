import { del, get, patch, post, put } from "../router";
import { collection, value } from "../store";
import { hosts } from "./hosts";
import { currentUsername } from "./auth";
import { DEMO_USER_ID } from "../../fixtures/hosts";
import { DEMO_ACTIVITY, DEMO_AUDIT_LOGS } from "../../fixtures/activity";
import {
  defaultUiPreferences,
  sanitizeUiPreferences,
} from "@/types/ui-preferences";
import type { ResolvedHostDefault } from "@/types/host-defaults";
import info from "../../../synced/info.json";

const bootedAt = Date.now() - 1000 * 60 * 60 * 52;

// Preferences
const uiPreferences = value("ui-preferences", () => defaultUiPreferences());
get("/ui-preferences", () => ({ preferences: uiPreferences.get() }));
put("/ui-preferences", (req) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const incoming = (body.preferences ?? body) as object;
  const merged = sanitizeUiPreferences({ ...uiPreferences.get(), ...incoming });
  return { success: true, preferences: uiPreferences.set(merged) };
});

const userPreferences = value<Record<string, unknown>>(
  "user-preferences",
  () => ({ reopenTabsOnLogin: false, confirmTabClose: true }),
);
get("/user-preferences", () => userPreferences.get());
put("/user-preferences", (req) => {
  const updates = (req.body ?? {}) as Record<string, unknown>;
  userPreferences.update((prev) => ({ ...prev, ...updates }));
  return { success: true, ...updates };
});

// Open tabs, so "reopen tabs on login" has something to restore.
const openTabs = collection<{ id: string } & Record<string, unknown>>(
  "open-tabs",
  () => [],
);
get("/open-tabs", () => openTabs.all());
put("/open-tabs", (req) => {
  const { tabs = [] } = (req.body ?? {}) as {
    tabs?: Array<{ id: string } & Record<string, unknown>>;
  };
  openTabs.replace(
    tabs.map((tab) => ({
      ...tab,
      userId: DEMO_USER_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  );
});
post("/open-tabs", (req) => {
  const tab = req.body as { id: string } & Record<string, unknown>;
  openTabs.remove(tab.id);
  openTabs.insert({ ...tab, userId: DEMO_USER_ID });
});
patch("/open-tabs/:id", (req) =>
  openTabs.patch(req.params.id, req.body as Record<string, unknown>),
);
del("/open-tabs/:id", (req) => openTabs.remove(req.params.id));
get("/open-tabs/active-sessions", () => []);
get("/open-tabs/session-timeout", () => ({ minutes: 30 }));

// Dashboard
const activity = collection("activity", () => DEMO_ACTIVITY);
get("/dashboard/uptime", () => {
  const uptimeMs = Date.now() - bootedAt;
  const s = Math.floor(uptimeMs / 1000);
  return {
    uptimeMs,
    uptimeSeconds: s,
    formatted: `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`,
  };
});
get("/dashboard/activity/recent", (req) => {
  const limit = Number(req.query.limit) || 20;
  return [...activity.all()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
});
post("/dashboard/activity/log", (req) => {
  const body = req.body as { type: string; hostId: number; hostName?: string };
  const host = hosts.find(body.hostId);
  const id = activity.nextId();
  activity.insert({
    id,
    userId: DEMO_USER_ID,
    type: body.type,
    hostId: body.hostId,
    hostName: body.hostName ?? host?.name ?? "",
    timestamp: new Date().toISOString(),
  });
  return { message: "Activity logged", id };
});
del("/dashboard/activity/reset", () => {
  activity.replace([]);
  return { message: "Recent activity cleared" };
});

// Version and health
const updateChannel = value<"stable" | "beta">(
  "update-channel",
  () => "stable",
);
const releasedAt = "2026-10-08T12:00:00.000Z";
function release(version: string, prerelease = false) {
  return {
    version,
    tagName: `v${version}`,
    name: `Termix ${version}`,
    url: `https://github.com/Termix-SSH/Termix/releases/tag/v${version}`,
    publishedAt: releasedAt,
    prerelease,
    notes: "",
  };
}
get("/version", () => ({
  status: "up_to_date",
  channel: updateChannel.get(),
  version: info.version,
  localVersion: info.version,
  remoteVersion: info.version,
  latest_release: {
    tag_name: `v${info.version}`,
    name: `Termix ${info.version}`,
    published_at: releasedAt,
    html_url: `https://github.com/Termix-SSH/Termix/releases/tag/v${info.version}`,
  },
  cached: true,
}));
get("/version/channel", () => ({
  channel: updateChannel.get(),
  stored: updateChannel.get(),
  runningBeta: false,
}));
put("/version/channel", (req) => {
  const { channel } = req.body as { channel: "stable" | "beta" };
  updateChannel.set(channel);
  return { channel, stored: channel, runningBeta: false };
});
get("/version/releases", () => ({
  localVersion: info.version,
  stable: release(info.version),
  beta: null,
}));
get("/releases/rss", () => ({
  feed: {
    title: "Termix releases",
    description: "",
    link: "https://github.com/Termix-SSH/Termix/releases",
    updated: releasedAt,
  },
  items: [],
  total_count: 0,
  cached: true,
}));
get("/health", () => ({ status: "ok", database: "connected" }));

// Branding and TLS
const branding = value("branding", () => ({
  appName: "",
  tagline: "",
  logo: null as string | null,
}));
get("/users/branding", () => branding.get());
patch("/users/branding", (req) =>
  branding.update((prev) => ({ ...prev, ...(req.body as object) })),
);
get("/users/tls-certificate", () => ({
  enabled: true,
  certificate: {
    subject: "CN=termix.home.arpa",
    issuer: "CN=termix.home.arpa",
    names: ["termix.home.arpa", "localhost"],
    notBefore: "2026-08-14T09:12:00.000Z",
    notAfter: "2027-08-14T09:12:00.000Z",
    selfSigned: true,
    fingerprint:
      "4F:2A:91:C3:7E:0D:55:B8:12:9F:AE:63:0C:44:D7:81:3B:E9:20:6A:5C:F1:08:9D:72:B4:3E:C6:1A:58:E2:07",
  },
  renewal: null,
}));
post("/users/tls-certificate", () => ({ success: true, enabled: true }));

// Audit log
get("/audit-logs", (req) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 50;
  let logs = DEMO_AUDIT_LOGS.map((log) => ({
    ...log,
    username: log.userId === DEMO_USER_ID ? currentUsername() : log.username,
  }));
  if (req.query.action)
    logs = logs.filter((l) => l.action === req.query.action);
  if (req.query.resourceType) {
    logs = logs.filter((l) => l.resourceType === req.query.resourceType);
  }
  if (req.query.userId)
    logs = logs.filter((l) => l.userId === req.query.userId);
  return {
    logs: logs.slice((page - 1) * limit, page * limit),
    total: logs.length,
    page,
    totalPages: Math.max(1, Math.ceil(logs.length / limit)),
  };
});
get("/audit-logs/actions", () => ({
  actions: [...new Set(DEMO_AUDIT_LOGS.map((l) => l.action))],
  resourceTypes: [...new Set(DEMO_AUDIT_LOGS.map((l) => l.resourceType))],
}));
const auditForwarding = value("audit-forwarding", () => ({
  url: "",
  hasToken: false,
  envConfigured: false,
}));
get("/users/audit-forwarding", () => auditForwarding.get());
patch("/users/audit-forwarding", (req) => {
  const { url, token } = req.body as { url: string; token?: string };
  return auditForwarding.update((prev) => ({
    ...prev,
    url,
    hasToken: prev.hasToken || !!token,
  }));
});

// SSH auth providers come from plugins, so core lists none of its own.
get("/ssh-auth/providers", () => ({ providers: [] }));

// Host defaults
type Levels = {
  admin: Record<string, unknown>;
  user: Record<string, unknown>;
  folders: Record<string, Record<string, unknown>>;
  folderNames: Record<string, string>;
};
const defaults = value<Levels>("host-defaults", () => ({
  admin: { "core.statusCheckEnabled": true },
  user: {},
  folders: {},
  folderNames: {},
}));

function resolveFor(folder: string | null | undefined) {
  const d = defaults.get();
  const out: Record<string, ResolvedHostDefault> = {};
  for (const [key, v] of Object.entries(d.admin)) {
    out[key] = { value: v, source: { level: "admin" } };
  }
  for (const [key, v] of Object.entries(d.user)) {
    out[key] = { value: v, source: { level: "user" } };
  }
  if (folder) {
    const parts = folder.split(" / ");
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0, i).join(" / ");
      const id = Object.entries(d.folderNames).find(([, n]) => n === name)?.[0];
      if (!id) continue;
      for (const [key, v] of Object.entries(d.folders[id] ?? {})) {
        out[key] = {
          value: v,
          source: { level: "folder", folderId: Number(id), folderName: name },
        };
      }
    }
  }
  return out;
}

function levelData(level: "admin" | "user" | "folder", folderId?: string) {
  const d = defaults.get();
  const values =
    level === "admin"
      ? d.admin
      : level === "user"
        ? d.user
        : (d.folders[folderId!] ?? {});
  const inherited: Record<string, ResolvedHostDefault> = {};
  if (level !== "admin") {
    for (const [key, v] of Object.entries(d.admin)) {
      inherited[key] = { value: v, source: { level: "admin" } };
    }
  }
  if (level === "folder") {
    for (const [key, v] of Object.entries(d.user)) {
      inherited[key] = { value: v, source: { level: "user" } };
    }
  }
  return { values, inherited };
}

function applyChange(
  current: Record<string, unknown>,
  change: { set?: Record<string, unknown>; unset?: string[] },
) {
  const next = { ...current, ...(change.set ?? {}) };
  for (const key of change.unset ?? []) delete next[key];
  return next;
}

get("/host/defaults/admin", () => levelData("admin"));
get("/host/defaults/user", () => levelData("user"));
get("/host/defaults/folders/:id", (req) => levelData("folder", req.params.id));
put("/host/defaults/admin", (req) => {
  defaults.update((d) => ({
    ...d,
    admin: applyChange(d.admin, req.body as never),
  }));
  return { changedHosts: hosts.all().length };
});
put("/host/defaults/user", (req) => {
  defaults.update((d) => ({
    ...d,
    user: applyChange(d.user, req.body as never),
  }));
  return { changedHosts: hosts.all().length };
});
put("/host/defaults/folders/:id", (req) => {
  defaults.update((d) => ({
    ...d,
    folders: {
      ...d.folders,
      [req.params.id]: applyChange(
        d.folders[req.params.id] ?? {},
        req.body as never,
      ),
    },
  }));
  const name = defaults.get().folderNames[req.params.id];
  return {
    changedHosts: hosts.all().filter((h) => h.folder?.startsWith(name ?? "\0"))
      .length,
  };
});
post("/host/defaults/preview", () => ({ changedHosts: hosts.all().length }));
get("/host/defaults/jobs/:id", () => ({ status: "done", changedHosts: 0 }));
post("/host/defaults/folders", (req) => {
  const { name } = req.body as { name: string };
  const d = defaults.get();
  const existing = Object.entries(d.folderNames).find(([, n]) => n === name);
  if (existing) return { id: Number(existing[0]) };
  const id = Object.keys(d.folderNames).length + 1;
  defaults.set({ ...d, folderNames: { ...d.folderNames, [id]: name } });
  return { id };
});
get("/host/defaults/resolve", (req) => {
  let folder: string | null | undefined = req.query.folder;
  if (req.query.hostId) folder = hosts.find(req.query.hostId)?.folder;
  if (req.query.parentHostId) {
    folder = hosts.find(req.query.parentHostId)?.folder;
  }
  return { values: resolveFor(folder) };
});
