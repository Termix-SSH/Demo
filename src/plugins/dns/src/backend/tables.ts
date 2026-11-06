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

// p_dns_accounts: one DNS or registrar login. The keys are sealed with the
// installation key and never leave the server.
export const accounts = defineTable(
  "accounts",
  {
    id: id(),
    createdBy: refUser(),
    provider: varchar(16).notNull(),
    name: varchar(100).notNull(),
    // Sealed JSON of the keys
    credentials: text().notNull(),
    status: varchar(8).notNull(),
    lastError: text(),
    lastSyncAt: timestamp(),
    autoBackup: boolean().notNull().default(true),
    checkHealth: boolean().notNull().default(true),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [{ name: "uq_p_dns_accounts_name", columns: ["name"] }],
  },
);

// p_dns_snapshots: a full copy of a zone's records, for diff and restore.
export const snapshots = defineTable(
  "snapshots",
  {
    id: id(),
    accountId: integer().notNull(),
    zoneId: varchar(255).notNull(),
    zoneName: varchar(255).notNull(),
    label: varchar(100).notNull(),
    // manual, auto or before
    source: varchar(8).notNull(),
    recordCount: integer().notNull(),
    // JSON list of records
    data: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    indexes: [
      {
        name: "idx_p_dns_snapshots_zone",
        columns: ["accountId", "zoneId"],
      },
    ],
  },
);

// p_dns_domains: registered domains from a registrar login, plus domains
// that are only watched through RDAP.
export const domains = defineTable(
  "domains",
  {
    id: id(),
    // Empty for a watched domain
    accountId: integer(),
    name: varchar(255).notNull(),
    registrar: varchar(100),
    expiresAt: timestamp(),
    autoRenew: boolean(),
    locked: boolean(),
    // JSON list
    nameservers: text(),
    status: varchar(100),
    // account or watch
    source: varchar(8).notNull(),
    checkedAt: timestamp(),
  },
  {
    uniques: [{ name: "uq_p_dns_domains_name", columns: ["name"] }],
  },
);

// p_dns_links: a record Termix keeps pointed at a host or at this server's
// public address.
export const links = defineTable(
  "links",
  {
    id: id(),
    createdBy: refUser(),
    accountId: integer().notNull(),
    zoneId: varchar(255).notNull(),
    zoneName: varchar(255).notNull(),
    name: varchar(255).notNull(),
    type: varchar(4).notNull(),
    // host, public4 or public6
    source: varchar(8).notNull(),
    // A plain number, cleaned up when the host is deleted
    hostId: integer(),
    ttl: integer().notNull(),
    proxied: boolean().notNull().default(false),
    enabled: boolean().notNull().default(true),
    lastValue: varchar(64),
    lastSyncAt: timestamp(),
    lastError: text(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  {
    uniques: [
      {
        name: "uq_p_dns_links_target",
        columns: ["accountId", "zoneId", "name", "type"],
      },
    ],
  },
);

// termix-plugin migrations reads this list.
export const tables = [accounts, snapshots, domains, links];
