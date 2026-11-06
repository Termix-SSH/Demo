import {
  defineTable,
  id,
  integer,
  refUser,
  text,
  timestamp,
  varchar,
} from "@termix-ssh/plugin-sdk/db";

// p_network_devices_devices: one router, switch or access point. The keys are
// sealed with the installation key and never leave the server.
export const devices = defineTable(
  "devices",
  {
    id: id(),
    createdBy: refUser(),
    name: varchar(100).notNull(),
    driver: varchar(16).notNull(),
    address: varchar(255).notNull(),
    port: integer(),
    // Sealed JSON of the keys, tokens or SNMP login
    credentials: text().notNull(),
    // PEM of a private CA for the device web page
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
        name: "uq_p_network_devices_devices_name",
        columns: ["name"],
      },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [devices];
