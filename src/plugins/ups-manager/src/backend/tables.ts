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

/**
 * One UPS to read. The host is where the commands run: the machine with NUT or
 * apcupsd on it, or the relay that polls an SNMP card.
 */
export const sources = defineTable(
  "sources",
  {
    id: id(),
    hostId: refHost(),
    /** The user whose access the background reads run with. */
    userId: refUser(),
    backend: varchar(16).notNull(),
    label: varchar(80).notNull(),
    target: varchar(255).notNull().default(""),
    snmpVersion: varchar(4).notNull().default("2c"),
    /** Sealed JSON with the NUT login or SNMP credentials. Never returned. */
    secrets: text(),
    lowCharge: integer().notNull().default(30),
    lowRuntimeMin: integer().notNull().default(5),
    alerts: boolean().notNull().default(true),
    enabled: boolean().notNull().default(true),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [{ name: "idx_p_ups_manager_sources_host", columns: ["hostId"] }],
  },
);

/** Power events: on battery, restored, low battery, tests and so on. Capped per source. */
export const events = defineTable(
  "events",
  {
    id: id(),
    sourceId: integer().notNull(),
    at: bigint().notNull(),
    type: varchar(32).notNull(),
    text: varchar(300).notNull(),
  },
  {
    indexes: [
      {
        name: "idx_p_ups_manager_events_source_at",
        columns: ["sourceId", "at"],
      },
    ],
  },
);

export const tables = [sources, events];
