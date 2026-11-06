import {
  defineTable,
  id,
  integer,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/**
 * One row per access request. An approved row is the grant itself: it lets
 * userId open sessions to hostId until expiresAt. hostId is a plain integer,
 * not refHost(), so the history outlives a deleted host; hostName keeps it
 * readable.
 */
export const requests = defineTable(
  "requests",
  {
    id: id(),
    hostId: integer().notNull(),
    hostName: text(),
    userId: varchar().notNull(),
    username: text(),
    reason: text(),
    ticket: text(),
    hours: integer().notNull(),
    // pending, approved, denied, expired, revoked, cancelled
    status: varchar(16).notNull().default("pending"),
    createdAt: timestamp().notNull().defaultNow(),
    decidedBy: varchar(),
    decidedByName: text(),
    decidedAt: timestamp(),
    comment: text(),
    startsAt: timestamp(),
    expiresAt: timestamp(),
    endedAt: timestamp(),
    endedBy: varchar(),
  },
  {
    indexes: [
      { name: "idx_privileged_access_requests_status", columns: ["status"] },
      {
        name: "idx_privileged_access_requests_user_host",
        columns: ["userId", "hostId"],
      },
    ],
  },
);

export const tables = [requests];
