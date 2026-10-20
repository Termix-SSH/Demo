import { del, dispatch, get, HttpError, post, put } from "../../router";
import type { DemoRequest, Method } from "../../router";
import { collection, value } from "../../store";
import { hosts } from "../hosts";
import { DEMO_USER_ID } from "../../../fixtures/hosts";

// Import and Export, Credential Tools, Audit Tools, Hosts Config and Login
// Security. Their screens call the plugin's own API, so these forward to the
// core demo routes that already answer the same questions.

function forward(method: Method, path: string, to: string) {
  const handler = async (req: DemoRequest) => {
    const url = to.replace(/:(\w+)/g, (_, key) => req.params[key] ?? "");
    const { status, data } = await dispatch(method, url, req.body, req.query);
    if (status >= 400) {
      throw new HttpError(status, data);
    }
    return data;
  };
  if (method === "GET") get(path, handler);
  else post(path, handler);
}

forward("POST", "/plugin-api/import-export/bulk-import", "/host/bulk-import");
// Reads Host, HostName, User and Port from an SSH config file.
post("/plugin-api/import-export/ssh-config-import", async (req) => {
  const { content = "" } = (req.body ?? {}) as { content?: string };
  const found: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(/\s+/);
    const value = rest.join(" ");
    switch (key.toLowerCase()) {
      case "host":
        current = value.includes("*")
          ? null
          : {
              name: value,
              ip: value,
              port: 22,
              username: "root",
              folder: "Imported",
              connectionType: "ssh",
              authType: "password",
              enableSsh: true,
            };
        if (current) found.push(current);
        break;
      case "hostname":
        if (current) current.ip = value;
        break;
      case "user":
        if (current) current.username = value;
        break;
      case "port":
        if (current) current.port = Number(value) || 22;
        break;
    }
  }
  if (found.length > 0) {
    await dispatch("PUT", "/host/folders/metadata", {
      name: "Imported",
      color: "#a78bfa",
      icon: "folder-down",
    });
  }
  const { data } = await dispatch("POST", "/host/bulk-import", {
    hosts: found,
  });
  return data;
});

forward(
  "POST",
  "/plugin-api/credential-tools/generate-key-pair",
  "/credentials/generate-key-pair",
);
forward(
  "POST",
  "/plugin-api/credential-tools/generate-public-key",
  "/credentials/generate-public-key",
);
forward(
  "POST",
  "/plugin-api/credential-tools/credentials/:id/deploy-to-host",
  "/credentials/:id/deploy-to-host",
);

// Audit Tools: a small CSV so the download works.
get("/plugin-api/audit-tools/export", async (req) => {
  const { data } = await dispatch("GET", "/audit-logs", undefined, {
    limit: 200,
  });
  const logs = (data as { logs: Record<string, unknown>[] }).logs;
  const header = "time,user,action,resource,success";
  const rows = logs.map((log) =>
    [
      log.timestamp ?? log.createdAt ?? "",
      log.username ?? "",
      log.action ?? "",
      log.resourceType ?? "",
      log.success ?? true,
    ].join(","),
  );
  const format = req.query.format === "ndjson" ? "ndjson" : "csv";
  return format === "csv"
    ? [header, ...rows].join("\n")
    : logs.map((log) => JSON.stringify(log)).join("\n");
});

// Hosts Config: the file the demo pretends to load.
const hostsFile = value("hosts-config-status", () => ({
  enabled: true,
  path: "/etc/termix/hosts.yaml",
  strict: false,
  hosts: 12,
  lastLoadedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  lastAttemptAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  errors: [] as string[],
  applyErrors: [] as string[],
  warnings: [] as string[],
  lastResult: { created: 0, updated: 0, deleted: 0 },
}));
get("/plugin-api/hosts-config/status", () => hostsFile.get());
post("/plugin-api/hosts-config/reload", () =>
  hostsFile.update((prev) => ({
    ...prev,
    lastLoadedAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    lastResult: { created: 0, updated: 2, deleted: 0 },
  })),
);

// Login Security: the demo has a security key and TOTP plugin.
get("/plugin-api/login-security/status", () => ({
  factors: [
    { id: "totp", pluginId: "totp" },
    { id: "security-key", pluginId: "webauthn" },
  ],
}));
post("/plugin-api/login-security/activity", () => ({ ok: true }));
get("/plugin-api/login-security/policy", () => ({}));

// Sync: remote sites mirrored as locked hosts.
interface Site {
  id: number;
  name: string;
  baseUrl: string;
  shareRoles: number[];
  status: "pending" | "ok" | "error";
  lastError: string | null;
  lastSeenAt: string | null;
  hostCount: number | null;
}
const sites = collection<Site>("sync-sites", () => []);

const SITE_HOSTS = [
  { name: "edge-gw", ip: "172.20.4.10", status: "online" },
  { name: "edge-cache", ip: "172.20.4.11", status: "online" },
  { name: "edge-backup", ip: "172.20.4.12", status: "offline" },
];

async function mirror(site: Site) {
  const folder = `Site: ${site.name}`;
  await dispatch("PUT", "/host/folders/metadata", {
    name: folder,
    color: "#38bdf8",
    icon: "cloud-cog",
  });
  for (const [i, seed] of SITE_HOSTS.entries()) {
    hosts.insert({
      id: hosts.nextId(),
      name: seed.name,
      ip: seed.ip,
      port: 22,
      sshPort: 22,
      username: "root",
      folder,
      tags: [],
      pin: false,
      authType: "password",
      enableSsh: true,
      connectionType: "ssh",
      statusCheckEnabled: true,
      userId: DEMO_USER_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lock: {
        pluginId: "sync",
        pluginName: "Sync",
        note: `Managed from ${site.name}`,
      },
      pluginSettings: {
        "ssh-terminal": { enableTerminal: true },
        sync: {
          siteId: site.id,
          remoteId: 100 + i,
          remoteStatus: seed.status,
        },
      },
    } as never);
  }
}

function overview() {
  const all = sites.all();
  const mirrored = hosts
    .all()
    .filter((h) => h.pluginSettings?.sync?.siteId !== undefined);
  const online = mirrored.filter(
    (h) => h.pluginSettings?.sync?.remoteStatus === "online",
  ).length;
  return {
    sites: all.length,
    reachable: all.filter((s) => s.status === "ok").length,
    unreachable: all.filter((s) => s.status === "error").length,
    hosts: mirrored.length,
    online,
    offline: mirrored.length - online,
  };
}

get("/plugin-api/sync/sites", () => ({ sites: sites.all() }));
get("/plugin-api/sync/overview", () => overview());
get("/plugin-api/sync/roles", () => ({
  roles: [
    { id: 1, name: "admin", displayName: "Admin" },
    { id: 2, name: "user", displayName: "User" },
    { id: 3, name: "ops", displayName: "Ops" },
  ],
}));
post("/plugin-api/sync/sites", async (req) => {
  const body = req.body as {
    name: string;
    baseUrl: string;
    shareRoles?: number[];
  };
  const site: Site = {
    id: sites.nextId(),
    name: body.name,
    baseUrl: body.baseUrl,
    shareRoles: body.shareRoles ?? [],
    status: "ok",
    lastError: null,
    lastSeenAt: new Date().toISOString(),
    hostCount: SITE_HOSTS.length,
  };
  sites.insert(site);
  await mirror(site);
  window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
  return { site };
});
put("/plugin-api/sync/sites/:id", (req) => {
  const body = req.body as Partial<Site>;
  const site = sites.patch(req.params.id, {
    name: body.name,
    baseUrl: body.baseUrl,
    shareRoles: body.shareRoles ?? [],
  });
  return { site };
});
post("/plugin-api/sync/sites/:id/refresh", (req) => ({
  site: sites.patch(req.params.id, { lastSeenAt: new Date().toISOString() }),
}));
del("/plugin-api/sync/sites/:id", (req) => {
  const id = Number(req.params.id);
  hosts
    .all()
    .filter((h) => h.pluginSettings?.sync?.siteId === id)
    .forEach((h) => hosts.remove(h.id));
  sites.remove(id);
  window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
  return { success: true };
});
get("/plugin-api/sync/accounts", () => ({ accounts: [] }));
get("/plugin-api/sync/web/accounts", () => ({ ring: true, accounts: [] }));
