import { DEMO_USER_ID } from "./hosts";

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

const recent: Array<[string, number, string, number]> = [
  ["terminal", 1, "web-01", 4],
  ["file_manager", 1, "web-01", 11],
  ["docker", 2, "web-02", 26],
  ["server_stats", 7, "proxmox", 48],
  ["terminal", 3, "db-primary", 75],
  ["rdp", 11, "workshop-pc", 130],
  ["tunnel", 9, "pihole", 190],
  ["terminal", 13, "edge-ams", 300],
  ["tmux_monitor", 1, "web-01", 420],
];

export const DEMO_ACTIVITY = recent.map(
  ([type, hostId, hostName, mins], i) => ({
    id: i + 1,
    userId: DEMO_USER_ID,
    type,
    hostId,
    hostName,
    timestamp: ago(mins),
  }),
);

const auditRows: Array<
  [string, string, string, string, string | null, boolean, number]
> = [
  ["demo", DEMO_USER_ID, "login", "user", null, true, 2],
  ["demo", DEMO_USER_ID, "connect", "host", "web-01", true, 4],
  ["demo", DEMO_USER_ID, "update", "host", "db-primary", true, 33],
  ["ana", "user-ana", "plugin_enable", "plugin", "docker", true, 70],
  ["ana", "user-ana", "share", "host", "proxmox", true, 95],
  ["marco", "user-marco", "login", "user", null, false, 150],
  ["marco", "user-marco", "login", "user", null, true, 152],
  ["demo", DEMO_USER_ID, "create", "credential", "deploy key", true, 400],
  ["oncall", "user-oncall", "connect", "host", "edge-sfo", false, 610],
  ["demo", DEMO_USER_ID, "role_update", "role", "operators", true, 900],
  [
    "ana",
    "user-ana",
    "plugin_install",
    "plugin",
    "network-topology",
    true,
    1500,
  ],
  ["demo", DEMO_USER_ID, "delete", "host", "old-staging", true, 2900],
];

export const DEMO_AUDIT_LOGS = auditRows.map(
  (
    [username, userId, action, resourceType, resourceName, success, mins],
    i,
  ) => ({
    id: i + 1,
    userId,
    username,
    action,
    resourceType,
    resourceId: resourceName ? String(i + 100) : null,
    resourceName,
    details: null,
    ipAddress: "10.0.0." + (20 + i),
    userAgent: "Mozilla/5.0",
    success,
    errorMessage: success ? null : "Authentication failed",
    timestamp: ago(mins),
  }),
);
