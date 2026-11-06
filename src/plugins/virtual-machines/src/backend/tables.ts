import {
  defineTable,
  id,
  integer,
  refHost,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/** Long work on a host. The host runs it, Termix only reads how it went. */
export const jobs = defineTable(
  "jobs",
  {
    id: id(),
    uid: varchar(32).notNull(),
    hostId: refHost(),
    userId: varchar(64).notNull(),
    kind: varchar(16).notNull(),
    label: varchar(200).notNull(),
    vmName: varchar(128).notNull().default(""),
    status: varchar(16).notNull().default("running"),
    phase: varchar(32).notNull().default(""),
    percent: integer(),
    log: text(),
    error: text(),
    startedAt: timestamp().notNull().defaultNow(),
    finishedAt: timestamp(),
  },
  {
    uniques: [{ name: "idx_p_virtual_machines_jobs_uid", columns: ["uid"] }],
    indexes: [
      { name: "idx_p_virtual_machines_jobs_host", columns: ["hostId"] },
      { name: "idx_p_virtual_machines_jobs_status", columns: ["status"] },
    ],
  },
);

/** A user who wants an alert when this VM stops. */
export const watches = defineTable(
  "watches",
  {
    id: id(),
    userId: varchar(64).notNull(),
    hostId: refHost(),
    uuid: varchar(36).notNull(),
    name: varchar(128).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "idx_p_virtual_machines_watches_vm",
        columns: ["userId", "hostId", "uuid"],
      },
    ],
    indexes: [
      { name: "idx_p_virtual_machines_watches_host", columns: ["hostId"] },
    ],
  },
);

export const tables = [jobs, watches];
