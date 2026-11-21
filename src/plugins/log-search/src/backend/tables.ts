import {
  boolean,
  defineTable,
  id,
  integer,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// p_log_search_saved: a search someone saved, and its alert.
export const saved = defineTable(
  "saved",
  {
    id: id(),
    createdBy: refUser(),
    name: varchar(100).notNull(),
    // JSON of SavedQuery
    search: text().notNull(),
    alertEnabled: boolean().notNull().default(false),
    alertEvery: integer().notNull().default(5),
    alertMin: integer().notNull().default(1),
    // JSON list of channel ids
    alertChannels: text(),
    alertActive: boolean().notNull().default(false),
    lastRunAt: timestamp(),
    lastMatchAt: timestamp(),
    lastCount: integer(),
    lastError: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_log_search_saved_created_by", columns: ["createdBy"] },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [saved];
