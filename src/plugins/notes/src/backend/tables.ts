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

// Stored as p_notes_notes. hostId is plain so folder and global notes can
// leave it empty. A host.deleted listener removes the rows of a deleted host.
export const notes = defineTable(
  "notes",
  {
    id: id(),
    uid: varchar(36).notNull().unique(),
    scope: varchar(10).notNull(),
    hostId: integer(),
    folder: varchar(255),
    userId: refUser(),
    title: varchar(200).notNull().default(""),
    body: text().notNull(),
    tags: text(),
    pinned: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      { name: "idx_p_notes_notes_host_id", columns: ["hostId"] },
      { name: "idx_p_notes_notes_user_id", columns: ["userId"] },
      { name: "idx_p_notes_notes_folder", columns: ["folder"] },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [notes];
