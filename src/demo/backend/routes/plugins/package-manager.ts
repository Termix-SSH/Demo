import { get, post } from "../../router";
import { isRecording } from "../../recording";
import { value } from "../../store";

const P = "/plugin-api/package-manager";

interface Update {
  name: string;
  current: string;
  available: string;
  repo: string;
  security: boolean;
}

const UPDATES: Update[] = [
  {
    name: "openssl",
    current: "3.0.13-0ubuntu3.5",
    available: "3.0.13-0ubuntu3.6",
    repo: "noble-security",
    security: true,
  },
  {
    name: "curl",
    current: "8.5.0-2ubuntu10.6",
    available: "8.5.0-2ubuntu10.7",
    repo: "noble-security",
    security: true,
  },
  {
    name: "nginx",
    current: "1.24.0-2ubuntu7.4",
    available: "1.24.0-2ubuntu7.5",
    repo: "noble-updates",
    security: false,
  },
  {
    name: "linux-image-generic",
    current: "6.8.0.79.79",
    available: "6.8.0.83.83",
    repo: "noble-updates",
    security: false,
  },
  {
    name: "tzdata",
    current: "2025b-0ubuntu0.24.04",
    available: "2026a-0ubuntu0.24.04",
    repo: "noble-updates",
    security: false,
  },
];

const INSTALLED = [
  ["bash", "5.2.21-2ubuntu4", 1_966_080, "GNU Bourne Again SHell"],
  [
    "curl",
    "8.5.0-2ubuntu10.6",
    512_000,
    "command line tool for transferring data with URL syntax",
  ],
  [
    "docker-ce",
    "5:27.3.1-1~ubuntu.24.04~noble",
    104_857_600,
    "Docker: the open-source application container engine",
  ],
  [
    "git",
    "1:2.43.0-1ubuntu7.1",
    38_000_000,
    "fast, scalable, distributed revision control system",
  ],
  ["htop", "3.3.0-4build1", 450_000, "interactive processes viewer"],
  [
    "nginx",
    "1.24.0-2ubuntu7.4",
    1_400_000,
    "small, powerful, scalable web/proxy server",
  ],
  ["openssl", "3.0.13-0ubuntu3.5", 2_200_000, "Secure Sockets Layer toolkit"],
  [
    "postgresql-16",
    "16.4-0ubuntu0.24.04.2",
    52_000_000,
    "The World's Most Advanced Open Source Relational Database",
  ],
  [
    "redis-server",
    "5:7.0.15-1build2",
    300_000,
    "Persistent key-value database with network interface",
  ],
  [
    "tzdata",
    "2025b-0ubuntu0.24.04",
    3_900_000,
    "time zone and daylight-saving time data",
  ],
] as const;

const state = value("package-manager-state", () => ({
  updates: UPDATES,
  held: ["postgresql-16"] as string[],
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const note = () =>
  isRecording() ? "" : "This is a demo, so nothing changed on a real host.";

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  manager: "apt",
  root: true,
  rebootRequired: true,
  indexUpdatedAt: Math.floor(Date.now() / 1000) - 3 * 3600,
  singleUpdates: true,
  holds: true,
  canEdit: true,
  readOnly: false,
}));
get(`${P}/:host/updates`, () => state.get().updates);
get(`${P}/:host/installed`, () =>
  INSTALLED.map(([name, version, size, summary]) => ({
    name,
    version,
    size,
    summary,
    held: state.get().held.includes(name),
  })),
);
get(`${P}/:host/search`, (req) => {
  const q = String(req.query.q ?? "").toLowerCase();
  return [
    {
      name: "btop",
      version: "",
      summary: "Modern and colorful command line resource monitor",
      installed: false,
    },
    {
      name: "htop",
      version: "",
      summary: "interactive processes viewer",
      installed: true,
    },
    {
      name: "ncdu",
      version: "",
      summary: "ncurses disk usage viewer",
      installed: false,
    },
    {
      name: "tmux",
      version: "",
      summary: "terminal multiplexer",
      installed: false,
    },
  ].filter((p) => p.name.includes(q) || p.summary.toLowerCase().includes(q));
});
get(`${P}/:host/history`, () => [
  {
    date: "2026-11-02  03:10:12",
    action: "upgrade",
    packages: "libssl3t64, openssl",
    command: "apt-get -y upgrade",
  },
  {
    date: "2026-10-28  14:02:51",
    action: "install",
    packages: "htop",
    command: "apt-get install htop",
  },
  {
    date: "2026-10-21  09:44:03",
    action: "remove",
    packages: "apache2",
    command: "apt-get remove apache2",
  },
]);
get(`${P}/:host/repos`, () => [
  {
    id: "ubuntu.sources",
    name: "noble noble-updates noble-backports main restricted universe",
    url: "http://archive.ubuntu.com/ubuntu",
    enabled: true,
  },
  {
    id: "ubuntu.sources",
    name: "noble-security main restricted universe",
    url: "http://security.ubuntu.com/ubuntu",
    enabled: true,
  },
  {
    id: "docker.list",
    name: "noble stable",
    url: "https://download.docker.com/linux/ubuntu",
    enabled: true,
  },
]);
post(`${P}/:host/action`, async (req) => {
  const b = req.body as { action: string; packages?: string[] };
  await wait(b.action === "upgrade-all" ? 2500 : 900);
  const names = b.packages ?? [];
  state.update((s) => ({
    updates:
      b.action === "upgrade-all"
        ? []
        : b.action === "update"
          ? s.updates.filter((u) => !names.includes(u.name))
          : s.updates,
    held:
      b.action === "hold"
        ? [...new Set([...s.held, ...names])]
        : b.action === "unhold"
          ? s.held.filter((n) => !names.includes(n))
          : s.held,
  }));
  return { ok: true, output: note() };
});
get(`${P}/summary`, () => {
  const updates = state.get().updates;
  return [
    {
      hostId: 1,
      updates: updates.length,
      security: updates.filter((u) => u.security).length,
      reboot: true,
      checkedAt: new Date().toISOString(),
    },
  ];
});
