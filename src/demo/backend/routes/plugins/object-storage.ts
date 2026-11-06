import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/object-storage";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const GB = 1_000_000_000;

const providers = [
  {
    id: "aws",
    endpoint: "https://s3.{region}.amazonaws.com",
    region: "us-east-1",
    pathStyle: false,
  },
  {
    id: "minio",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    pathStyle: true,
  },
  {
    id: "r2",
    endpoint: "https://{accountId}.r2.cloudflarestorage.com",
    region: "auto",
    pathStyle: true,
    needsAccountId: true,
  },
  { id: "other", endpoint: "", region: "us-east-1", pathStyle: true },
];

interface Account extends Record<string, unknown> {
  id: number;
}
const accounts = collection<Account>("object-storage-accounts", () => [
  {
    id: 1,
    provider: "aws",
    name: "Acme AWS",
    endpoint: "https://s3.eu-west-1.amazonaws.com",
    region: "eu-west-1",
    pathStyle: false,
    hasCa: false,
    status: "ok",
    lastError: null,
    lastCheckAt: ago(3),
  },
  {
    id: 2,
    provider: "minio",
    name: "Homelab MinIO",
    endpoint: "http://192.168.1.20:9000",
    region: "us-east-1",
    pathStyle: true,
    hasCa: false,
    status: "ok",
    lastError: null,
    lastCheckAt: ago(3),
  },
]);

interface Bucket {
  name: string;
  createdAt: string;
  bytes: number;
  objects: number;
  maxBytes: number | null;
  maxObjects: number | null;
}
const buckets: Record<string, Bucket[]> = {
  "1": [
    {
      name: "acme-assets",
      createdAt: ago(60 * 24 * 300),
      bytes: 38 * GB,
      objects: 91_400,
      maxBytes: 50 * GB,
      maxObjects: null,
    },
    {
      name: "acme-backups",
      createdAt: ago(60 * 24 * 200),
      bytes: 412 * GB,
      objects: 2_310,
      maxBytes: null,
      maxObjects: null,
    },
  ],
  "2": [
    {
      name: "media",
      createdAt: ago(60 * 24 * 90),
      bytes: 160 * GB,
      objects: 5_220,
      maxBytes: null,
      maxObjects: null,
    },
  ],
};
const bucketRows = (id: string) =>
  (buckets[id] ?? []).map((b) => ({
    ...b,
    partial: false,
    scannedAt: ago(60 * 6),
  }));

get(`${P}/providers`, () => ({ providers }));
get(`${P}/summary`, () => {
  const rows = Object.values(buckets).flat();
  return {
    accounts: accounts.all().length,
    failingAccounts: 0,
    buckets: rows.length,
    bytes: rows.reduce((n, b) => n + b.bytes, 0),
    overQuota: [{ account: "Acme AWS", bucket: "acme-assets", percent: 76 }],
  };
});
get(`${P}/accounts`, () => ({ accounts: accounts.all() }));
post(`${P}/accounts`, (req) =>
  accounts.insert({
    provider: "other",
    hasCa: false,
    lastError: null,
    ...(req.body as object),
    id: accounts.nextId(),
    status: "ok",
    lastCheckAt: ago(0),
  } as Account),
);
put(`${P}/accounts/:id`, (req) =>
  accounts.patch(req.params.id, req.body as Partial<Account>),
);
del(`${P}/accounts/:id`, (req) => {
  accounts.remove(req.params.id);
  return { ok: true };
});
post(`${P}/accounts/:id/test`, (req) => ({
  buckets: (buckets[req.params.id] ?? []).length,
}));
get(`${P}/accounts/:id/buckets`, (req) => ({
  buckets: bucketRows(req.params.id),
}));
post(`${P}/accounts/:id/buckets`, (req) => {
  const name = (req.body as { name: string }).name;
  const list = (buckets[req.params.id] ??= []);
  list.push({
    name,
    createdAt: ago(0),
    bytes: 0,
    objects: 0,
    maxBytes: null,
    maxObjects: null,
  });
  return { ok: true };
});

const base = `${P}/accounts/:id/buckets/:bucket`;
del(base, (req) => {
  buckets[req.params.id] = (buckets[req.params.id] ?? []).filter(
    (b) => b.name !== decodeURIComponent(req.params.bucket),
  );
  return { ok: true };
});
put(`${base}/limit`, () => ({ ok: true }));
get(`${base}/usage`, () => ({
  points: Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.now() - (29 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    bytes: (30 + i * 0.3) * GB,
    objects: 90_000 + i * 50,
  })),
}));
post(`${base}/scan`, () => ({
  bytes: 38 * GB,
  objects: 91_400,
  partial: false,
}));
get(`${base}/objects`, (req) => {
  const prefix = req.query.prefix ?? "";
  if (prefix === "") {
    return {
      prefix,
      folders: ["images/", "docs/"],
      objects: [
        {
          key: "index.html",
          size: 5_120,
          modifiedAt: ago(60 * 20),
          etag: "a1",
          storageClass: "STANDARD",
        },
        {
          key: "robots.txt",
          size: 64,
          modifiedAt: ago(60 * 24 * 40),
          etag: "b2",
          storageClass: "STANDARD",
        },
      ],
      next: null,
    };
  }
  return {
    prefix,
    folders: [],
    objects: [
      {
        key: `${prefix}logo.png`,
        size: 48_200,
        modifiedAt: ago(60 * 24 * 3),
        etag: "c3",
        storageClass: "STANDARD",
      },
      {
        key: `${prefix}hero.jpg`,
        size: 812_000,
        modifiedAt: ago(60 * 24 * 9),
        etag: "d4",
        storageClass: "STANDARD",
      },
    ],
    next: null,
  };
});
get(`${base}/head`, (req) => ({
  key: req.query.key,
  size: 48_200,
  contentType: "image/png",
  modifiedAt: ago(60 * 24 * 3),
  etag: "c3",
  metadata: {},
}));
post(`${base}/folder`, () => ({ ok: true }));
post(`${base}/delete`, (req) => ({
  deleted: ((req.body as { keys?: string[] }).keys ?? []).length || 1,
  failed: [],
}));
post(`${base}/copy`, () => ({ ok: true }));
post(`${base}/move`, () => ({ ok: true }));
post(`${base}/share`, (req) => ({
  url: `https://demo.invalid/${(req.body as { key: string }).key}?signature=demo`,
  expiresAt: ago(-60),
}));
get(`${base}/settings`, () => ({
  versioning: { supported: true, status: "Enabled" },
  lifecycle: {
    supported: true,
    rules: [
      {
        id: "expire-tmp",
        prefix: "tmp/",
        enabled: true,
        expireDays: 7,
        noncurrentDays: null,
        abortUploadDays: 1,
      },
    ],
  },
  cors: { supported: true, rules: [] },
  policy: { supported: true, text: "" },
  tags: { supported: true, tags: [{ key: "team", value: "web" }] },
  encryption: { supported: true, enabled: true },
  publicAccess: {
    supported: true,
    block: {
      blockPublicAcls: true,
      ignorePublicAcls: true,
      blockPublicPolicy: true,
      restrictPublicBuckets: true,
    },
  },
}));
put(`${base}/settings/:kind`, () => ({ ok: true }));
