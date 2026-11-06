import {
  bigint,
  boolean,
  defineTable,
  id,
  integer,
  json,
  refUser,
  text,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/**
 * Host ids are plain integers, not references: a deleted host pauses its
 * monitors and keeps their history.
 */
export const monitors = defineTable(
  "monitors",
  {
    id: id(),
    monitorKey: varchar(36).notNull(),
    userId: refUser(),
    /** Who last changed what it checks. Checks run as this user. */
    updatedBy: varchar(64).notNull(),
    name: varchar(120).notNull(),
    type: varchar(16).notNull(),
    groupName: varchar(120).notNull().default(""),
    tags: json().notNull(),
    config: json().notNull(),
    sealed: text(),
    hostId: integer(),
    fromHostId: integer(),
    intervalSec: integer().notNull(),
    retries: integer().notNull(),
    retryIntervalSec: integer().notNull(),
    timeoutSec: integer().notNull(),
    resendMinutes: integer().notNull(),
    enabled: boolean().notNull().default(true),
    pushTokenHash: varchar(64),
    status: varchar(16).notNull().default("unknown"),
    statusSince: bigint(),
    lastCheckAt: bigint(),
    pauseNote: varchar(200),
    createdAt: bigint().notNull(),
  },
  {
    uniques: [{ name: "idx_p_uptime_monitors_key", columns: ["monitorKey"] }],
    indexes: [
      { name: "idx_p_uptime_monitors_user", columns: ["userId"] },
      { name: "idx_p_uptime_monitors_push", columns: ["pushTokenHash"] },
    ],
  },
);

export const monitorAccess = defineTable(
  "monitor_access",
  {
    id: id(),
    monitorId: integer().notNull(),
    userId: varchar(64),
    roleId: integer(),
    level: varchar(8).notNull(),
    grantedBy: varchar(64).notNull(),
  },
  {
    indexes: [
      { name: "idx_p_uptime_access_monitor", columns: ["monitorId"] },
      { name: "idx_p_uptime_access_user", columns: ["userId"] },
      { name: "idx_p_uptime_access_role", columns: ["roleId"] },
    ],
  },
);

/** Who gets alerts for a monitor. */
export const watches = defineTable(
  "watches",
  {
    id: id(),
    monitorId: integer().notNull(),
    userId: refUser(),
  },
  {
    uniques: [
      {
        name: "idx_p_uptime_watches_monitor_user",
        columns: ["monitorId", "userId"],
      },
    ],
  },
);

export const incidents = defineTable(
  "incidents",
  {
    id: id(),
    monitorId: integer().notNull(),
    startedAt: bigint().notNull(),
    endedAt: bigint(),
    cause: varchar(300).notNull(),
    ackBy: varchar(64),
    ackAt: bigint(),
    note: text(),
  },
  {
    indexes: [
      { name: "idx_p_uptime_incidents_monitor", columns: ["monitorId"] },
      { name: "idx_p_uptime_incidents_started", columns: ["startedAt"] },
    ],
  },
);

/** Beats added up per hour or day. Single beats never reach the database. */
export const rollups = defineTable(
  "rollups",
  {
    id: id(),
    monitorId: integer().notNull(),
    size: varchar(4).notNull(),
    bucket: bigint().notNull(),
    up: integer().notNull(),
    down: integer().notNull(),
    maintenance: integer().notNull(),
    latencySum: bigint().notNull(),
    latencyCount: integer().notNull(),
    latencyMin: integer(),
    latencyMax: integer(),
  },
  {
    uniques: [
      {
        name: "idx_p_uptime_rollups_slot",
        columns: ["monitorId", "size", "bucket"],
      },
    ],
  },
);

export const maintenance = defineTable(
  "maintenance",
  {
    id: id(),
    userId: refUser(),
    name: varchar(120).notNull(),
    scope: varchar(12).notNull(),
    monitorKeys: json().notNull(),
    tag: varchar(60),
    kind: varchar(8).notNull(),
    startsAt: bigint(),
    endsAt: bigint(),
    days: json().notNull(),
    startMinute: integer(),
    durationMinutes: integer(),
    timezone: varchar(64),
    enabled: boolean().notNull().default(true),
  },
  { indexes: [{ name: "idx_p_uptime_maintenance_user", columns: ["userId"] }] },
);

export const statusPages = defineTable(
  "status_pages",
  {
    id: id(),
    userId: refUser(),
    slug: varchar(64).notNull(),
    title: varchar(120).notNull(),
    description: text(),
    published: boolean().notNull().default(false),
    showLatency: boolean().notNull().default(false),
    groups: json().notNull(),
  },
  {
    uniques: [{ name: "idx_p_uptime_pages_slug", columns: ["slug"] }],
    indexes: [{ name: "idx_p_uptime_pages_user", columns: ["userId"] }],
  },
);

export const statusNotes = defineTable(
  "status_notes",
  {
    id: id(),
    pageId: integer().notNull(),
    title: varchar(160).notNull(),
    body: text(),
    level: varchar(10).notNull(),
    createdAt: bigint().notNull(),
    resolvedAt: bigint(),
  },
  { indexes: [{ name: "idx_p_uptime_notes_page", columns: ["pageId"] }] },
);

export const tables = [
  monitors,
  monitorAccess,
  watches,
  incidents,
  rollups,
  maintenance,
  statusPages,
  statusNotes,
];
