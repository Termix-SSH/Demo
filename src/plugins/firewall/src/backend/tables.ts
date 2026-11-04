import {
  bigint,
  boolean,
  defineTable,
  id,
  integer,
  json,
  refHost,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

/** A change waiting for Keep. The host undoes it by itself when time runs out. */
export const pending = defineTable(
  "pending",
  {
    id: id(),
    hostId: refHost(),
    token: varchar(32).notNull(),
    label: varchar(200).notNull(),
    expiresAt: bigint().notNull(),
    reachable: boolean(),
    userId: varchar(64).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [{ name: "idx_p_firewall_pending_host", columns: ["hostId"] }],
  },
);

/** A named list of rules a user can apply to many hosts. */
export const rulesets = defineTable(
  "rulesets",
  {
    id: id(),
    userId: refUser(),
    /** Random, so a new row can be read back without RETURNING. */
    setKey: varchar(36).notNull(),
    name: varchar(120).notNull(),
    description: text(),
    rules: json().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [{ name: "idx_p_firewall_rulesets_key", columns: ["setKey"] }],
    indexes: [{ name: "idx_p_firewall_rulesets_user", columns: ["userId"] }],
  },
);

/** The hosts a rule set is for, and when it was last applied there. */
export const rulesetHosts = defineTable(
  "ruleset_hosts",
  {
    id: id(),
    rulesetId: integer().notNull(),
    hostId: refHost(),
    appliedAt: timestamp(),
  },
  {
    uniques: [
      {
        name: "idx_p_firewall_ruleset_hosts_set_host",
        columns: ["rulesetId", "hostId"],
      },
    ],
    indexes: [
      { name: "idx_p_firewall_ruleset_hosts_host", columns: ["hostId"] },
    ],
  },
);

/** Hosts a user wants an alert for when the firewall turns off or changes. */
export const watches = defineTable(
  "watches",
  {
    id: id(),
    userId: refUser(),
    hostId: refHost(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "idx_p_firewall_watches_user_host",
        columns: ["userId", "hostId"],
      },
    ],
    indexes: [{ name: "idx_p_firewall_watches_host", columns: ["hostId"] }],
  },
);

export const tables = [pending, rulesets, rulesetHosts, watches];
