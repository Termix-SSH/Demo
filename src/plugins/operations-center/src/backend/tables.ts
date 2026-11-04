import {
  boolean,
  defineTable,
  id,
  integer,
  json,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/** What needs a person, checked in order. The first rule that matches wins. */
export const rules = defineTable("rules", {
  id: id(),
  name: varchar(120).notNull(),
  position: integer().notNull().default(0),
  enabled: boolean().notNull().default(true),
  // allow, approve or deny
  effect: varchar(12).notNull(),
  // The lowest risk the rule covers: read, change or destructive.
  minRisk: varchar(16).notNull().default("change"),
  // JSON lists. Empty means any.
  origins: json(),
  pluginIds: json(),
  actionIds: json(),
  hostTags: json(),
  allowSelf: boolean().notNull().default(false),
  expiresInMinutes: integer(),
  createdAt: timestamp(),
  updatedBy: varchar(255),
});

/** One action run across many hosts. */
export const batches = defineTable("batches", {
  id: id(),
  userId: varchar(255).notNull(),
  name: varchar(200).notNull(),
  actionId: varchar(255).notNull(),
  resourceKey: varchar(255),
  // Sealed: inputs can hold secrets.
  inputSealed: text(),
  dryRun: boolean().notNull().default(false),
  canary: integer().notNull().default(0),
  batchSize: integer().notNull().default(10),
  pauseSeconds: integer().notNull().default(0),
  stopAfterFailures: integer().notNull().default(1),
  // draft, running, paused, stopped, done, failed
  status: varchar(16).notNull().default("draft"),
  pausedReason: text(),
  createdAt: timestamp(),
  startedAt: timestamp(),
  finishedAt: timestamp(),
});

export const batchTargets = defineTable("batch_targets", {
  id: id(),
  batchId: integer().notNull(),
  hostId: integer().notNull(),
  hostName: varchar(255),
  position: integer().notNull(),
  // waiting, running, success, failed, skipped, pending_approval, needs_interaction
  status: varchar(24).notNull().default("waiting"),
  runId: varchar(64),
  summary: text(),
  error: text(),
  finishedAt: timestamp(),
});

/** A state hosts should stay in, checked on a schedule. */
export const baselines = defineTable("baselines", {
  id: id(),
  userId: varchar(255).notNull(),
  name: varchar(200).notNull(),
  checkActionId: varchar(255).notNull(),
  resourceKey: varchar(255),
  inputSealed: text(),
  // JSON: { hostIds, tags, fleetIds }
  targets: json(),
  intervalMinutes: integer().notNull().default(60),
  fixActionId: varchar(255),
  autoFix: boolean().notNull().default(false),
  enabled: boolean().notNull().default(true),
  lastRunAt: timestamp(),
  createdAt: timestamp(),
});

export const baselineResults = defineTable("baseline_results", {
  id: id(),
  baselineId: integer().notNull(),
  hostId: integer().notNull(),
  hostName: varchar(255),
  // compliant, drifted, error
  state: varchar(16).notNull(),
  detail: text(),
  checkedAt: timestamp(),
  changedAt: timestamp(),
});

// termix-plugin migrations reads this list.
export const tables = [
  rules,
  batches,
  batchTargets,
  baselines,
  baselineResults,
];
