import { del, get, HttpError, post, put } from "../router";
import { credentials, hosts } from "./hosts";

type CredentialRecord = ReturnType<typeof credentials.all>[number] &
  Record<string, unknown>;

function publicCredential(record: CredentialRecord) {
  const out = { ...record };
  delete out.password;
  delete out.key;
  delete out.privateKey;
  delete out.keyPassword;
  return {
    ...out,
    usageCount: hosts.all().filter((h) => h.credentialId === record.id).length,
  };
}

function write(body: Record<string, unknown>, existing?: CredentialRecord) {
  const next: Record<string, unknown> = { ...(existing ?? {}), ...body };
  if (typeof next.tags === "string") {
    next.tags = (next.tags as string).split(",").filter(Boolean);
  }
  if (next.authType === "key" && typeof body.key === "string" && body.key) {
    next.keyType = next.keyType || "ssh-ed25519";
    next.detectedKeyType = next.keyType;
    if (!next.publicKey) {
      next.publicKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyGenerated ${next.username ?? "user"}@termix`;
    }
  }
  delete next.password;
  delete next.key;
  delete next.keyPassword;
  next.updatedAt = new Date().toISOString();
  return next as CredentialRecord;
}

get("/credentials", () => credentials.all().map(publicCredential));
get("/credentials/folders", () => [
  ...new Set(
    credentials
      .all()
      .map((c) => c.folder)
      .filter(Boolean),
  ),
]);
get("/credentials/:id", (req) => {
  const record = credentials.find(req.params.id);
  if (!record) throw new HttpError(404, { error: "Credential not found" });
  return publicCredential(record as CredentialRecord);
});
get("/credentials/:id/hosts", (req) =>
  hosts
    .all()
    .filter((h) => String(h.credentialId) === req.params.id)
    .map((h) => ({ id: h.id, name: h.name, ip: h.ip, port: h.port })),
);
post("/credentials", (req) => {
  const now = new Date().toISOString();
  const record = write({
    tags: [],
    folder: "",
    ...(req.body as Record<string, unknown>),
    id: credentials.nextId(),
    createdAt: now,
    usageCount: 0,
  });
  credentials.insert(record as never);
  return publicCredential(record);
});
put("/credentials/:id", (req) => {
  const existing = credentials.find(req.params.id) as CredentialRecord;
  if (!existing) throw new HttpError(404, { error: "Credential not found" });
  credentials.patch(
    existing.id,
    write(req.body as Record<string, unknown>, existing) as never,
  );
  return publicCredential(credentials.find(existing.id) as CredentialRecord);
});
del("/credentials/:id", (req) => {
  credentials.remove(req.params.id);
  for (const host of hosts.all()) {
    if (String(host.credentialId) === req.params.id) {
      hosts.patch(host.id, { credentialId: undefined });
    }
  }
  return { message: "Credential deleted" };
});
put("/credentials/folders/rename", (req) => {
  const { oldName, newName } = req.body as { oldName: string; newName: string };
  for (const c of credentials.all()) {
    if (c.folder === oldName) credentials.patch(c.id, { folder: newName });
  }
});
put("/credentials/reorder", (req) => {
  const { credentials: order = [] } = (req.body ?? {}) as {
    credentials?: Array<{ id: number; sortOrder: number; folder?: string }>;
  };
  for (const entry of order) credentials.patch(entry.id, entry as never);
  return { updated: order.length };
});
post("/host/db/host/:hostId/apply-credential", (req) => {
  hosts.patch(req.params.hostId, {
    credentialId: Number((req.body as { credentialId?: number })?.credentialId),
    authType: "credential",
  });
});
post("/credentials/detect-key-type", () => ({
  success: true,
  keyType: "ssh-ed25519",
}));
post("/credentials/detect-public-key-type", () => ({
  success: true,
  keyType: "ssh-ed25519",
}));
post("/credentials/validate-key-pair", () => ({
  isValid: true,
  privateKeyType: "ssh-ed25519",
  publicKeyType: "ssh-ed25519",
}));
post("/credentials/generate-public-key", () => ({
  success: true,
  publicKey:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyDerivedPublicKey demo@termix",
  keyType: "ssh-ed25519",
}));
post("/credentials/generate-key-pair", (req) => {
  const { keyType = "ssh-ed25519" } = (req.body ?? {}) as { keyType?: string };
  return {
    success: true,
    keyType,
    privateKey:
      "-----BEGIN OPENSSH PRIVATE KEY-----\nThis is a demo. No real key material is generated here.\n-----END OPENSSH PRIVATE KEY-----",
    publicKey: `${keyType} AAAAC3NzaC1lZDI1NTE5AAAAIDemoOnlyGeneratedKey demo@termix`,
  };
});
post("/credentials/:id/deploy-to-host", () => ({
  success: true,
  message: "Key added to authorized_keys",
}));
get("/host/db/host/:id/with-credentials", (req) => {
  const host = hosts.find(req.params.id);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  const cred = host.credentialId ? credentials.find(host.credentialId) : null;
  return {
    ...host,
    username: host.username || cred?.username,
    password: undefined,
    key: undefined,
  };
});
get("/host/db/host/:id/password", () => ({ value: null }));
post("/host/db/host/:hostId/migrate-to-credential", (req) => {
  const host = hosts.find(req.params.hostId);
  if (!host) throw new HttpError(404, { error: "Host not found" });
  const { credentialName } = req.body as { credentialName: string };
  const id = credentials.nextId();
  credentials.insert({
    ...credentials.all()[0],
    id,
    name: credentialName,
    username: host.username,
    authType: host.authType === "key" ? "key" : "password",
    folder: host.folder,
    description: "",
    tags: [],
    createdAt: new Date().toISOString(),
  } as never);
  hosts.patch(host.id, { credentialId: id, authType: "credential" });
  return { success: true, credentialId: id };
});
