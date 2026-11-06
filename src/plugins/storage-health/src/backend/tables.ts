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

/** One row per watched host. The host setting turns the tab on, this holds the thresholds. */
export const hosts = defineTable(
  "hosts",
  {
    id: id(),
    hostId: refHost(),
    /** The user whose access the background reads run with. */
    userId: refUser(),
    alerts: boolean().notNull().default(true),
    intervalMin: integer().notNull().default(15),
    tempWarnC: integer().notNull().default(0),
    tempCritC: integer().notNull().default(0),
    wearWarnPct: integer().notNull().default(80),
    thinWarnPct: integer().notNull().default(90),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [{ name: "idx_p_storage_health_hosts_host", columns: ["hostId"] }],
  },
);

/** Problems found and cleared, self tests and scrubs. Capped per host. */
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
        name: "idx_p_storage_health_events_host_at",
        columns: ["hostId", "at"],
      },
    ],
  },
);

export const tables = [hosts, events];
