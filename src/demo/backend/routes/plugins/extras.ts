import { get } from "../../router";

// Routes the new dashboard cards and tiles call on existing plugins.

const iso = (minAgo: number) =>
  new Date(Date.now() - minAgo * 60_000).toISOString();

get("/plugin-api/ssh-terminal/sessions", () => [
  {
    id: "live-1",
    hostId: 1,
    hostName: "web-01",
    connected: true,
    createdAt: Date.now() - 42 * 60_000,
    tmuxSessionName: "deploy",
  },
  {
    id: "live-2",
    hostId: 3,
    hostName: "db-primary",
    connected: true,
    createdAt: Date.now() - 9 * 60_000,
    tmuxSessionName: null,
  },
]);

get("/plugin-api/remote-desktop/live-sessions", () => [
  {
    id: "rd-1",
    hostId: 11,
    hostName: "workshop-pc",
    protocol: "rdp",
    openedAt: Date.now() - 18 * 60_000,
  },
]);

get("/plugin-api/session-sharing/active", () => ({
  shares: [
    {
      id: "share-1",
      hostId: 1,
      ownerUserId: "demo-user",
      protocol: "ssh",
      sessionId: "live-1",
      tabInstanceId: null,
      shareType: "link",
      targetUserId: null,
      linkToken: "demo-link-token",
      permissionLevel: "view",
      createdAt: iso(25),
      expiresAt: new Date(Date.now() + 35 * 60_000).toISOString(),
      revokedAt: null,
      lastJoinedAt: iso(10),
      joinCount: 2,
    },
  ],
}));
get("/plugin-api/session-sharing/public-url", () => ({ url: null }));

get("/plugin-api/host-metrics/metrics/summary", () => [
  { hostId: 1, cpu: 23, memory: 61, disk: 48, lastChecked: iso(1) },
  { hostId: 3, cpu: 12, memory: 74, disk: 63, lastChecked: iso(1) },
  { hostId: 8, cpu: 6, memory: 38, disk: 81, lastChecked: iso(2) },
]);
get("/plugin-api/host-metrics/health/summary", () => [
  {
    hostId: 8,
    level: "warn",
    checks: [
      {
        id: "disk",
        name: "Disk usage",
        level: "warn",
        detail: "/srv/share is at 81%",
        ts: iso(2),
      },
    ],
  },
]);
