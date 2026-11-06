import { del, get, post, put } from "../../router";
import { collection, value } from "../../store";

const P = "/plugin-api/dns";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const providers = [
  {
    id: "cloudflare",
    fields: [{ key: "apiToken", type: "secret", required: true }],
    features: {
      types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"],
      proxied: true,
      comment: true,
      autoTtl: true,
      minTtl: 60,
      domains: false,
    },
  },
  {
    id: "porkbun",
    fields: [
      { key: "apiKey", type: "text", required: true },
      { key: "secretKey", type: "secret", required: true },
    ],
    features: {
      types: ["A", "AAAA", "CNAME", "MX", "TXT", "NS"],
      proxied: false,
      comment: false,
      autoTtl: false,
      minTtl: 600,
      domains: true,
    },
  },
];

interface Account {
  id: number;
  provider: string;
  name: string;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  autoBackup: boolean;
  checkHealth: boolean;
}
const accounts = collection<Account>("dns-accounts", () => [
  {
    id: 1,
    provider: "cloudflare",
    name: "Acme Cloudflare",
    status: "ok",
    lastError: null,
    lastSyncAt: ago(12),
    autoBackup: true,
    checkHealth: true,
  },
  {
    id: 2,
    provider: "porkbun",
    name: "Porkbun",
    status: "ok",
    lastError: null,
    lastSyncAt: ago(40),
    autoBackup: false,
    checkHealth: false,
  },
]);

const zones = [
  {
    id: "z-acme",
    name: "acme.example",
    accountId: 1,
    accountName: "Acme Cloudflare",
    provider: "cloudflare",
    nameservers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
  },
  {
    id: "z-lab",
    name: "homelab.example",
    accountId: 2,
    accountName: "Porkbun",
    provider: "porkbun",
    nameservers: ["curitiba.ns.porkbun.com", "fortaleza.ns.porkbun.com"],
  },
];

interface Rec {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number | null;
  proxied?: boolean;
  comment?: string;
}
const rec = (
  id: string,
  type: string,
  name: string,
  content: string,
  extra: Partial<Rec> = {},
): Rec => ({ id, type, name, content, ttl: 1, ...extra });

const records = value<Record<string, Rec[]>>("dns-records", () => ({
  "1/z-acme": [
    rec("r1", "A", "@", "203.0.113.10", { proxied: true }),
    rec("r2", "A", "www", "203.0.113.10", { proxied: true }),
    rec("r3", "CNAME", "docs", "acme.github.io", { ttl: 300 }),
    rec("r4", "MX", "@", "mail.acme.example", { ttl: 3600, priority: 10 }),
    rec("r5", "TXT", "@", "v=spf1 include:_spf.mail.example ~all", {
      ttl: 3600,
    }),
  ],
  "2/z-lab": [
    rec("p1", "A", "@", "198.51.100.7", { ttl: 600 }),
    rec("p2", "A", "nas", "192.168.1.20", { ttl: 600 }),
    rec("p3", "CNAME", "media", "nas.homelab.example", { ttl: 600 }),
  ],
}));

const domains = collection<Record<string, unknown> & { id: number }>(
  "dns-domains",
  () => [
    {
      id: 1,
      name: "acme.example",
      registrar: "Cloudflare Registrar",
      expiresAt: day(212),
      autoRenew: true,
      locked: true,
      nameservers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
      status: "active",
      accountId: 1,
      accountName: "Acme Cloudflare",
      source: "account",
      checkedAt: ago(30),
      daysLeft: 212,
    },
    {
      id: 2,
      name: "homelab.example",
      registrar: "Porkbun",
      expiresAt: day(19),
      autoRenew: false,
      locked: true,
      nameservers: ["curitiba.ns.porkbun.com"],
      status: "active",
      accountId: 2,
      accountName: "Porkbun",
      source: "account",
      checkedAt: ago(30),
      daysLeft: 19,
    },
  ],
);

const links = collection<Record<string, unknown> & { id: number }>(
  "dns-links",
  () => [
    {
      id: 1,
      accountId: 2,
      accountName: "Porkbun",
      zoneId: "z-lab",
      zoneName: "homelab.example",
      name: "nas",
      type: "A",
      source: "host",
      hostId: 8,
      hostName: "nas",
      ttl: 600,
      proxied: false,
      enabled: true,
      lastValue: "192.168.1.20",
      lastSyncAt: ago(4),
      lastError: null,
    },
  ],
);

const snapshots = collection<Record<string, unknown> & { id: number }>(
  "dns-snapshots",
  () => [
    {
      id: 1,
      accountId: 1,
      zoneId: "z-acme",
      zoneName: "acme.example",
      label: "Before MX change",
      source: "before",
      recordCount: 5,
      createdAt: ago(60 * 26),
    },
  ],
);

const key = (a: string, z: string) => `${a}/${decodeURIComponent(z)}`;

get(`${P}/providers`, () => ({ providers }));
get(`${P}/summary`, () => ({
  accounts: accounts.all().length,
  failingAccounts: 0,
  domains: domains.all().length,
  expiring: [{ name: "homelab.example", daysLeft: 19 }],
  links: links.all().length,
  failingLinks: 0,
}));
get(`${P}/accounts`, () => ({ accounts: accounts.all() }));
post(`${P}/accounts`, (req) => {
  const b = req.body as Partial<Account>;
  return accounts.insert({
    provider: "cloudflare",
    name: "Account",
    autoBackup: true,
    checkHealth: true,
    ...b,
    id: accounts.nextId(),
    status: "ok",
    lastError: null,
    lastSyncAt: ago(0),
  });
});
put(`${P}/accounts/:id`, (req) =>
  accounts.patch(req.params.id, req.body as Partial<Account>),
);
del(`${P}/accounts/:id`, (req) => {
  accounts.remove(req.params.id);
  return { ok: true };
});
post(`${P}/accounts/:id/test`, () => ({ zones: 1, domains: 1 }));
get(`${P}/zones`, () => ({ zones, errors: [] }));

const base = `${P}/accounts/:acc/zones/:zone`;
get(`${base}/records`, (req) => ({
  records: records.get()[key(req.params.acc, req.params.zone)] ?? [],
}));
post(`${base}/records`, (req) => {
  const k = key(req.params.acc, req.params.zone);
  const r = { ...(req.body as Rec), id: `n${Date.now()}` };
  records.update((all) => ({ ...all, [k]: [...(all[k] ?? []), r] }));
  return r;
});
put(`${base}/records/:rec`, (req) => {
  const k = key(req.params.acc, req.params.zone);
  const id = decodeURIComponent(req.params.rec);
  records.update((all) => ({
    ...all,
    [k]: (all[k] ?? []).map((x) =>
      x.id === id ? { ...x, ...(req.body as Rec), id } : x,
    ),
  }));
  return { ok: true };
});
del(`${base}/records/:rec`, (req) => {
  const k = key(req.params.acc, req.params.zone);
  const id = decodeURIComponent(req.params.rec);
  records.update((all) => ({
    ...all,
    [k]: (all[k] ?? []).filter((x) => x.id !== id),
  }));
  return { ok: true };
});
get(`${base}/snapshots`, (req) => ({
  snapshots: snapshots
    .all()
    .filter((s) => String(s.accountId) === req.params.acc),
}));
post(`${base}/snapshots`, (req) =>
  snapshots.insert({
    id: snapshots.nextId(),
    accountId: Number(req.params.acc),
    zoneId: decodeURIComponent(req.params.zone),
    zoneName: decodeURIComponent(req.params.zone),
    label: (req.body as { label?: string }).label ?? "",
    source: "manual",
    recordCount: 5,
    createdAt: ago(0),
  }),
);
get(`${P}/snapshots/:id/diff`, () => ({
  diff: [
    {
      kind: "change",
      type: "MX",
      name: "@",
      before: "10 mx.old.example",
      after: "10 mail.acme.example",
    },
  ],
}));
post(`${P}/snapshots/:id/restore`, () => ({ diff: [], applied: true }));
del(`${P}/snapshots/:id`, (req) => {
  snapshots.remove(req.params.id);
  return { ok: true };
});
get(`${base}/export`, () => ({
  name: "acme.example",
  text: "$ORIGIN acme.example.\n@ 300 IN A 203.0.113.10\nwww 300 IN A 203.0.113.10\n",
}));
post(`${base}/import`, () => ({ diff: [], skipped: [], applied: false }));

const report = () => ({
  zoneName: "acme.example",
  at: ago(0),
  checks: [
    { code: "delegation.ok", level: "ok", params: { count: 2 } },
    { code: "soa.same", level: "ok", params: { count: 1 } },
    { code: "dnssec.off", level: "info" },
    { code: "cname.ok", level: "ok" },
  ],
});
get(`${base}/health`, () => ({ report: report() }));
post(`${base}/health`, () => ({ report: report() }));
post(`${base}/propagation`, () => ({
  rows: [
    {
      record: "A acme.example",
      resolver: "1.1.1.1",
      answers: ["203.0.113.10"],
      match: true,
    },
    {
      record: "A acme.example",
      resolver: "8.8.8.8",
      answers: ["203.0.113.10"],
      match: true,
    },
  ],
}));

get(`${P}/domains`, () => ({ domains: domains.all() }));
post(`${P}/domains`, (req) =>
  domains.insert({
    id: domains.nextId(),
    name: (req.body as { name: string }).name,
    registrar: null,
    expiresAt: day(300),
    autoRenew: null,
    locked: null,
    nameservers: [],
    status: "active",
    accountId: null,
    accountName: null,
    source: "watch",
    checkedAt: ago(0),
    daysLeft: 300,
  }),
);
post(`${P}/domains/refresh`, () => ({
  count: domains.all().length,
  failed: 0,
}));
del(`${P}/domains/:id`, (req) => {
  domains.remove(req.params.id);
  return { ok: true };
});

get(`${P}/hosts`, () => ({
  hosts: [
    { id: 1, name: "web-01", ip: "10.0.12.21" },
    { id: 8, name: "nas", ip: "192.168.1.20" },
  ],
}));
get(`${P}/links`, () => ({ links: links.all() }));
post(`${P}/links`, (req) =>
  links.insert({
    ...(req.body as object),
    id: links.nextId(),
    accountName: "Porkbun",
    hostName: null,
    lastValue: null,
    lastSyncAt: null,
    lastError: null,
  }),
);
put(`${P}/links/:id`, (req) =>
  links.patch(req.params.id, req.body as Record<string, unknown>),
);
del(`${P}/links/:id`, (req) => {
  links.remove(req.params.id);
  return { ok: true };
});
post(`${P}/links/:id/sync`, () => ({ changed: false }));
