export type RepoKind = "s3" | "rest" | "rclone" | "local";
export const REPO_KINDS: readonly RepoKind[] = [
  "s3",
  "rest",
  "rclone",
  "local",
];

/** Where a repository lives. Nothing secret. */
export interface RepoLocation {
  /** s3: like https://s3.amazonaws.com or http://minio:9000 */
  endpoint?: string;
  bucket?: string;
  prefix?: string;
  region?: string;
  accessKeyId?: string;
  /** rest: like https://backup.example.com:8000/host1 */
  url?: string;
  username?: string;
  /** rclone: the remote name in the config, and the path on it. */
  remote?: string;
  path?: string;
  /** local: the host that holds the folder. */
  hostId?: number;
}

export interface RepositoryView {
  id: number;
  name: string;
  kind: RepoKind;
  location: RepoLocation;
  /** s3 secret key, rest password or rclone config is saved. */
  hasSecret: boolean;
  /** Job count using it. */
  jobs: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryInput {
  name: string;
  kind: RepoKind;
  location: RepoLocation;
  /** s3 secret key, rest password, or the rclone config lines. Empty keeps the saved one. */
  secret?: string;
  /** The restic password. Empty makes one on create and keeps it on edit. */
  password?: string;
}

export type DbEngine =
  "mysql" | "postgres" | "sqlite" | "mongo" | "redis" | "mssql";
export const DB_ENGINES: readonly DbEngine[] = [
  "mysql",
  "postgres",
  "sqlite",
  "mongo",
  "redis",
  "mssql",
];

export interface PathsSource {
  id: string;
  kind: "paths";
  paths: string[];
  excludes: string[];
}

export interface DatabaseSource {
  id: string;
  kind: "database";
  engine: DbEngine;
  /** A saved login of the Databases plugin, or 0 for the fields below. */
  loginId: number;
  address: string;
  port: number | null;
  username: string;
  /** Set when a password is saved for this source. Never the password. */
  hasPassword: boolean;
  runAs: string;
  /** Databases to dump, empty for all. For SQLite, the file paths. */
  databases: string[];
  /**
   * SQL Server writes its backups itself, into this folder on its own side.
   * It must be the same path on the host (a bind mount for Docker).
   */
  serverDir?: string;
}

export interface DockerSource {
  id: string;
  kind: "docker";
  volumes: string[];
  stacks: string[];
  /** Stop the stacks while the backup runs. */
  stop: boolean;
}

export type JobSource = PathsSource | DatabaseSource | DockerSource;

/** A source as the editor sends it: a database source may carry a new password. */
export type JobSourceInput = JobSource & { password?: string };

export interface KeepPolicy {
  last: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export const EMPTY_KEEP: KeepPolicy = {
  last: 0,
  daily: 0,
  weekly: 0,
  monthly: 0,
  yearly: 0,
};

export interface JobHooks {
  pre: string;
  post: string;
}

export interface JobAlerts {
  onFailure: boolean;
  /** Alert on a backup with warnings. Follows onFailure when not set. */
  onWarning?: boolean;
  /** Alert on every good backup. */
  onSuccess?: boolean;
  /** Only these of the owner's alert channels. Empty means all of them. */
  channelIds?: number[];
  /** Alert when there is no good backup for this many days. 0 is off. */
  staleDays: number;
}

export type RunStatus =
  "running" | "success" | "warning" | "failed" | "canceled";

export type RunKind = "backup" | "restore";
export type RunTrigger = "manual" | "schedule" | "operation";

export interface JobView {
  id: number;
  hostId: number;
  repositoryId: number;
  repositoryName: string;
  repositoryKind: RepoKind | null;
  name: string;
  enabled: boolean;
  sources: JobSource[];
  hooks: JobHooks;
  cron: string;
  timezone: string;
  keep: KeepPolicy;
  alerts: JobAlerts;
  oneFileSystem: boolean;
  /** Extra flags for restic backup, separated by spaces. */
  backupOptions: string;
  /** Tries again this many times after a failed backup. */
  retries: number;
  retryDelayMinutes: number;
  /** When the next retry starts, null when none is waiting. */
  retryAt: string | null;
  /** Repositories each backup is copied to after it is saved. */
  mirrors: number[];
  /** Another host that runs restic and reads this host's files through Termix. */
  runnerHostId: number | null;
  lastStatus: RunStatus | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastSnapshotId: string | null;
  lastBytes: number | null;
  runningRunId: number | null;
  /** The editor may save it: they own the repository. */
  canEditRepo: boolean;
}

export interface JobInput {
  name: string;
  repositoryId: number;
  enabled: boolean;
  sources: JobSourceInput[];
  hooks: JobHooks;
  cron: string;
  timezone: string;
  keep: KeepPolicy;
  alerts: JobAlerts;
  oneFileSystem: boolean;
  /** Extra flags for restic backup, separated by spaces. */
  backupOptions: string;
  retries: number;
  retryDelayMinutes: number;
  mirrors: number[];
  /** Run restic on this host instead, null for the job's own host. */
  runnerHostId: number | null;
}

export interface RunProgress {
  percent: number;
  filesDone: number;
  totalFiles: number;
  bytesDone: number;
  totalBytes: number;
  secondsElapsed: number;
  secondsRemaining: number | null;
  current: string[];
  /** Termix is still copying files between hosts: only bytesDone counts. */
  copying?: boolean;
}

export interface RunSummary {
  filesNew: number;
  filesChanged: number;
  filesUnmodified: number;
  dataAdded: number;
  totalFiles: number;
  totalBytes: number;
  seconds: number;
}

export interface RestoreTarget {
  path: string;
  includes: string[];
  overwrite: OverwritePolicy;
}

export type OverwritePolicy = "always" | "if-changed" | "if-newer" | "never";
export const OVERWRITE_POLICIES: readonly OverwritePolicy[] = [
  "if-changed",
  "always",
  "if-newer",
  "never",
];

export interface RunView {
  id: number;
  jobId: number | null;
  jobName: string;
  hostId: number;
  kind: RunKind;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  snapshotId: string | null;
  progress: RunProgress | null;
  summary: RunSummary | null;
  error: string | null;
  target: RestoreTarget | null;
}

export interface RunDetail extends RunView {
  log: string;
}

export interface RunPage {
  runs: RunView[];
  /** Pass as `before` for the next page, null at the end. */
  next: number | null;
}

export interface HostStatus {
  root: boolean;
  os: string;
  arch: string;
  packageManager: string;
  restic: string | null;
  /** restic is new enough (0.17 or newer). */
  resticOk: boolean;
  rclone: string | null;
  docker: boolean;
  tools: {
    mysqldump: boolean;
    pgDump: boolean;
    sqlite3: boolean;
    mongodump?: boolean;
    redisCli?: boolean;
    sqlcmd?: boolean;
  };
}

export interface SnapshotView {
  id: string;
  shortId: string;
  time: string;
  hostname: string;
  paths: string[];
  tags: string[];
  /** restic 0.17+ keeps a summary per snapshot. */
  bytes: number | null;
  files: number | null;
}

export interface SnapshotEntry {
  name: string;
  path: string;
  type: "dir" | "file" | "symlink" | "other";
  size: number | null;
  mtime: string | null;
}

/** One of the user's alert channels, for the job editor. */
export interface AlertChannelOption {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

export interface DockerInventory {
  volumes: { name: string; mountpoint: string }[];
  stacks: { name: string; status: string; dir: string }[];
}

export interface DatabaseLoginOption {
  id: number;
  name: string;
  engine: DbEngine;
  database: string;
}
