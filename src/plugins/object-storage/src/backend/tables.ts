import {
  bigint,
  boolean,
  defineTable,
  id,
  integer,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// p_object_storage_accounts: one S3 compatible login. The keys are sealed
// with the installation key and never leave the server.
export const accounts = defineTable(
  "accounts",
  {
    id: id(),
    createdBy: refUser(),
    provider: varchar(16).notNull(),
    name: varchar(100).notNull(),
    endpoint: varchar(255).notNull(),
    region: varchar(64).notNull(),
    pathStyle: boolean().notNull().default(true),
    // Sealed JSON: accessKeyId, secretAccessKey, sessionToken
    credentials: text().notNull(),
    // A pasted PEM for a private CA
    ca: text(),
    status: varchar(8).notNull(),
    lastError: text(),
    lastCheckAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [{ name: "uq_p_object_storage_accounts_name", columns: ["name"] }],
  },
);

// p_object_storage_usage: one size reading per bucket and day.
export const usage = defineTable(
  "usage",
  {
    id: id(),
    accountId: integer().notNull(),
    bucket: varchar(255).notNull(),
    day: varchar(10).notNull(),
    bytes: bigint().notNull(),
    objects: bigint().notNull(),
    // The scan stopped at the page limit
    partial: boolean().notNull().default(false),
    scannedAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "uq_p_object_storage_usage_day",
        columns: ["accountId", "bucket", "day"],
      },
    ],
  },
);

// p_object_storage_limits: an alert limit for a bucket.
export const limits = defineTable(
  "limits",
  {
    id: id(),
    accountId: integer().notNull(),
    bucket: varchar(255).notNull(),
    maxBytes: bigint(),
    maxObjects: bigint(),
  },
  {
    uniques: [
      {
        name: "uq_p_object_storage_limits_bucket",
        columns: ["accountId", "bucket"],
      },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [accounts, usage, limits];
