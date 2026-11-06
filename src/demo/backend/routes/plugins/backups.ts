import { del, get, post, put } from "../../router";
import { collection, value } from "../../store";

const P = "/plugin-api/backups";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) =>
  new Date(Date.now() + min * 60_000).toISOString();

interface Repo {
  id: number;
  name: string;
  kind: "s3" | "rest" | "rclone" | "local";
  location: Record<string, unknown>;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}
interface Job {
  id: number;
  hostId: number;
  repositoryId: number;
  name: string;
  enabled: boolean;
  sources: unknown[];
  hooks: { pre: string; post: string };
  cron: string;
  timezone: string;
  keep: Record<string, number>;
  alerts: { onFailure: boolean; staleDays: number };
  oneFileSystem: boolean;
  lastStatus: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastSnapshotId: string | null;
  lastBytes: number | null;
}
interface Run {
  id: number;
  jobId: number | null;
  jobName: string;
  hostId: number;
  kind: "backup" | "restore";
  trigger: "manual" | "schedule" | "operation";
  status: string;
  startedAt: string;
  finishedAt: string | null;
  snapshotId: string | null;
  progress: null;
  summary: Record<string, number> | null;
  error: string | null;
  target: null;
}

const repos = collection<Repo>("backups-repos", () => [
  {
    id: 1,
    name: "Storage box",
    kind: "rest",
    location: { url: "https://u123.storagebox.example:8000/termix" },
    hasSecret: true,
    createdAt: ago(60 * 24 * 40),
    updatedAt: ago(60 * 24 * 40),
  },
  {
    id: 2,
    name: "Wasabi bucket",
    kind: "s3",
    location: {
      endpoint: "https://s3.eu-central-1.wasabisys.com",
      bucket: "acme-backups",
      region: "eu-central-1",
      accessKeyId: "AKIADEMO0000000000",
    },
    hasSecret: true,
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 24 * 30),
  },
]);

const keep = { last: 3, daily: 7, weekly: 4, monthly: 6, yearly: 0 };
const jobs = collection<Job>("backups-jobs", () => [
  {
    id: 1,
    hostId: 3,
    repositoryId: 1,
    name: "Postgres nightly",
    enabled: true,
    sources: [
      {
        id: "s1",
        kind: "database",
        engine: "postgres",
        loginId: 0,
        address: "127.0.0.1",
        port: 5432,
        username: "postgres",
        hasPassword: true,
        runAs: "",
        databases: [],
      },
    ],
    hooks: { pre: "", post: "" },
    cron: "0 2 * * *",
    timezone: "UTC",
    keep,
    alerts: { onFailure: true, staleDays: 2 },
    oneFileSystem: false,
    lastStatus: "success",
    lastRunAt: ago(60 * 9),
    lastSuccessAt: ago(60 * 9),
    nextRunAt: ahead(60 * 15),
    lastSnapshotId: "a1b2c3d4e5f6",
    lastBytes: 1_840_000_000,
  },
  {
    id: 2,
    hostId: 1,
    repositoryId: 2,
    name: "Web files",
    enabled: true,
    sources: [
      {
        id: "s2",
        kind: "paths",
        paths: ["/var/www", "/etc/nginx"],
        excludes: ["*.log"],
      },
    ],
    hooks: { pre: "", post: "" },
    cron: "30 3 * * *",
    timezone: "UTC",
    keep,
    alerts: { onFailure: true, staleDays: 0 },
    oneFileSystem: true,
    lastStatus: "warning",
    lastRunAt: ago(60 * 8),
    lastSuccessAt: ago(60 * 32),
    nextRunAt: ahead(60 * 16),
    lastSnapshotId: "f6e5d4c3b2a1",
    lastBytes: 412_000_000,
  },
]);

const runs = value<Run[]>("backups-runs", () => [
  {
    id: 2,
    jobId: 2,
    jobName: "Web files",
    hostId: 1,
    kind: "backup",
    trigger: "schedule",
    status: "warning",
    startedAt: ago(60 * 8),
    finishedAt: ago(60 * 8 - 3),
    snapshotId: "f6e5d4c3b2a1",
    progress: null,
    summary: {
      filesNew: 14,
      filesChanged: 41,
      filesUnmodified: 18800,
      dataAdded: 38_000_000,
      totalFiles: 18855,
      totalBytes: 412_000_000,
      seconds: 171,
    },
    error: "/var/www/old was not found and was skipped",
    target: null,
  },
  {
    id: 1,
    jobId: 1,
    jobName: "Postgres nightly",
    hostId: 3,
    kind: "backup",
    trigger: "schedule",
    status: "success",
    startedAt: ago(60 * 9),
    finishedAt: ago(60 * 9 - 6),
    snapshotId: "a1b2c3d4e5f6",
    progress: null,
    summary: {
      filesNew: 1,
      filesChanged: 0,
      filesUnmodified: 0,
      dataAdded: 210_000_000,
      totalFiles: 1,
      totalBytes: 1_840_000_000,
      seconds: 360,
    },
    error: null,
    target: null,
  },
]);

const viewRepo = (r: Repo) => ({
  ...r,
  jobs: jobs.all().filter((j) => j.repositoryId === r.id).length,
});
const viewJob = (j: Job) => {
  const r = repos.find(j.repositoryId);
  return {
    ...j,
    repositoryName: r?.name ?? "",
    repositoryKind: r?.kind ?? null,
    runningRunId: null,
    canEditRepo: true,
  };
};

get(`${P}/hosts/:id/status`, () => ({
  root: true,
  os: "Debian GNU/Linux 13",
  arch: "x86_64",
  packageManager: "apt",
  restic: "0.17.3",
  resticOk: true,
  rclone: "1.68.2",
  docker: true,
  tools: { mysqldump: false, pgDump: true, sqlite3: true },
}));
post(`${P}/hosts/:id/install`, () => ({ version: "0.17.3" }));
post(`${P}/hosts/:id/install-rclone`, () => ({ version: "1.68.2" }));
get(`${P}/hosts/:id/docker`, () => ({
  volumes: [
    { name: "app_data", mountpoint: "/var/lib/docker/volumes/app_data" },
  ],
  stacks: [{ name: "web", status: "running", dir: "/opt/stacks/web" }],
}));
get(`${P}/hosts/:id/database-logins`, () => ({
  available: true,
  logins: [
    { id: 1, name: "Main Postgres", engine: "postgres", database: "app" },
  ],
}));
get(`${P}/hosts/:id/jobs`, (req) =>
  jobs
    .all()
    .filter((j) => j.hostId === Number(req.params.id))
    .map(viewJob),
);
post(`${P}/hosts/:id/jobs`, (req) => {
  const b = req.body as Partial<Job>;
  return viewJob(
    jobs.insert({
      lastStatus: null,
      lastRunAt: null,
      lastSuccessAt: null,
      nextRunAt: null,
      lastSnapshotId: null,
      lastBytes: null,
      ...(b as Job),
      id: jobs.nextId(),
      hostId: Number(req.params.id),
    }),
  );
});
get(`${P}/jobs`, () => jobs.all().map(viewJob));
get(`${P}/jobs/:id`, (req) => {
  const j = jobs.find(req.params.id);
  return j ? viewJob(j) : { error: "Not found" };
});
put(`${P}/jobs/:id`, (req) => {
  const j = jobs.patch(req.params.id, req.body as Partial<Job>);
  return j ? viewJob(j) : { error: "Not found" };
});
del(`${P}/jobs/:id`, (req) => {
  jobs.remove(req.params.id);
  return { ok: true };
});
post(`${P}/jobs/:id/run`, (req) => {
  const j = jobs.find(req.params.id);
  const run: Run = {
    id: runs.get().length + 1,
    jobId: j?.id ?? null,
    jobName: j?.name ?? "",
    hostId: j?.hostId ?? 0,
    kind: "backup",
    trigger: "manual",
    status: "success",
    startedAt: ago(0),
    finishedAt: ahead(1),
    snapshotId: "0a1b2c3d4e5f",
    progress: null,
    summary: {
      filesNew: 0,
      filesChanged: 3,
      filesUnmodified: 18000,
      dataAdded: 1_200_000,
      totalFiles: 18003,
      totalBytes: 400_000_000,
      seconds: 22,
    },
    error: null,
    target: null,
  };
  runs.update((r) => [run, ...r]);
  return run;
});
get(`${P}/jobs/:id/snapshots`, () => [
  {
    id: "a1b2c3d4e5f6a1b2c3d4e5f6",
    shortId: "a1b2c3d4",
    time: ago(60 * 9),
    hostname: "web-01",
    paths: ["/var/www", "/etc/nginx"],
    tags: ["termix"],
    bytes: 412_000_000,
    files: 18855,
  },
  {
    id: "f6e5d4c3b2a1f6e5d4c3b2a1",
    shortId: "f6e5d4c3",
    time: ago(60 * 33),
    hostname: "web-01",
    paths: ["/var/www", "/etc/nginx"],
    tags: ["termix"],
    bytes: 409_000_000,
    files: 18820,
  },
]);
get(`${P}/jobs/:id/snapshots/:snap/files`, () => [
  { name: "www", path: "/var/www", type: "dir", size: null, mtime: ago(600) },
  {
    name: "nginx",
    path: "/etc/nginx",
    type: "dir",
    size: null,
    mtime: ago(900),
  },
  {
    name: "index.html",
    path: "/var/www/index.html",
    type: "file",
    size: 4210,
    mtime: ago(700),
  },
]);
post(`${P}/jobs/:id/snapshots/:snap/restore`, () => ({
  id: 99,
  jobId: 2,
  jobName: "Web files",
  hostId: 1,
  kind: "restore",
  trigger: "manual",
  status: "success",
  startedAt: ago(0),
  finishedAt: ahead(1),
  snapshotId: null,
  progress: null,
  summary: null,
  error: null,
  target: null,
}));
del(`${P}/jobs/:id/snapshots/:snap`, () => ({ ok: true }));

get(`${P}/runs`, () => ({ runs: runs.get(), next: null }));
get(`${P}/runs/:id`, (req) => {
  const r = runs.get().find((x) => String(x.id) === req.params.id);
  return r
    ? { ...r, log: "using parent snapshot\nscan finished\nsnapshot saved\n" }
    : { error: "Not found" };
});
post(`${P}/runs/:id/cancel`, () => ({ ok: true }));

get(`${P}/repositories`, () => repos.all().map(viewRepo));
post(`${P}/repositories`, (req) => {
  const b = req.body as Partial<Repo>;
  return viewRepo(
    repos.insert({
      name: "Repository",
      kind: "local",
      location: {},
      hasSecret: false,
      ...(b as Repo),
      id: repos.nextId(),
      createdAt: ago(0),
      updatedAt: ago(0),
    }),
  );
});
put(`${P}/repositories/:id`, (req) => {
  const r = repos.patch(req.params.id, req.body as Partial<Repo>);
  return r ? viewRepo(r) : { error: "Not found" };
});
del(`${P}/repositories/:id`, (req) => {
  repos.remove(req.params.id);
  return { ok: true };
});
post(`${P}/repositories/:id/password`, () => ({
  password: "demo-restic-password",
}));
post(`${P}/repositories/:id/test`, () => ({
  ok: true,
  created: false,
  error: null,
}));
