import { del, get, HttpError, post, put } from "../../router";
import { socket } from "../../sockets";
import { value } from "../../store";
import { hosts } from "../hosts";

const P = "/plugin-api/service-manager";

interface Unit {
  name: string;
  type: string;
  load: string;
  active: string;
  sub: string;
  description: string;
  fileState: string;
  preset: string;
  user?: string;
  exec?: string;
  local?: boolean;
  override?: string;
}

const svc = (
  name: string,
  description: string,
  active: "active" | "inactive" | "failed",
  fileState = "enabled",
  extra: Partial<Unit> = {},
): Unit => ({
  name,
  type: name.split(".").pop() ?? "service",
  load: "loaded",
  active,
  sub:
    active === "active"
      ? name.endsWith(".service")
        ? "running"
        : name.endsWith(".timer")
          ? "waiting"
          : "listening"
      : active === "failed"
        ? "failed"
        : "dead",
  description,
  fileState,
  preset: "enabled",
  ...extra,
});

const SEED: Unit[] = [
  svc("nginx.service", "A high performance web server", "active", "enabled", {
    exec: "/usr/sbin/nginx -g 'daemon on; master_process on;'",
  }),
  svc("app.service", "Shop API", "active", "enabled", {
    user: "deploy",
    exec: "/usr/bin/node /srv/app/server.js",
    local: true,
  }),
  svc("worker.service", "Shop background jobs", "failed", "enabled", {
    user: "deploy",
    exec: "/usr/bin/node /srv/app/worker.js",
    local: true,
  }),
  svc("postgresql.service", "PostgreSQL RDBMS", "active"),
  svc("redis-server.service", "Advanced key-value store", "active"),
  svc("ssh.service", "OpenBSD Secure Shell server", "active"),
  svc("cron.service", "Regular background program processing", "active"),
  svc("docker.service", "Docker Application Container Engine", "active"),
  svc("containerd.service", "containerd container runtime", "active"),
  svc("fail2ban.service", "Fail2Ban Service", "active"),
  svc(
    "node-exporter.service",
    "Prometheus node exporter",
    "active",
    "enabled",
    {
      user: "prometheus",
      local: true,
    },
  ),
  svc("unattended-upgrades.service", "Unattended Upgrades Shutdown", "active"),
  svc("systemd-journald.service", "Journal Service", "active", "static"),
  svc("systemd-resolved.service", "Network Name Resolution", "active"),
  svc("systemd-timesyncd.service", "Network Time Synchronization", "active"),
  svc("rsyslog.service", "System Logging Service", "active"),
  svc("bluetooth.service", "Bluetooth service", "inactive", "masked"),
  svc("apache2.service", "The Apache HTTP Server", "inactive", "disabled"),
  svc("snapd.service", "Snap Daemon", "inactive", "disabled"),
  svc("backup.service", "Nightly database backup", "inactive", "static", {
    user: "postgres",
    exec: "/usr/local/bin/pg-backup.sh",
    local: true,
  }),
  svc(
    "ssh.socket",
    "OpenBSD Secure Shell server socket",
    "inactive",
    "disabled",
  ),
  svc("docker.socket", "Docker Socket for the API", "active"),
  svc("backup.timer", "Run the nightly backup", "active", "enabled", {
    local: true,
  }),
  svc("logrotate.timer", "Daily rotation of log files", "active"),
  svc("apt-daily.timer", "Daily apt download activities", "active"),
  svc("certbot.timer", "Run certbot twice daily", "active"),
  svc("multi-user.target", "Multi-User System", "active", "static"),
  svc("network-online.target", "Network is Online", "active", "static"),
];

const units = value<Record<string, Unit[]>>("services-units", () => ({}));
const watches = value<Record<string, string[]>>("services-watches", () => ({
  "1": ["app.service", "nginx.service"],
}));

function unitsFor(host: string): Unit[] {
  const all = units.get();
  if (all[host]) return all[host];
  const seeded = SEED.map((u) => ({ ...u }));
  units.update((prev) => ({ ...prev, [host]: seeded }));
  return seeded;
}

function setUnits(host: string, list: Unit[]) {
  units.update((prev) => ({ ...prev, [host]: list }));
}

function find(host: string, name: string): Unit {
  const found = unitsFor(host).find((u) => u.name === name);
  if (!found) {
    throw new HttpError(404, { error: `Unit ${name} could not be found.` });
  }
  return found;
}

function patchUnit(host: string, name: string, changes: Partial<Unit>) {
  setUnits(
    host,
    unitsFor(host).map((u) => (u.name === name ? { ...u, ...changes } : u)),
  );
}

const MIN = 60_000;
const boot = Date.now() - 6 * 24 * 60 * MIN - 3 * 60 * MIN;
const stamp = (ms: number) => new Date(ms).toUTCString().replace("GMT", "UTC");

function hostname(host: string) {
  return (hosts.find(host) as { name?: string } | undefined)?.name ?? "host";
}

function fragment(u: Unit): string {
  if (u.type === "timer") {
    return `[Unit]\nDescription=${u.description}\n\n[Timer]\nOnCalendar=*-*-* 02:30:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`;
  }
  return [
    "[Unit]",
    `Description=${u.description}`,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    `Type=${u.name === "backup.service" ? "oneshot" : "simple"}`,
    u.user ? `User=${u.user}` : "",
    u.user === "deploy" ? "WorkingDirectory=/srv/app" : "",
    u.user === "deploy" ? "Environment=NODE_ENV=production" : "",
    `ExecStart=${u.exec ?? `/usr/sbin/${u.name.replace(/\.service$/, "")}`}`,
    u.name === "backup.service" ? "" : "Restart=on-failure",
    u.name === "backup.service" ? "" : "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}

function fragmentPath(u: Unit) {
  return u.local
    ? `/etc/systemd/system/${u.name}`
    : `/usr/lib/systemd/system/${u.name}`;
}

const MESSAGES: Record<string, string[]> = {
  "nginx.service": [
    "Starting nginx.service - A high performance web server...",
    "Started nginx.service - A high performance web server.",
  ],
  "app.service": [
    "Listening on :3000",
    "GET /api/products 200 14ms",
    "POST /api/cart 201 31ms",
    "GET /api/orders/1043 200 9ms",
    "GET /healthz 200 1ms",
  ],
  "worker.service": [
    "Connecting to redis at 10.0.12.50:6379",
    "Error: connect ECONNREFUSED 10.0.12.50:6379",
    "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)",
    "worker.service: Main process exited, code=exited, status=1/FAILURE",
    "worker.service: Failed with result 'exit-code'.",
  ],
  "postgresql.service": [
    "checkpoint starting: time",
    "checkpoint complete: wrote 412 buffers (2.5%)",
  ],
  "ssh.service": [
    "Accepted publickey for deploy from 10.0.0.8 port 52114 ssh2: ED25519 SHA256:4mR",
    "pam_unix(sshd:session): session opened for user deploy(uid=1000) by deploy(uid=0)",
    "Invalid user admin from 203.0.113.77 port 40822",
  ],
  "cron.service": ["(root) CMD (cd / && run-parts --report /etc/cron.hourly)"],
  "fail2ban.service": ["[sshd] Ban 203.0.113.77"],
};

const IDENT: Record<string, string> = {
  "nginx.service": "systemd",
  "app.service": "node",
  "worker.service": "node",
  "postgresql.service": "postgres",
  "ssh.service": "sshd",
  "cron.service": "CRON",
  "fail2ban.service": "fail2ban-server",
};

function priorityOf(message: string) {
  if (/error|failed|failure/i.test(message)) return 3;
  if (/invalid|ban/i.test(message)) return 4;
  return 6;
}

function entry(unit: string, message: string, time: number) {
  return {
    time,
    priority: priorityOf(message),
    unit,
    ident: IDENT[unit] ?? unit.replace(/\..*$/, ""),
    pid: String(1000 + ((unit.length * 97 + message.length) % 8000)),
    message,
  };
}

function journal(
  filter: { units: string[]; priority?: number; grep?: string },
  count: number,
) {
  const names = filter.units.length ? filter.units : Object.keys(MESSAGES);
  const out = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const unit = names[i % names.length];
    const list = MESSAGES[unit] ?? [`${unit}: running`];
    const message = list[(count - 1 - i) % list.length];
    out.push(entry(unit, message, now - i * 47_000 - (i % 7) * 3100));
  }
  return out.filter(
    (e) =>
      (filter.priority === undefined || e.priority <= filter.priority) &&
      (!filter.grep ||
        e.message.toLowerCase().includes(filter.grep.toLowerCase())),
  );
}

const LOG_FILES = [
  { path: "/var/log/nginx/access.log", size: 18_331_204, compressed: false },
  { path: "/var/log/nginx/error.log", size: 41_212, compressed: false },
  { path: "/var/log/nginx/access.log.1", size: 22_901_877, compressed: false },
  { path: "/var/log/nginx/access.log.2.gz", size: 2_114_520, compressed: true },
  { path: "/var/log/auth.log", size: 1_204_331, compressed: false },
  { path: "/var/log/syslog", size: 4_820_115, compressed: false },
  { path: "/var/log/dpkg.log", size: 288_014, compressed: false },
  {
    path: "/var/log/postgresql/postgresql-16-main.log",
    size: 912_440,
    compressed: false,
  },
];

const PATHS = [
  "/api/products",
  "/api/cart",
  "/",
  "/static/app.js",
  "/api/orders/1043",
  "/healthz",
];
const IPS = ["203.0.113.14", "198.51.100.7", "192.0.2.66", "10.0.0.8"];

function fileLine(path: string, i: number, time: number): string {
  const d = new Date(time);
  if (path.includes("access")) {
    const stampText = d.toUTCString().split(" ").slice(1, 5).join(" ");
    const status = i % 17 === 0 ? 404 : i % 29 === 0 ? 502 : 200;
    return `${IPS[i % IPS.length]} - - [${stampText} +0000] "GET ${PATHS[i % PATHS.length]} HTTP/1.1" ${status} ${1200 + ((i * 331) % 9000)} "-" "Mozilla/5.0"`;
  }
  if (path.includes("error")) {
    return `${d.toISOString().replace("T", " ").slice(0, 19)} [error] 812#812: *${4000 + i} connect() failed (111: Connection refused) while connecting to upstream, upstream: "http://127.0.0.1:3002/"`;
  }
  if (path.includes("auth")) {
    return `${d.toISOString().slice(0, 19)} web-01 sshd[${2200 + i}]: ${i % 3 ? "Accepted publickey for deploy from 10.0.0.8" : "Invalid user admin from 203.0.113.77"} port ${40000 + i}`;
  }
  return `${d.toISOString().slice(0, 19)} web-01 systemd[1]: Started session-${300 + i}.scope - Session ${300 + i} of User deploy.`;
}

function fileLines(path: string, count: number, grep = "") {
  const now = Date.now();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--)
    out.push(fileLine(path, i, now - i * 9000));
  return grep
    ? out.filter((l) => l.toLowerCase().includes(grep.toLowerCase()))
    : out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

get(`${P}/:host/status`, (req) => ({
  init: "systemd",
  version: "systemd 255 (255.4-1ubuntu8.4)",
  os: "Ubuntu 24.04.1 LTS",
  hostname: hostname(req.params.host),
  root: true,
  journal: true,
  failed: unitsFor(req.params.host).filter((u) => u.active === "failed").length,
  canEdit: true,
  readOnly: false,
  logRoots: ["/var/log"],
}));

get(`${P}/:host/units`, (req) => {
  const type = req.query.type || "service";
  return unitsFor(req.params.host)
    .filter((u) => u.type === type)
    .map(({ user: _u, exec: _e, local: _l, override: _o, ...rest }) => rest);
});

get(`${P}/:host/units/:unit`, (req) => {
  const u = find(req.params.host, req.params.unit);
  const running = u.active === "active";
  const seed = u.name.length * 131;
  const since = running ? Date.now() - (seed % 90) * 3600_000 - 7 * MIN : boot;
  const props: Record<string, string> = {
    Description: u.description,
    LoadState: u.load,
    ActiveState: u.active,
    SubState: u.sub,
    UnitFileState: u.fileState,
    Type: u.name === "backup.service" ? "oneshot" : "simple",
    User: u.user ?? "",
    MainPID: running ? String(800 + (seed % 9000)) : "0",
    MemoryCurrent: running
      ? String((seed % 400) * 1_048_576 + 9_437_184)
      : "[not set]",
    MemoryPeak: running
      ? String((seed % 520) * 1_048_576 + 14_680_064)
      : "[not set]",
    CPUUsageNSec: String((seed % 9000) * 41_000_000),
    TasksCurrent: running ? String((seed % 30) + 1) : "0",
    NRestarts:
      u.active === "failed" ? "5" : u.name === "app.service" ? "1" : "0",
    Result: u.active === "failed" ? "exit-code" : "success",
    ActiveEnterTimestamp: running ? stamp(since) : "",
    FragmentPath: fragmentPath(u),
    DropInPaths: u.override
      ? `/etc/systemd/system/${u.name}.d/override.conf`
      : "",
    TriggeredBy: u.name === "backup.service" ? "backup.timer" : "",
    CanStart: "yes",
    CanReload: u.name === "nginx.service" ? "yes" : "no",
  };
  const logs = journal({ units: [u.name] }, 6)
    .map(
      (e) =>
        `${new Date(e.time).toUTCString().slice(5, 25)} ${hostname(req.params.host)} ${e.ident}[${e.pid}]: ${e.message}`,
    )
    .join("\n");
  const status = [
    `${u.active === "failed" ? "×" : running ? "●" : "○"} ${u.name} - ${u.description}`,
    `     Loaded: ${u.load} (${fragmentPath(u)}; ${u.fileState}; preset: ${u.preset})`,
    `     Active: ${u.active} (${u.sub})${running ? ` since ${stamp(since)}` : ""}`,
    running
      ? `   Main PID: ${props.MainPID} (${IDENT[u.name] ?? u.name.replace(/\..*$/, "")})`
      : "",
    "",
    logs,
  ]
    .filter((l, i) => l !== "" || i === 4)
    .join("\n");
  return { name: u.name, props, status };
});

post(`${P}/:host/units/:unit/actions/:action`, async (req) => {
  const { host, unit, action } = req.params;
  const u = find(host, unit);
  await wait(action.includes("restart") ? 900 : 600);
  const next: Partial<Unit> = {};
  const start = {
    active: "active",
    sub:
      u.type === "service"
        ? "running"
        : u.type === "timer"
          ? "waiting"
          : "listening",
  };
  const stop = { active: "inactive", sub: "dead" };
  switch (action) {
    case "start":
    case "restart":
    case "reload":
    case "reset-failed":
      Object.assign(next, action === "reset-failed" ? stop : start);
      break;
    case "stop":
      Object.assign(next, stop);
      break;
    case "enable":
      next.fileState = "enabled";
      break;
    case "disable":
      next.fileState = "disabled";
      break;
    case "enable-now":
      Object.assign(next, start, { fileState: "enabled" });
      break;
    case "disable-now":
      Object.assign(next, stop, { fileState: "disabled" });
      break;
    case "mask":
      Object.assign(next, stop, { fileState: "masked" });
      break;
    case "unmask":
      next.fileState = "disabled";
      break;
    case "revert":
      next.override = "";
      break;
  }
  patchUnit(host, unit, next);
  const state = (next.active ?? u.active) as string;
  return { state, output: "" };
});

get(`${P}/:host/units/:unit/file`, (req) => {
  const u = find(req.params.host, req.params.unit);
  const frag = fragment(u);
  const overridePath = `/etc/systemd/system/${u.name}.d/override.conf`;
  return {
    name: u.name,
    combined: `# ${fragmentPath(u)}\n${frag}${u.override ? `\n# ${overridePath}\n${u.override}` : ""}`,
    fragmentPath: fragmentPath(u),
    fragment: frag,
    dropIns: u.override ? [overridePath] : [],
    override: u.override ?? "",
    overridePath,
    local: !!u.local,
    writable: true,
  };
});

post(`${P}/:host/units/:unit/file/verify`, async (req) => {
  await wait(500);
  const { text = "" } = (req.body ?? {}) as { text?: string };
  const bad = text
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .find(
      ({ line }) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("[") &&
        !line.includes("="),
    );
  return bad
    ? {
        ok: false,
        output: `/tmp/termix-verify/${req.params.unit}:${bad.n}: Missing '=', ignoring line.`,
      }
    : { ok: true, output: "" };
});

put(`${P}/:host/units/:unit/file`, async (req) => {
  const { target, text } = req.body as { target: string; text: string };
  await wait(500);
  if (target === "override")
    patchUnit(req.params.host, req.params.unit, { override: text });
  return { ok: true };
});

del(`${P}/:host/units/:unit/file`, (req) => {
  setUnits(
    req.params.host,
    unitsFor(req.params.host).filter((u) => u.name !== req.params.unit),
  );
  return { ok: true };
});

post(`${P}/:host/units`, async (req) => {
  const b = req.body as {
    name: string;
    description: string;
    execStart: string;
    user: string;
    enable: boolean;
    start: boolean;
    onCalendar: string;
  };
  if (!/^[\w@.-]+$/.test(b.name ?? "")) {
    throw new HttpError(400, {
      error: "Use letters, numbers, dots and dashes",
    });
  }
  await wait(800);
  const base = b.name.replace(/\.service$/, "");
  const made: Unit[] = [
    svc(
      `${base}.service`,
      b.description || base,
      b.start && !b.onCalendar ? "active" : "inactive",
      b.onCalendar ? "static" : b.enable ? "enabled" : "disabled",
      {
        user: b.user || undefined,
        exec: b.execStart,
        local: true,
      },
    ),
  ];
  if (b.onCalendar) {
    made.push(
      svc(
        `${base}.timer`,
        `Run ${base}`,
        b.start ? "active" : "inactive",
        b.enable ? "enabled" : "disabled",
        { local: true },
      ),
    );
  }
  setUnits(req.params.host, [
    ...unitsFor(req.params.host).filter(
      (u) => !made.some((m) => m.name === u.name),
    ),
    ...made,
  ]);
  return { units: made.map((u) => u.name) };
});

get(`${P}/:host/timers`, (req) => {
  const now = Date.now();
  const list = unitsFor(req.params.host).filter((u) => u.type === "timer");
  const schedule: Record<string, [string, number, number, string]> = {
    "backup.timer": ["*-*-* 02:30:00", 6.2, 17.8, "backup.service"],
    "logrotate.timer": ["daily", 3.1, 20.9, "logrotate.service"],
    "apt-daily.timer": ["*-*-* 6,18:00", 1.4, 10.6, "apt-daily.service"],
    "certbot.timer": ["*-*-* 00,12:00:00", 4.5, 7.5, "certbot.service"],
  };
  return list.map((u) => {
    const [cal, last, next, activates] = schedule[u.name] ?? [
      "daily",
      2,
      22,
      u.name.replace(/\.timer$/, ".service"),
    ];
    const on = u.active === "active";
    return {
      name: u.name,
      description: u.description,
      active: u.active,
      fileState: u.fileState,
      next: on ? now + next * 3600_000 : null,
      last: now - last * 3600_000,
      activates,
      schedule: [`OnCalendar=${cal}`],
    };
  });
});

get(`${P}/:host/journal`, (req) => {
  // The demo router keeps one value per query key, so one unit filter.
  const list = req.query.unit ? [req.query.unit] : [];
  const lines = Number(req.query.lines) || 200;
  const priority = req.query.priority ? Number(req.query.priority) : undefined;
  return {
    entries: journal(
      { units: list, priority, grep: req.query.grep },
      Math.min(lines, 400),
    ),
    truncated: false,
  };
});
get(`${P}/:host/journal/boots`, () =>
  [0, -1, -2].map((offset, i) => ({
    offset,
    id:
      ["9f1c2a7e4b", "41d0be8c22", "7aa31f09d5"][i] +
      "c0ffee11aa22bb33cc44dd55",
    first: stamp(boot - i * 9 * 24 * 3600_000),
    last:
      i === 0
        ? stamp(Date.now())
        : stamp(boot - i * 9 * 24 * 3600_000 + 8 * 24 * 3600_000),
  })),
);
get(`${P}/:host/journal/usage`, () => ({ size: "412.3M" }));
post(`${P}/:host/journal/vacuum`, async () => {
  await wait(900);
  return {
    output:
      "Vacuuming done, freed 183.4M of archived journals from /var/log/journal/9f1c2a7e4bc0ffee.",
  };
});

get(`${P}/:host/logs`, () =>
  LOG_FILES.map((f, i) => ({
    ...f,
    modified: Date.now() - (i * 37 + 2) * MIN,
  })),
);
get(`${P}/:host/logs/file`, (req) => ({
  path: req.query.path,
  lines: fileLines(
    req.query.path,
    Math.min(Number(req.query.lines) || 200, 400),
    req.query.grep,
  ),
}));
get(`${P}/:host/logs/download`, (req) =>
  fileLines(req.query.path, 400).join("\n"),
);

get(`${P}/:host/watches`, (req) => {
  const list = watches.get()[req.params.host] ?? [];
  return list.map((unit) => ({
    unit,
    state: unitsFor(req.params.host).find((u) => u.name === unit)?.active ?? "",
  }));
});
post(`${P}/:host/watches`, (req) => {
  const { unit } = req.body as { unit: string };
  watches.update((all) => ({
    ...all,
    [req.params.host]: [...new Set([...(all[req.params.host] ?? []), unit])],
  }));
  return { ok: true };
});
del(`${P}/:host/watches/:unit`, (req) => {
  watches.update((all) => ({
    ...all,
    [req.params.host]: (all[req.params.host] ?? []).filter(
      (u) => u !== req.params.unit,
    ),
  }));
  return { ok: true };
});

// Live follow: a new line every second or so until the browser closes it.
socket("/plugin-ws/service-manager/follow", (ws) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  let i = 0;
  ws.onMessage((raw) => {
    let message: { type?: string; data?: unknown };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === "pause") paused = !!message.data;
    if (message.type === "disconnect") ws.close();
    if (message.type !== "connect") return;
    const target = message.data as {
      source: "journal" | "file";
      units?: string[];
      path?: string;
      grep?: string;
      lines?: number;
    };
    ws.send({ type: "started", source: target.source });
    const initial = target.lines ?? 50;
    ws.send({
      type: "lines",
      data:
        target.source === "file"
          ? fileLines(target.path ?? "", initial, target.grep)
          : journal({ units: target.units ?? [], grep: target.grep }, initial),
      dropped: 0,
    });
    timer = setInterval(() => {
      if (paused || ws.closed) return;
      i++;
      const data =
        target.source === "file"
          ? [fileLine(target.path ?? "", i, Date.now())]
          : (() => {
              const names = target.units?.length
                ? target.units
                : Object.keys(MESSAGES);
              const unit = names[i % names.length];
              const list = MESSAGES[unit] ?? [`${unit}: running`];
              return [entry(unit, list[i % list.length], Date.now())];
            })();
      ws.send({ type: "lines", data, dropped: 0 });
    }, 900);
  });
  ws.onClose(() => {
    if (timer) clearInterval(timer);
  });
});
