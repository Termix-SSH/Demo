import { del, get, HttpError, post, put } from "../../router";
import { isRecording } from "../../recording";
import { value } from "../../store";

const P = "/plugin-api/web-servers";
const DAY = 86_400_000;

type Kind = "nginx" | "apache" | "caddy";

const server = (
  kind: Kind,
  installed: boolean,
  version: string,
  state: string,
) => ({
  kind,
  installed,
  version,
  unit: kind === "apache" ? "apache2" : kind,
  state,
  boot: installed,
  layout: kind === "caddy" ? "caddy" : "debian",
  root: kind === "apache" ? "/etc/apache2" : `/etc/${kind}`,
  mainFile:
    kind === "nginx"
      ? "/etc/nginx/nginx.conf"
      : kind === "apache"
        ? "/etc/apache2/apache2.conf"
        : "/etc/caddy/Caddyfile",
  siteDir:
    kind === "caddy"
      ? "/etc/caddy/sites"
      : `/etc/${kind === "apache" ? "apache2" : kind}/sites-available`,
  enabledDir:
    kind === "caddy"
      ? ""
      : `/etc/${kind === "apache" ? "apache2" : kind}/sites-enabled`,
  logDir: `/var/log/${kind === "apache" ? "apache2" : kind}`,
});

const site = (
  kind: Kind,
  name: string,
  names: string[],
  extra: {
    enabled?: boolean;
    root?: string;
    upstream?: string;
    days?: number | null;
  } = {},
) => {
  const days = extra.days ?? null;
  return {
    key: `${kind}:${name}`,
    server: kind,
    name,
    file: `/etc/${kind}/sites-available/${name}.conf`,
    enabled: extra.enabled !== false,
    names,
    listen: days === null ? ["80"] : ["443 ssl"],
    root: extra.root ?? "",
    upstream: extra.upstream ?? "",
    tls: days !== null || kind === "caddy",
    certPath:
      days === null ? "" : `/etc/letsencrypt/live/${names[0]}/fullchain.pem`,
    certExpiry:
      days === null ? "" : new Date(Date.now() + days * DAY).toISOString(),
    certDaysLeft: days,
    accessLog: `/var/log/${kind}/${name}.access.log`,
    errorLog: `/var/log/${kind}/${name}.error.log`,
    spec: null,
  };
};

const state = value("web-servers-state", () => ({
  watching: false,
  sites: [
    site("nginx", "default", ["_"], { root: "/var/www/html" }),
    site("nginx", "grafana", ["grafana.home.arpa"], {
      upstream: "http://127.0.0.1:3000",
      days: 52,
    }),
    site("nginx", "nextcloud", ["cloud.home.arpa"], {
      root: "/var/www/nextcloud",
      days: 9,
    }),
    site("nginx", "old-blog", ["blog.home.arpa"], {
      enabled: false,
      root: "/var/www/blog",
    }),
    site("caddy", "jellyfin", ["media.home.arpa"], {
      upstream: "127.0.0.1:8096",
    }),
  ],
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const done = (text: string) => ({
  ok: true,
  output: isRecording()
    ? ""
    : `${text}\nThis is a demo, so nothing changed on a real host.`,
});

const TESTED =
  "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful";

const ACCESS = Array.from({ length: 40 }, (_, i) => {
  const paths = ["/", "/login", "/api/status", "/static/app.js", "/missing"];
  const codes = [200, 200, 200, 304, 404, 502];
  const t = new Date(Date.now() - (40 - i) * 30_000);
  return `192.168.1.${10 + (i % 5)} - - [${t.toUTCString()}] "GET ${paths[i % paths.length]} HTTP/1.1" ${codes[i % codes.length]} 512 "-" "Mozilla/5.0"`;
});

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  root: true,
  systemd: true,
  manager: "apt-get",
  certbot: "2.9.0",
  certbotNginx: true,
  certbotApache: false,
  servers: [
    server("nginx", true, "1.24.0", "active"),
    server("apache", false, "", ""),
    server("caddy", true, "2.8.4", "active"),
  ],
  phpSockets: ["/run/php/php8.3-fpm.sock"],
  watching: state.get().watching,
  canEdit: true,
  readOnly: false,
}));
get(`${P}/:host/sites`, () => state.get().sites);
get(`${P}/:host/sites/:server/:name`, (req) => {
  const found = state
    .get()
    .sites.find((s) => s.key === `${req.params.server}:${req.params.name}`);
  if (!found) throw new HttpError(400, { error: "That site is gone" });
  return {
    file: found.file,
    enabled: found.enabled,
    content: found.upstream
      ? `server {\n    listen 80;\n    server_name ${found.names.join(" ")};\n\n    location / {\n        proxy_pass ${found.upstream};\n    }\n}\n`
      : `server {\n    listen 80;\n    server_name ${found.names.join(" ")};\n    root ${found.root};\n}\n`,
    spec: null,
  };
});
post(`${P}/:host/sites/preview`, (req) => {
  const b = req.body as { spec?: { names?: string[]; upstream?: string } };
  return {
    content: `server {\n    listen 80;\n    server_name ${(b.spec?.names ?? []).join(" ")};\n\n    location / {\n        proxy_pass ${b.spec?.upstream ?? ""};\n    }\n}\n`,
  };
});
post(`${P}/:host/sites`, async (req) => {
  const b = req.body as {
    server: Kind;
    name: string;
    spec?: { names?: string[]; root?: string; upstream?: string };
  };
  await wait(1200);
  state.update((s) => ({
    ...s,
    sites: [
      ...s.sites,
      site(b.server, b.name, b.spec?.names ?? [b.name], {
        root: b.spec?.root,
        upstream: b.spec?.upstream,
      }),
    ],
  }));
  return done(TESTED);
});
put(`${P}/:host/sites/:server/:name`, async () => {
  await wait(800);
  return done(TESTED);
});
for (const on of [true, false]) {
  post(`${P}/:host/sites/:server/:name/${on ? "enable" : "disable"}`, (req) => {
    const key = `${req.params.server}:${req.params.name}`;
    state.update((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.key === key ? { ...x, enabled: on } : x)),
    }));
    return done(TESTED);
  });
}
del(`${P}/:host/sites/:server/:name`, (req) => {
  const key = `${req.params.server}:${req.params.name}`;
  state.update((s) => ({ ...s, sites: s.sites.filter((x) => x.key !== key) }));
  return done(TESTED);
});
post(`${P}/:host/sites/:server/:name/certificate`, async () => {
  await wait(2500);
  return done("Successfully received certificate.");
});
get(`${P}/:host/files`, () => [
  { path: "/etc/nginx/nginx.conf", size: 1446, link: false },
  { path: "/etc/nginx/mime.types", size: 5349, link: false },
  ...state
    .get()
    .sites.filter((s) => s.server === "nginx")
    .map((s) => ({ path: s.file, size: 420, link: false })),
]);
get(`${P}/:host/file`, (req) => ({
  path: String(req.query.path ?? ""),
  content:
    "user www-data;\nworker_processes auto;\n\nevents {\n    worker_connections 768;\n}\n\nhttp {\n    include /etc/nginx/mime.types;\n    include /etc/nginx/sites-enabled/*;\n}\n",
  backups: [
    {
      id: String(Math.floor(Date.now() / 1000) - 86_400),
      at: new Date(Date.now() - DAY).toISOString(),
      size: 1402,
    },
  ],
}));
put(`${P}/:host/file`, async () => {
  await wait(800);
  return done(TESTED);
});
post(`${P}/:host/test`, () => ({ ok: true, output: TESTED }));
post(`${P}/:host/service`, async () => {
  await wait(800);
  return done("");
});
post(`${P}/:host/install`, async () => {
  await wait(2500);
  return done("Setting up apache2 ...");
});
post(`${P}/:host/install-certbot`, () => done("certbot is already installed."));
get(`${P}/:host/logs`, () => [
  { path: "/var/log/nginx/access.log", size: 48_210 },
  { path: "/var/log/nginx/error.log", size: 1_204 },
  { path: "/var/log/nginx/grafana.access.log", size: 9_120 },
]);
get(`${P}/:host/log`, (req) => {
  if (String(req.query.path ?? "").includes("error")) {
    return {
      lines: [
        "2026/11/05 10:12:01 [error] 812#812: *41 connect() failed (111: Connection refused) while connecting to upstream",
      ],
      stats: null,
    };
  }
  return {
    lines: ACCESS,
    stats: {
      lines: ACCESS.length,
      status: { "2xx": 21, "3xx": 7, "4xx": 6, "5xx": 6, other: 0 },
      paths: [
        { value: "/", count: 8 },
        { value: "/login", count: 8 },
        { value: "/api/status", count: 8 },
      ],
      clients: [
        { value: "192.168.1.10", count: 8 },
        { value: "192.168.1.11", count: 8 },
      ],
    },
  };
});
post(`${P}/:host/watch`, (req) => {
  const on = (req.body as { on?: boolean }).on === true;
  state.update((s) => ({ ...s, watching: on }));
  return { watching: on };
});
get(`${P}/summary`, () => [
  {
    hostId: 1,
    checkedAt: new Date().toISOString(),
    servers: [
      {
        kind: "nginx",
        version: "1.24.0",
        state: "active",
        sites: state.get().sites.filter((s) => s.server === "nginx").length,
      },
      {
        kind: "caddy",
        version: "2.8.4",
        state: "active",
        sites: state.get().sites.filter((s) => s.server === "caddy").length,
      },
    ],
  },
]);
