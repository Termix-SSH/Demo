import {
  boolean,
  defineTable,
  id,
  integer,
  refHost,
  refUser,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/** What a user wants an alert for: a process, a pm2 app or a supervisor app. */
export const watches = defineTable(
  "watches",
  {
    id: id(),
    userId: refUser(),
    hostId: refHost(),
    kind: varchar(20).notNull(),
    target: varchar(255).notNull(),
    rule: varchar(20).notNull(),
    threshold: integer().notNull().default(0),
    autoRestart: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "idx_p_process_manager_watches_unique",
        columns: ["userId", "hostId", "kind", "target", "rule"],
      },
    ],
    indexes: [
      { name: "idx_p_process_manager_watches_host", columns: ["hostId"] },
    ],
  },
);

export const tables = [watches];
