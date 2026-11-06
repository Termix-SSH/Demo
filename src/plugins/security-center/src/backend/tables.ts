import {
  bigint,
  boolean,
  defineTable,
  id,
  integer,
  refHost,
  refUser,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/** One row per watched host. The host setting turns the tab on, this holds the limits. */
export const hosts = defineTable(
  "hosts",
  {
    id: id(),
    hostId: refHost(),
    /** The user whose access the background reads run with. */
    userId: refUser(),
    alerts: boolean().notNull().default(true),
    intervalMin: integer().notNull().default(60),
    vulnIntervalH: integer().notNull().default(24),
    minRsaBits: integer().notNull().default(3072),
    keyMaxAgeDays: integer().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_security_center_hosts_host", columns: ["hostId"] },
    ],
  },
);

/** Problems found and cleared, scans and rotations. Capped per host. */
export const events = defineTable(
  "events",
  {
    id: id(),
    hostId: integer().notNull(),
    at: bigint().notNull(),
    type: varchar(40).notNull(),
    text: varchar(300).notNull(),
  },
  {
    indexes: [
      {
        name: "idx_p_security_center_events_host_at",
        columns: ["hostId", "at"],
      },
    ],
  },
);

/** Advisories a user chose to hide for one host. */
export const ignores = defineTable(
  "ignores",
  {
    id: id(),
    hostId: integer().notNull(),
    advisory: varchar(80).notNull(),
    note: varchar(300).notNull().default(""),
    at: bigint().notNull(),
  },
  {
    indexes: [
      {
        name: "idx_p_security_center_ignores_host",
        columns: ["hostId"],
      },
    ],
  },
);

export const tables = [hosts, events, ignores];
