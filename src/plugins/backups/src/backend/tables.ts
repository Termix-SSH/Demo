import {
  bigint,
  boolean,
  defineTable,
  id,
  integer,
  refHost,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// Stored as p_backups_repositories. One per storage place, owned by a user.
export const repositories = defineTable(
  "repositories",
  {
    id: id(),
    uid: varchar(36).notNull().unique(),
    ownerId: refUser(),
    name: varchar(120).notNull(),
    kind: varchar(10).notNull(),
    location: text().notNull(),
    secretSealed: text(),
    passwordSealed: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_backups_repositories_owner_id", columns: ["ownerId"] },
    ],
  },
);

// Stored as p_backups_jobs. One backup job on one host.
export const jobs = defineTable(
  "jobs",
  {
    id: id(),
    uid: varchar(36).notNull().unique(),
    hostId: refHost(),
    repositoryId: integer().notNull(),
    name: varchar(120).notNull(),
    enabled: boolean().notNull().default(true),
    sources: text().notNull(),
    secretsSealed: text(),
    hooks: text().notNull(),
    cron: varchar(120).notNull().default(""),
    timezone: varchar(64).notNull().default(""),
    keep: text().notNull(),
    alerts: text().notNull(),
    oneFileSystem: boolean().notNull().default(false),
    lastStatus: varchar(12),
    lastRunAt: timestamp(),
    lastSuccessAt: timestamp(),
    nextRunAt: timestamp(),
    lastSnapshotId: varchar(64),
    lastBytes: bigint(),
    staleAlertAt: timestamp(),
    updatedBy: varchar(64).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_backups_jobs_host_id", columns: ["hostId"] },
      { name: "idx_p_backups_jobs_repository_id", columns: ["repositoryId"] },
    ],
  },
);

// Stored as p_backups_runs. Every backup and restore, running or done.
export const runs = defineTable(
  "runs",
  {
    id: id(),
    uid: varchar(36).notNull().unique(),
    jobId: integer(),
    jobName: varchar(120).notNull().default(""),
    hostId: refHost(),
    repositoryId: integer().notNull(),
    kind: varchar(10).notNull(),
    startedVia: varchar(12).notNull(),
    status: varchar(12).notNull(),
    startedBy: varchar(64).notNull(),
    startedAt: timestamp().notNull().defaultNow(),
    finishedAt: timestamp(),
    polledAt: timestamp(),
    snapshotId: varchar(64),
    progress: text(),
    summary: text(),
    target: text(),
    error: text(),
    log: text(),
  },
  {
    indexes: [
      { name: "idx_p_backups_runs_job_id", columns: ["jobId"] },
      { name: "idx_p_backups_runs_host_id", columns: ["hostId"] },
      { name: "idx_p_backups_runs_status", columns: ["status"] },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [repositories, jobs, runs];
