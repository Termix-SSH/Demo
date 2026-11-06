import { get, post } from "../../router";

const P = "/plugin-api/log-search";

type Source = "journal" | "files" | "docker";
type Level = "error" | "warn" | "info" | "debug";

const HOSTS = [
  { id: 1, name: "web-01", folder: "Production" },
  { id: 2, name: "web-02", folder: "Production" },
  { id: 3, name: "db-primary", folder: "Production" },
  { id: 8, name: "nas", folder: "Homelab" },
];

const LINES: Array<[number, Source, string, Level, string]> = [
  [
    1,
    "journal",
    "nginx.service",
    "error",
    "connect() failed (111: Connection refused) while connecting to upstream",
  ],
  [
    1,
    "files",
    "/var/log/nginx/error.log",
    "warn",
    "upstream server temporarily disabled while reading response header",
  ],
  [1, "docker", "app", "info", "GET /health 200 3ms"],
  [
    2,
    "journal",
    "sshd.service",
    "warn",
    "Failed password for invalid user admin from 203.0.113.44 port 51922",
  ],
  [
    2,
    "journal",
    "nginx.service",
    "info",
    "Started A high performance web server and a reverse proxy server.",
  ],
  [
    3,
    "journal",
    "postgresql.service",
    "error",
    'FATAL: password authentication failed for user "app"',
  ],
  [
    3,
    "files",
    "/var/log/postgresql/postgresql-17-main.log",
    "warn",
    "checkpoints are occurring too frequently (24 seconds apart)",
  ],
  [
    3,
    "journal",
    "postgresql.service",
    "info",
    "database system is ready to accept connections",
  ],
  [8, "journal", "smbd.service", "info", "smbd version 4.21.0 started."],
  [
    8,
    "journal",
    "kernel",
    "warn",
    "ata2.00: exception Emask 0x0 SAct 0x0 SErr 0x0 action 0x6 frozen",
  ],
];

post(`${P}/search`, (req) => {
  const b = req.body as {
    query?: string;
    hostIds?: number[];
    sources?: Source[];
    level?: string;
    limit?: number;
  };
  const q = (b.query ?? "").toLowerCase();
  const now = Date.now();
  const rows = LINES.map(([hostId, source, origin, level, message], i) => ({
    time: now - (i + 1) * 7 * 60_000,
    hostId,
    host: HOSTS.find((h) => h.id === hostId)?.name ?? "",
    source,
    origin,
    level,
    message,
  })).filter(
    (r) =>
      (!q || r.message.toLowerCase().includes(q)) &&
      (!b.hostIds?.length || b.hostIds.includes(r.hostId)) &&
      (!b.sources?.length || b.sources.includes(r.source)) &&
      (b.level === "error"
        ? r.level === "error"
        : b.level === "warn"
          ? r.level === "error" || r.level === "warn"
          : true),
  );
  const ids = b.hostIds?.length ? b.hostIds : HOSTS.map((h) => h.id);
  return {
    entries: rows.slice(0, b.limit ?? 500),
    hosts: HOSTS.filter((h) => ids.includes(h.id)).map((h) => ({
      hostId: h.id,
      host: h.name,
      status: "ok",
      count: rows.filter((r) => r.hostId === h.id).length,
      sources: {},
    })),
    truncated: false,
    tookMs: 412,
  };
});
get(`${P}/hosts`, () => ({ hosts: HOSTS }));
