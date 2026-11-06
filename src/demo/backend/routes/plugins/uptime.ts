import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/uptime";

const sec = (minAgo: number) => Math.floor(Date.now() / 1000) - minAgo * 60;

type Status = "up" | "down" | "pending" | "maintenance" | "paused" | "unknown";

const beats = (base: number, down = false) =>
  Array.from({ length: 40 }, (_, i) => ({
    t: sec((40 - i) * 5),
    s: (down && i > 33 ? "down" : "up") as Status,
    ms: down && i > 33 ? null : base + ((i * 7) % 23),
  }));

interface Monitor extends Record<string, unknown> {
  id: number;
}

const monitor = (
  id: number,
  name: string,
  type: string,
  config: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Monitor => {
  const status = (extra.status as Status) ?? "up";
  return {
    id,
    key: `m${id}`,
    name,
    type,
    groupName: "",
    tags: [],
    config,
    hasSecrets: false,
    hostId: null,
    fromHostId: null,
    intervalSec: 60,
    retries: 1,
    retryIntervalSec: 30,
    timeoutSec: 10,
    resendMinutes: 0,
    enabled: true,
    access: "owner",
    owner: true,
    status,
    statusSince: sec(60 * 30),
    lastCheckAt: sec(1),
    latencyMs: status === "down" ? null : 42,
    message: status === "down" ? "Connection refused" : "OK",
    cert: null,
    uptime: { day: 100, week: 99.9, month: 99.95, quarter: 99.9 },
    beats: beats(40, status === "down"),
    watching: false,
    ...extra,
  };
};

const monitors = collection<Monitor>("uptime-monitors", () => [
  monitor(
    1,
    "Termix",
    "http",
    {
      url: "https://termix.example/",
      method: "GET",
      acceptedStatus: "200-299",
    },
    {
      groupName: "Apps",
      latencyMs: 58,
      cert: { daysLeft: 63, validTo: "2027-01-07", issuer: "Let's Encrypt" },
    },
  ),
  monitor(
    2,
    "Marketing site",
    "http",
    { url: "https://acme.example/", method: "GET", acceptedStatus: "200-299" },
    {
      groupName: "Apps",
      latencyMs: 112,
    },
  ),
  monitor(
    3,
    "Postgres",
    "tcp",
    { target: "10.0.12.40", port: 5432 },
    {
      groupName: "Infrastructure",
      hostId: 3,
      latencyMs: 4,
    },
  ),
  monitor(
    4,
    "NAS",
    "ping",
    { target: "192.168.1.20" },
    {
      groupName: "Homelab",
      hostId: 8,
      latencyMs: 2,
    },
  ),
  monitor(
    5,
    "Media server",
    "ping",
    { target: "192.168.1.40" },
    {
      groupName: "Homelab",
      hostId: 10,
      status: "down",
      uptime: { day: 82.4, week: 96.1, month: 98.8, quarter: 99.2 },
    },
  ),
  monitor(
    6,
    "Nightly backup",
    "push",
    { graceSec: 90_000 },
    {
      groupName: "Infrastructure",
      pushUrl: "https://demo.invalid/plugin-api/uptime/push/demo-token",
    },
  ),
]);

const pages = collection<Record<string, unknown> & { id: number }>(
  "uptime-pages",
  () => [
    {
      id: 1,
      slug: "status",
      title: "Acme status",
      description: "Live status of our services.",
      published: true,
      showLatency: true,
      url: "https://demo.invalid/status/status",
      groups: [
        { name: "Apps", monitorKeys: ["m1", "m2"] },
        { name: "Infrastructure", monitorKeys: ["m3"] },
      ],
    },
  ],
);

const windows = collection<Record<string, unknown> & { id: number }>(
  "uptime-maintenance",
  () => [
    {
      id: 1,
      name: "Weekly patching",
      scope: "tag",
      tag: "",
      monitorKeys: ["m3"],
      kind: "weekly",
      days: [0],
      startMinute: 180,
      durationMinutes: 60,
      timezone: "UTC",
      enabled: true,
      active: false,
    },
  ],
);

get(`${P}/permissions`, () => ({
  manage: true,
  privateTargets: true,
  runCommands: true,
  publish: true,
  publicPages: true,
  minIntervalSec: 20,
  defaultIntervalSec: 60,
}));
get(`${P}/summary`, () => {
  const all = monitors.all();
  const count = (s: Status) => all.filter((m) => m.status === s).length;
  return {
    total: all.length,
    up: count("up"),
    down: count("down"),
    pending: count("pending"),
    paused: count("paused"),
    maintenance: count("maintenance"),
    uptimeMonth: 99.4,
  };
});
get(`${P}/monitors`, () => ({ monitors: monitors.all() }));
get(`${P}/hosts/:host/monitors`, (req) => ({
  monitors: monitors.all().filter((m) => m.hostId === Number(req.params.host)),
}));
get(`${P}/monitors/:id`, (req) => monitors.find(req.params.id));
post(`${P}/monitors`, (req) => {
  const b = req.body as {
    name: string;
    type: string;
    config: Record<string, unknown>;
  };
  return monitors.insert({
    ...monitor(monitors.nextId(), b.name, b.type, b.config),
    ...b,
  } as Monitor);
});
put(`${P}/monitors/:id`, (req) =>
  monitors.patch(req.params.id, req.body as Partial<Monitor>),
);
del(`${P}/monitors/:id`, (req) => {
  monitors.remove(req.params.id);
  return { ok: true };
});
post(`${P}/monitors/test`, () => ({ ok: true, latencyMs: 37, message: "OK" }));
post(`${P}/monitors/hosts`, () => ({ added: 0 }));
post(`${P}/monitors/:id/run`, (req) => monitors.find(req.params.id));
post(`${P}/monitors/:id/pause`, (req) => {
  const paused = (req.body as { paused?: boolean }).paused;
  return monitors.patch(req.params.id, {
    status: paused ? "paused" : "up",
    enabled: !paused,
  });
});
post(`${P}/monitors/:id/watch`, (req) => {
  monitors.patch(req.params.id, {
    watching: !!(req.body as { on?: boolean }).on,
  });
  return { ok: true };
});
post(`${P}/monitors/:id/push-url`, () => ({
  pushUrl: "https://demo.invalid/plugin-api/uptime/push/demo-token-2",
}));
get(`${P}/monitors/:id/history`, () => ({
  points: Array.from({ length: 48 }, (_, i) => ({
    t: sec((48 - i) * 30),
    up: 30,
    down: i === 20 ? 2 : 0,
    ms: 40 + ((i * 11) % 30),
    min: 25,
    max: 120,
  })),
}));
get(`${P}/monitors/:id/shares`, () => ({ shares: [] }));
put(`${P}/monitors/:id/shares`, () => ({ ok: true }));
get(`${P}/share-targets`, () => ({
  users: [{ id: "demo-user", username: "demo" }],
  roles: [{ id: 1, name: "admin", displayName: "Admin" }],
}));
get(`${P}/incidents`, () => ({
  incidents: [
    {
      id: 1,
      monitorId: 5,
      monitorName: "Media server",
      startedAt: sec(60 * 3),
      endedAt: null,
      cause: "Request timed out",
      ackBy: null,
      ackAt: null,
      note: "",
    },
    {
      id: 2,
      monitorId: 1,
      monitorName: "Termix",
      startedAt: sec(60 * 52),
      endedAt: sec(60 * 51),
      cause: "HTTP 502",
      ackBy: "demo",
      ackAt: sec(60 * 51),
      note: "Upstream restarted",
    },
  ],
}));
post(`${P}/incidents/:id/ack`, () => ({ ok: true }));
get(`${P}/maintenance`, () => ({ windows: windows.all() }));
post(`${P}/maintenance`, (req) =>
  windows.insert({
    monitorKeys: [],
    active: false,
    ...(req.body as object),
    id: windows.nextId(),
  }),
);
put(`${P}/maintenance/:id`, (req) =>
  windows.patch(req.params.id, req.body as Record<string, unknown>),
);
del(`${P}/maintenance/:id`, (req) => {
  windows.remove(req.params.id);
  return { ok: true };
});
get(`${P}/pages`, () => ({ pages: pages.all() }));
post(`${P}/pages`, (req) =>
  pages.insert({
    description: "",
    published: true,
    showLatency: false,
    ...(req.body as object),
    id: pages.nextId(),
    url: "https://demo.invalid/status/new",
  }),
);
put(`${P}/pages/:id`, (req) =>
  pages.patch(req.params.id, req.body as Record<string, unknown>),
);
del(`${P}/pages/:id`, (req) => {
  pages.remove(req.params.id);
  return { ok: true };
});
get(`${P}/pages/:id/notes`, () => ({
  notes: [
    {
      id: 1,
      title: "Planned patching",
      body: "Short restarts are expected on Sunday night.",
      level: "info",
      createdAt: sec(60 * 20),
      resolvedAt: null,
    },
  ],
}));
post(`${P}/pages/:id/notes`, () => ({ ok: true }));
post(`${P}/pages/:id/notes/:note`, () => ({ ok: true }));
del(`${P}/pages/:id/notes/:note`, () => ({ ok: true }));
