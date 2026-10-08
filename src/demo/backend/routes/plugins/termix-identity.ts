import { del, get, patch, post, put } from "../../router";
import { collection, value } from "../../store";
import { credentials } from "../hosts";

const P = "/plugin-api/termix-identity";
const stamp = new Date(Date.now() - 40 * 864e5).toISOString();
const ORIGIN = "https://demo.termix.site";

const identity = value<null | {
  id: number;
  userId: string;
  handle: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}>("termix-id", () => ({
  id: 1,
  userId: "demo-user",
  handle: "demo",
  description: "Homelab and work keys",
  createdAt: stamp,
  updatedAt: stamp,
}));

function withResolver<T extends { handle: string } | null>(record: T) {
  if (!record) return record;
  return {
    ...record,
    resolverPath: `/id/${record.handle}.keys`,
    resolverUrl: `${ORIGIN}/id/${record.handle}.keys`,
  };
}

function key(
  id: number,
  label: string,
  keyType: string,
  source: string,
  credentialId: number | null,
) {
  return {
    id,
    identityId: 1,
    userId: "demo-user",
    publicKey: `${keyType} AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyIdentityKey${id} ${label}`,
    keyType,
    algorithm: keyType === "ssh-rsa" ? "RSA 4096" : "Ed25519",
    label,
    comment: label,
    source,
    credentialId,
    enabled: true,
    createdAt: stamp,
  };
}

const keys = collection("termix-id-keys", () => [
  key(1, "laptop", "ssh-ed25519", "upload", null),
  key(2, "deploy key", "ssh-ed25519", "credential", 1),
  key(3, "yubikey", "sk-ssh-ed25519@openssh.com", "upload", null),
]);
const ca = value<null | { publicKey: string; validityDays: number }>(
  "termix-id-ca",
  () => ({
    publicKey:
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyTermixCertificateAuthority termix-ca",
    validityDays: 7,
  }),
);

function caView() {
  const current = ca.get();
  if (!current) return null;
  return {
    ...current,
    resolverPath: "/id/ca.pub",
    resolverUrl: `${ORIGIN}/id/ca.pub`,
  };
}

get(`${P}/me`, () => ({
  identity: withResolver(identity.get()),
  keys: identity.get() ? keys.all() : [],
}));
get(`${P}/check/:handle`, () => ({ available: true, valid: true }));
post(`${P}/`, (req) => {
  const body = req.body as { handle: string; description?: string };
  const record = {
    id: 1,
    userId: "demo-user",
    handle: body.handle,
    description: body.description ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  identity.set(record);
  return withResolver(record);
});
put(`${P}/`, (req) =>
  withResolver(
    identity.update((prev) => ({
      ...prev!,
      ...(req.body as object),
      updatedAt: new Date().toISOString(),
    })),
  ),
);
del(`${P}/`, () => {
  identity.set(null);
  keys.replace([]);
  return { success: true };
});
post(`${P}/keys`, (req) => {
  const body = req.body as {
    publicKey?: string;
    label?: string;
    credentialId?: number;
  };
  const record = {
    ...key(
      keys.nextId(),
      body.label ?? "key",
      "ssh-ed25519",
      body.credentialId ? "credential" : "upload",
      body.credentialId ?? null,
    ),
    publicKey:
      body.publicKey ??
      key(0, body.label ?? "key", "ssh-ed25519", "upload", null).publicKey,
  };
  keys.insert(record);
  return record;
});
post(`${P}/keys/generate`, (req) => {
  const { type } = req.body as { type: "ed25519" | "rsa" };
  const record = key(
    keys.nextId(),
    "generated",
    type === "rsa" ? "ssh-rsa" : "ssh-ed25519",
    "generated",
    null,
  );
  keys.insert(record);
  return {
    key: record,
    privateKey:
      "-----BEGIN OPENSSH PRIVATE KEY-----\nThis is a demo. No real key material is generated here.\n-----END OPENSSH PRIVATE KEY-----",
    publicKey: record.publicKey,
    credentialId: null,
  };
});
patch(`${P}/keys/:id`, (req) => keys.patch(req.params.id, req.body as object));
del(`${P}/keys/:id`, (req) => {
  keys.remove(req.params.id);
  return { success: true };
});
get(`${P}/ca`, () => ({ ca: caView() }));
post(`${P}/ca`, (req) => {
  ca.set({
    publicKey:
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyTermixCertificateAuthority termix-ca",
    validityDays:
      Number((req.body as { validityDays?: number })?.validityDays) || 7,
  });
  return caView();
});
post(`${P}/ca/rotate`, (req) => {
  ca.set({
    publicKey: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyRotated${Date.now()} termix-ca`,
    validityDays:
      Number((req.body as { validityDays?: number })?.validityDays) ||
      ca.get()?.validityDays ||
      7,
  });
  return caView();
});
del(`${P}/ca`, () => {
  ca.set(null);
  return { success: true };
});
post(`${P}/keys/:id/certificate`, (req) => {
  const validityDays = ca.get()?.validityDays ?? 7;
  const principals = (
    (req.body as { principals?: string[] })?.principals ?? ["deploy"]
  ).filter(Boolean);
  return {
    certificate: `ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1NTE5LWNlcnQtdjAxDemoOnlyCert${req.params.id} demo`,
    keyId: `demo-${req.params.id}`,
    validBefore: Math.floor(Date.now() / 1000) + validityDays * 86400,
    principals,
    validityDays,
  };
});
get(`${P}/linked-credentials`, () => ({
  credentialIds: keys
    .all()
    .map((k) => k.credentialId)
    .filter((id): id is number => id !== null),
}));
get(`${P}/credentials`, () => ({
  credentials: credentials.all().map((c) => ({ id: c.id, name: c.name })),
}));
