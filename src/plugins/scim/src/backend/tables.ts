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

/** One identity provider pushing to Termix, with its own URL and token. */
export const connections = defineTable(
  "connections",
  {
    id: id(),
    publicId: varchar(64).notNull(),
    name: text().notNull(),
    enabled: boolean().notNull().default(true),
    tokenHash: varchar(100).notNull(),
    onDelete: varchar(16).notNull().default("disable"),
    adoptExisting: boolean().notNull().default(false),
    allowAdmin: boolean().notNull().default(false),
    defaultRoles: text().notNull().default(""),
    lastRequestAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  { uniques: [{ name: "scim_connections_public_id", columns: ["publicId"] }] },
);

/** A Termix account a connection created or took over. */
export const scimUsers = defineTable(
  "users",
  {
    id: id(),
    connectionId: integer().notNull(),
    scimId: varchar(64).notNull(),
    userId: refUser(),
    externalId: varchar(255),
    userName: varchar(255).notNull(),
    active: boolean().notNull().default(true),
    attributes: text().notNull(),
    version: integer().notNull().default(1),
    deletedAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      { name: "scim_users_scim_id", columns: ["connectionId", "scimId"] },
      { name: "scim_users_user_id", columns: ["userId"] },
    ],
    indexes: [
      { name: "scim_users_user_name", columns: ["connectionId", "userName"] },
      {
        name: "scim_users_external_id",
        columns: ["connectionId", "externalId"],
      },
    ],
  },
);

export const scimGroups = defineTable(
  "groups",
  {
    id: id(),
    connectionId: integer().notNull(),
    scimId: varchar(64).notNull(),
    displayName: varchar(255).notNull(),
    externalId: varchar(255),
    roleName: varchar(255),
    version: integer().notNull().default(1),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      { name: "scim_groups_scim_id", columns: ["connectionId", "scimId"] },
    ],
    indexes: [
      {
        name: "scim_groups_display_name",
        columns: ["connectionId", "displayName"],
      },
    ],
  },
);

export const groupMembers = defineTable(
  "group_members",
  {
    id: id(),
    groupId: integer().notNull(),
    memberId: integer().notNull(),
  },
  {
    uniques: [
      { name: "scim_group_members_pair", columns: ["groupId", "memberId"] },
    ],
    indexes: [{ name: "scim_group_members_member", columns: ["memberId"] }],
  },
);

/** Recent requests per connection, for the settings page. */
export const events = defineTable(
  "events",
  {
    id: id(),
    connectionId: integer().notNull(),
    action: varchar(32).notNull(),
    target: varchar(255),
    ok: boolean().notNull().default(true),
    detail: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "scim_events_connection", columns: ["connectionId", "id"] },
    ],
  },
);

export const tables = [
  connections,
  scimUsers,
  scimGroups,
  groupMembers,
  events,
];
