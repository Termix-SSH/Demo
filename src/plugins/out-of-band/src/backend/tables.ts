import {
  defineTable,
  id,
  integer,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// p_out_of_band_devices: one BMC. The login is sealed with the installation
// key and never leaves the server.
export const devices = defineTable(
  "devices",
  {
    id: id(),
    createdBy: refUser(),
    // The Termix host this BMC belongs to, when there is one. A host.deleted
    // listener clears it, since a foreign key cannot be optional.
    hostId: integer(),
    name: varchar(100).notNull(),
    driver: varchar(16).notNull(),
    address: varchar(255).notNull(),
    port: integer(),
    // Sealed JSON of the username and password
    credentials: text().notNull(),
    // PEM of a private CA for the BMC web page
    ca: text(),
    // JSON of DeviceOptions
    options: text().notNull(),
    pollSeconds: integer().notNull(),
    status: varchar(8).notNull(),
    lastError: text(),
    lastSeenAt: timestamp(),
    // Last reading, so the list is filled right after a restart
    snapshot: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "uq_p_out_of_band_devices_devices_name",
        columns: ["name"],
      },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [devices];
