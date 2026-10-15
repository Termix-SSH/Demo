import { del, get, HttpError, post, put } from "../../router";
import { collection, value } from "../../store";

// Sign in, certificates and secrets plugins. Their screens are mostly
// settings, so they only need a few believable records.

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

// ACME: a Let's Encrypt certificate that renews on its own.
const acme = value("acme-state", () => ({
  lastAttemptAt: ago(29),
  lastIssuedAt: ago(29),
}));
get("/plugin-api/acme-ssl/status", () => ({
  tls: {
    enabled: true,
    certificate: {
      issuer: "Let's Encrypt R11",
      names: ["termix.example.com"],
      notAfter: new Date(
        new Date(acme.get().lastIssuedAt).getTime() + 90 * 864e5,
      ).toISOString(),
      selfSigned: false,
    },
  },
  state: { ...acme.get(), lastError: null },
  autoRenew: true,
  missing: null,
}));
post("/plugin-api/acme-ssl/request", async () => {
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const now = new Date().toISOString();
  acme.set({ lastAttemptAt: now, lastIssuedAt: now });
  return { reloadMessage: "The new certificate is live. No restart needed." };
});

// LDAP: one company directory.
type Provider = {
  id: number;
  name: string;
  enabled: boolean;
  displayOrder: number;
  config: Record<string, unknown>;
};
const ldap = collection<Provider & { hasBindPassword: boolean }>(
  "ldap-providers",
  () => [
    {
      id: 1,
      name: "Company directory",
      enabled: true,
      displayOrder: 0,
      hasBindPassword: true,
      config: {
        host: "ldap.example.com",
        port: "636",
        useTLS: true,
        tlsSkipVerify: false,
        bindDN: "cn=termix,ou=services,dc=example,dc=com",
        userSearchBase: "ou=people,dc=example,dc=com",
        userSearchFilter: "(uid={{username}})",
        usernameAttribute: "uid",
        groupSearchBase: "ou=groups,dc=example,dc=com",
        adminGroup: "ops-admins",
        allowedUsers: "",
      },
    },
  ],
);
get("/plugin-api/ldap/providers", () => ({ providers: ldap.all() }));
post("/plugin-api/ldap/providers", (req) => {
  const body = req.body as Partial<Provider>;
  return ldap.insert({
    id: ldap.nextId(),
    name: body.name ?? "Directory",
    enabled: body.enabled ?? true,
    displayOrder: ldap.all().length,
    config: body.config ?? {},
    hasBindPassword: !!body.config?.bindPassword,
  });
});
put("/plugin-api/ldap/providers/:id", (req) => {
  const body = req.body as Partial<Provider>;
  const found = ldap.find(req.params.id);
  if (!found) throw new HttpError(404, { error: "Provider not found" });
  return ldap.patch(req.params.id, {
    ...body,
    config: { ...found.config, ...(body.config ?? {}) },
  });
});
del("/plugin-api/ldap/providers/:id", (req) => {
  ldap.remove(req.params.id);
});

// SSO: an Authentik provider and GitHub.
const REDIRECT = "https://termix.example.com/plugin-api/sso/callback";
const sso = collection<
  Provider & {
    type: "oidc" | "github" | "google";
    legacyCallback: boolean;
    hasClientSecret: boolean;
    redirectUri: string;
  }
>("sso-providers", () => [
  {
    id: 1,
    name: "Authentik",
    type: "oidc",
    enabled: true,
    displayOrder: 0,
    legacyCallback: false,
    hasClientSecret: true,
    redirectUri: `${REDIRECT}/1`,
    config: {
      client_id: "termix",
      issuer_url: "https://auth.example.com/application/o/termix/",
      identifier_path: "sub",
      name_path: "preferred_username",
      scopes: "openid email profile groups",
      admin_group: "termix-admins",
      group_claim: "groups",
    },
  },
  {
    id: 2,
    name: "GitHub",
    type: "github",
    enabled: true,
    displayOrder: 1,
    legacyCallback: false,
    hasClientSecret: true,
    redirectUri: `${REDIRECT}/2`,
    config: { client_id: "Iv23liExampleClient", allowed_users: "" },
  },
]);
get("/plugin-api/sso/providers", () => ({
  providers: sso.all(),
  newRedirectUri: `${REDIRECT}/${sso.nextId()}`,
}));
post("/plugin-api/sso/providers", (req) => {
  const body = req.body as Partial<Provider> & { type?: "oidc" };
  const id = sso.nextId();
  return sso.insert({
    id,
    name: body.name ?? "Provider",
    type: body.type ?? "oidc",
    enabled: body.enabled ?? true,
    displayOrder: sso.all().length,
    legacyCallback: false,
    hasClientSecret: !!body.config?.client_secret,
    redirectUri: `${REDIRECT}/${id}`,
    config: body.config ?? {},
  });
});
put("/plugin-api/sso/providers/:id", (req) => {
  const body = req.body as Partial<Provider>;
  const found = sso.find(req.params.id);
  if (!found) throw new HttpError(404, { error: "Provider not found" });
  return sso.patch(req.params.id, {
    ...body,
    config: { ...found.config, ...(body.config ?? {}) },
  });
});
del("/plugin-api/sso/providers/:id", (req) => {
  sso.remove(req.params.id);
});

// Secret sources: a 1Password Connect server.
const sources = collection("secret-sources", () => [
  {
    id: "src-1",
    name: "Team 1Password",
    kind: "onepassword-connect" as const,
    baseUrl: "https://op-connect.example.com",
    shared: true,
    owned: true,
    createdAt: ago(40),
    updatedAt: ago(3),
  },
]);
get("/plugin-api/secret-sources", () => ({ sources: sources.all() }));
post("/plugin-api/secret-sources", (req) => {
  const body = req.body as { name: string; baseUrl: string; shared?: boolean };
  const source = sources.insert({
    id: `src-${Date.now()}`,
    name: body.name,
    kind: "onepassword-connect",
    baseUrl: body.baseUrl,
    shared: !!body.shared,
    owned: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return { source };
});
put("/plugin-api/secret-sources/:id", (req) => {
  sources.patch(req.params.id, {
    ...(req.body as object),
    updatedAt: new Date().toISOString(),
  });
  return { success: true };
});
del("/plugin-api/secret-sources/:id", (req) => {
  sources.remove(req.params.id);
  return { success: true };
});
post("/plugin-api/secret-sources/:id/test", async () => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { ok: true, vaults: 3 };
});

// Vault: one SSH signer profile.
const vault = collection("vault-profiles", () => [
  {
    id: 1,
    name: "Prod signer",
    vaultAddr: "https://vault.example.com",
    vaultNamespace: null,
    oidcMount: "oidc",
    oidcRole: "termix",
    sshMount: "ssh-client-signer",
    sshRole: "ops",
    validPrincipals: "deploy,ubuntu",
    keyType: "ed25519",
    shared: true,
    owned: true,
  },
]);
get("/plugin-api/vault/profiles", () => vault.all());
post("/plugin-api/vault/profiles", (req) =>
  vault.insert({
    ...(req.body as Omit<ReturnType<typeof vault.all>[number], "id">),
    id: vault.nextId(),
    owned: true,
  }),
);
put("/plugin-api/vault/profiles/:id", (req) =>
  vault.patch(req.params.id, req.body as object),
);
del("/plugin-api/vault/profiles/:id", (req) => {
  vault.remove(req.params.id);
});

// Tailscale: a small tailnet.
const TAILNET = [
  ["laptop", "macOS", "100.101.4.12", 0.01],
  ["web-01", "linux", "100.88.20.21", 0.02],
  ["web-02", "linux", "100.88.20.22", 0.02],
  ["proxmox", "linux", "100.64.7.10", 0.05],
  ["nas", "linux", "100.64.7.20", 0.3],
  ["phone", "iOS", "100.120.9.4", 2.5],
  ["edge-ams", "linux", "100.71.3.11", 0.1],
] as const;
get("/plugin-api/tailscale/devices", () => ({
  hasApiKey: true,
  devices: TAILNET.map(([name, os, ip, hours], i) => ({
    id: `node-${i + 1}`,
    name: `${name}.tail4c2e.ts.net`,
    hostname: name,
    addresses: [ip, `fd7a:115c:a1e0::${i + 1}`],
    os,
    lastSeen: new Date(Date.now() - hours * 3.6e6).toISOString(),
  })),
}));
get("/plugin-api/tailscale/host-metrics-manager/:hostId", () => ({
  installed: true,
  running: true,
  tailscaleIPs: ["100.88.20.21"],
  hostname: "web-01",
  exitNodeInUse: false,
  peers: TAILNET.filter(([name]) => name !== "web-01").map(
    ([name, , ip, hours]) => ({
      hostname: name,
      tailscaleIPs: [ip],
      online: hours < 1,
      isExitNode: name === "edge-ams",
    }),
  ),
}));
post("/plugin-api/tailscale/host-metrics-manager/:hostId/:action", () => ({
  success: true,
}));

// Telemetry: what one report would send.
get("/plugin-api/telemetry/preview", () => ({
  instanceId: "7f3c1a9e-2b4d-4e8a-9c61-1d5f0b7a3e22",
  version: "26.10.1",
  platform: { os: "linux", arch: "x64", database: "sqlite", docker: true },
  counts: { hosts: 16, users: 3, credentials: 5 },
  plugins: [
    "docker",
    "file-manager",
    "host-metrics",
    "ssh-terminal",
    "tunnels",
  ],
  features: { terminal_opened: 41, file_edited: 6, tunnel_started: 3 },
}));
