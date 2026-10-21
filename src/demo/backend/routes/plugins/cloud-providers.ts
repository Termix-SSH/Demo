import { del, dispatch, get, HttpError, post, put } from "../../router";
import { collection } from "../../store";
import { credentials } from "../hosts";

const P = "/plugin-api/cloud-providers";

type Field = {
  key: string;
  type: "text" | "secret" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
};

const token: Field[] = [{ key: "token", type: "secret", required: true }];

// Same ids, users and fields as the plugin's providers.
const PROVIDERS: Array<{ id: string; defaultUser: string; fields: Field[] }> = [
  {
    id: "aws",
    defaultUser: "ec2-user",
    fields: [
      { key: "accessKeyId", type: "text", required: true },
      { key: "secretAccessKey", type: "secret", required: true },
      { key: "sessionToken", type: "secret", required: false },
      {
        key: "regions",
        type: "text",
        required: false,
        placeholder: "us-east-1, eu-west-1",
      },
      {
        key: "service",
        type: "select",
        required: true,
        options: ["ec2", "lightsail", "both"],
      },
    ],
  },
  {
    id: "azure",
    defaultUser: "azureuser",
    fields: [
      { key: "tenantId", type: "text", required: true },
      { key: "clientId", type: "text", required: true },
      { key: "clientSecret", type: "secret", required: true },
      { key: "subscriptionId", type: "text", required: true },
    ],
  },
  {
    id: "gcp",
    defaultUser: "ubuntu",
    fields: [
      { key: "serviceAccount", type: "textarea", required: true },
      { key: "projectId", type: "text", required: false },
    ],
  },
  { id: "digitalocean", defaultUser: "root", fields: token },
  { id: "hetzner", defaultUser: "root", fields: token },
  { id: "linode", defaultUser: "root", fields: token },
  { id: "vultr", defaultUser: "root", fields: token },
  {
    id: "oracle",
    defaultUser: "opc",
    fields: [
      { key: "tenancyId", type: "text", required: true },
      { key: "userId", type: "text", required: true },
      { key: "fingerprint", type: "text", required: true },
      { key: "privateKey", type: "textarea", required: true },
      {
        key: "regions",
        type: "text",
        required: true,
        placeholder: "us-ashburn-1",
      },
      {
        key: "compartments",
        type: "text",
        required: false,
        placeholder: "ocid1.compartment...",
      },
    ],
  },
  {
    id: "scaleway",
    defaultUser: "root",
    fields: [
      { key: "secretKey", type: "secret", required: true },
      { key: "zones", type: "text", required: false, placeholder: "fr-par-1" },
    ],
  },
  {
    id: "upcloud",
    defaultUser: "root",
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
  },
];

interface Account {
  id: number;
  provider: string;
  name: string;
  folder: string | null;
  defaultUser: string | null;
  defaultCredentialId: number | null;
  addressPreference: "public" | "private" | "public-first";
  syncMode: "manual" | "auto";
  intervalMinutes: number;
  onRemoved: "keep" | "mark" | "delete";
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
}

interface Instance {
  id: string;
  accountId: number;
  name: string;
  region: string;
  state: "running" | "stopped" | "other";
  address: string | null;
  imported: boolean;
}

const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const accounts = collection<Account>("cloud-accounts", () => [
  {
    id: 1,
    provider: "aws",
    name: "AWS production",
    folder: "Cloud / AWS",
    defaultUser: "ec2-user",
    defaultCredentialId: null,
    addressPreference: "public-first",
    syncMode: "auto",
    intervalMinutes: 30,
    onRemoved: "mark",
    status: "ok",
    lastError: null,
    lastSyncAt: ago(12),
  },
  {
    id: 2,
    provider: "hetzner",
    name: "Hetzner staging",
    folder: "Cloud / Hetzner",
    defaultUser: "root",
    defaultCredentialId: null,
    addressPreference: "public",
    syncMode: "manual",
    intervalMinutes: 60,
    onRemoved: "keep",
    status: "ok",
    lastError: null,
    lastSyncAt: ago(60 * 26),
  },
]);

const i = (
  accountId: number,
  id: string,
  name: string,
  region: string,
  state: Instance["state"],
  address: string | null,
): Instance => ({
  id,
  accountId,
  name,
  region,
  state,
  address,
  imported: false,
});

const instances = collection<Instance>("cloud-instances", () => [
  i(1, "i-0a91c3f2", "api-prod-1", "us-east-1", "running", "10.40.1.21"),
  i(1, "i-0b72d4e8", "api-prod-2", "us-east-1", "running", "10.40.1.22"),
  i(1, "i-0c13a9b0", "worker-prod", "us-east-1", "running", "10.40.2.10"),
  i(1, "i-0d55f1c7", "reports-batch", "eu-west-1", "stopped", "10.41.3.5"),
  i(1, "i-0e08b6aa", "bastion-eu", "eu-west-1", "running", "10.41.0.4"),
  i(1, "ls-blog", "blog (Lightsail)", "us-east-1", "running", "10.40.9.30"),
  i(2, "48213077", "stage-app", "fsn1", "running", "10.50.0.11"),
  i(2, "48213078", "stage-db", "fsn1", "running", "10.50.0.12"),
  i(2, "48213102", "stage-runner", "nbg1", "running", "10.50.0.20"),
  i(2, "48213140", "old-test", "hel1", "stopped", null),
]);

function account(id: string): Account {
  const found = accounts.find(id);
  if (!found) throw new HttpError(404, { error: "Account not found" });
  return found;
}

function report(created = 0, updated = 0, unchanged = 0, skipped = 0) {
  return { created, updated, unchanged, skipped, removed: 0, failed: 0 };
}

async function importInstances(acc: Account, list: Instance[]) {
  const fresh = list.filter((x) => !x.imported && x.address);
  if (fresh.length) {
    await dispatch("POST", "/host/bulk-import", {
      hosts: fresh.map((x) => ({
        name: x.name,
        ip: x.address,
        port: 22,
        username: acc.defaultUser ?? "root",
        folder: acc.folder ?? acc.name,
        tags: [`cloud:${acc.provider}`, `cloud:${x.region}`],
        connectionType: "ssh",
        authType: "password",
        enableSsh: true,
      })),
    });
    for (const x of fresh) instances.patch(x.id, { imported: true });
    // The real server pushes a host change, the sidebar listens for this.
    setTimeout(() => window.dispatchEvent(new Event("ssh-hosts:changed")), 0);
  }
  accounts.patch(acc.id, { lastSyncAt: new Date().toISOString() });
  return fresh.length;
}

function input(body: unknown) {
  const b = (body ?? {}) as Partial<Account> & {
    credentials?: Record<string, string>;
  };
  return {
    name: b.name ?? "Cloud account",
    folder: b.folder || null,
    defaultUser: b.defaultUser || null,
    defaultCredentialId: b.defaultCredentialId ?? null,
    addressPreference: b.addressPreference ?? "public-first",
    syncMode: b.syncMode ?? "manual",
    intervalMinutes: b.intervalMinutes ?? 60,
    onRemoved: b.onRemoved ?? "keep",
  };
}

get(`${P}/providers`, () => ({ providers: PROVIDERS }));
get(`${P}/credentials`, () => ({
  credentials: credentials.all().map((c) => {
    const r = c as { id: number; name: string; username?: string | null };
    return { id: r.id, name: r.name, username: r.username ?? null };
  }),
}));
get(`${P}/accounts`, () => ({ accounts: accounts.all() }));
post(`${P}/accounts`, (req) => {
  const b = (req.body ?? {}) as { provider?: string };
  const created = accounts.insert({
    id: accounts.nextId(),
    provider: b.provider ?? "aws",
    ...input(req.body),
    status: "ok",
    lastError: null,
    lastSyncAt: null,
  });
  // A new account finds a few servers so discovery has something to show.
  const n = created.id * 10;
  instances.replace([
    ...instances.all(),
    i(created.id, `srv-${n + 1}`, "web-1", "nyc3", "running", `10.60.${n}.11`),
    i(created.id, `srv-${n + 2}`, "web-2", "nyc3", "running", `10.60.${n}.12`),
    i(created.id, `srv-${n + 3}`, "db-1", "ams3", "running", `10.60.${n}.21`),
  ]);
  return { account: created };
});
put(`${P}/accounts/:id`, (req) => ({
  account: accounts.patch(account(req.params.id).id, input(req.body)),
}));
del(`${P}/accounts/:id`, (req) => {
  accounts.remove(account(req.params.id).id);
  return { ok: true };
});
post(`${P}/accounts/:id/test`, async (req) => {
  const acc = account(req.params.id);
  await new Promise((r) => setTimeout(r, 700));
  return {
    ok: true,
    count: instances.all().filter((x) => x.accountId === acc.id).length,
  };
});
post(`${P}/accounts/:id/discover`, async (req) => {
  const acc = account(req.params.id);
  await new Promise((r) => setTimeout(r, 900));
  return {
    instances: instances
      .all()
      .filter((x) => x.accountId === acc.id)
      .map(({ accountId: _a, ...rest }) => rest),
  };
});
post(`${P}/accounts/:id/import`, async (req) => {
  const acc = account(req.params.id);
  const { ids = [] } = (req.body ?? {}) as { ids?: string[] };
  const picked = instances
    .all()
    .filter((x) => x.accountId === acc.id && ids.includes(x.id));
  const created = await importInstances(acc, picked);
  return { report: report(created, 0, picked.length - created) };
});
post(`${P}/accounts/:id/sync`, async (req) => {
  const acc = account(req.params.id);
  await new Promise((r) => setTimeout(r, 1100));
  const mine = instances.all().filter((x) => x.accountId === acc.id);
  const known = mine.filter((x) => x.imported).length;
  const created = await importInstances(
    acc,
    mine.filter((x) => x.state === "running"),
  );
  return { report: report(created, known ? 1 : 0, Math.max(known - 1, 0)) };
});
