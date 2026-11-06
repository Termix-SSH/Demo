import { get } from "../../router";

// Dashboard cards and host tiles read these.

const checked = () => new Date().toISOString();
const only = <T extends { hostId: number }>(rows: T[], hostId?: string) =>
  hostId ? rows.filter((r) => r.hostId === Number(hostId)) : rows;

get("/plugin-api/docker/summary", (req) =>
  only(
    [
      { hostId: 1, running: 6, stopped: 1, unhealthy: 0, total: 7 },
      { hostId: 2, running: 4, stopped: 0, unhealthy: 1, total: 4 },
      { hostId: 10, running: 9, stopped: 2, unhealthy: 0, total: 11 },
      { hostId: 13, running: 3, stopped: 0, unhealthy: 0, total: 3 },
    ].map((r) => ({ ...r, checkedAt: checked() })),
    req.query.hostId,
  ),
);

get("/plugin-api/kubernetes/summary", (req) =>
  only(
    [
      {
        hostId: 2,
        nodesReady: 3,
        nodesTotal: 3,
        podsRunning: 28,
        podsFailing: 1,
        podsTotal: 31,
      },
    ].map((r) => ({ ...r, checkedAt: checked() })),
    req.query.hostId,
  ),
);

get("/plugin-api/cron/summary", () =>
  [
    { hostId: 1, jobs: 4, disabled: 1 },
    { hostId: 3, jobs: 6, disabled: 0 },
  ].map((r) => ({
    ...r,
    checkedAt: checked(),
    installed: true,
    running: true,
  })),
);

get("/plugin-api/samba/summary", () => [
  {
    hostId: 8,
    checkedAt: checked(),
    installed: true,
    active: true,
    shares: 3,
    sessions: 2,
  },
]);

get("/plugin-api/databases/summary", () => [
  {
    hostId: 3,
    checkedAt: checked(),
    total: 2,
    unreachable: 0,
    logins: [
      { id: 1, name: "Main Postgres", ok: true },
      { id: 2, name: "Analytics replica", ok: true },
    ],
  },
]);

get("/plugin-api/tmux-monitor/summary", () => [
  { hostId: 1, available: true, sessions: 3, attached: 1 },
]);
