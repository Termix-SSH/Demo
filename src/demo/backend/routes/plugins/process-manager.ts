import { del, get, HttpError, post } from "../../router";
import { socket } from "../../sockets";
import { value } from "../../store";

const P = "/plugin-api/process-manager";

interface Proc {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  rss: number;
  stat: string;
  nice: number | null;
  threads: number;
  age: number;
  command: string;
  args: string;
}

const proc = (
  pid: number,
  ppid: number,
  user: string,
  cpu: number,
  mem: number,
  command: string,
  args: string,
  extra: Partial<Proc> = {},
): Proc => ({
  pid,
  ppid,
  user,
  cpu,
  mem,
  rss: Math.round(mem * 160_000),
  stat: "S",
  nice: 0,
  threads: 1,
  age: 86_400 + pid * 37,
  command,
  args,
  ...extra,
});

const PROCESSES = value<Proc[]>("process-manager-processes", () => [
  proc(1, 0, "root", 0, 0.2, "systemd", "/sbin/init", { threads: 1 }),
  proc(612, 1, "root", 0.1, 0.4, "sshd", "sshd: /usr/sbin/sshd -D", {
    threads: 1,
  }),
  proc(
    812,
    1,
    "root",
    0,
    0.8,
    "nginx",
    "nginx: master process /usr/sbin/nginx",
    {
      threads: 1,
    },
  ),
  proc(813, 812, "www-data", 12.4, 1.6, "nginx", "nginx: worker process", {
    stat: "R",
    threads: 4,
  }),
  proc(814, 812, "www-data", 3.2, 1.4, "nginx", "nginx: worker process", {
    threads: 4,
  }),
  proc(
    1204,
    1,
    "postgres",
    6.8,
    9.5,
    "postgres",
    "/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main",
    {
      threads: 1,
    },
  ),
  proc(2310, 1, "deploy", 22.5, 4.4, "node", "node /srv/app/server.js", {
    stat: "Rl",
    threads: 11,
    nice: -5,
  }),
  proc(2311, 1, "deploy", 0.8, 2.1, "node", "node /srv/app/worker.js", {
    threads: 7,
  }),
  proc(3188, 612, "deploy", 0, 0.1, "bash", "-bash", { nice: 0 }),
  proc(3920, 1, "deploy", 0, 0, "sh", "[sh] <defunct>", {
    stat: "Z",
    nice: null,
  }),
]);

const LOAD: [number, number, number] = [0.84, 0.62, 0.55];

const DETAIL: Record<number, Partial<Record<string, unknown>>> = {
  812: { unit: "nginx.service" },
  813: { unit: "nginx.service" },
  1204: { unit: "postgresql@16-main.service" },
  2310: { unit: "app.service" },
};

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  user: "deploy",
  root: true,
  psOk: true,
  pm2: true,
  supervisor: true,
  systemd: true,
  canEdit: true,
  readOnly: false,
}));

get(`${P}/:host/processes`, () => {
  const processes = PROCESSES.get();
  return {
    processes: [...processes].sort((a, b) => b.cpu - a.cpu),
    cpus: 4,
    load: LOAD,
    zombies: processes.filter((p) => p.stat.startsWith("Z")).length,
  };
});

get(`${P}/:host/processes/:pid`, (req) => {
  const pid = Number(req.params.pid);
  const found = PROCESSES.get().find((p) => p.pid === pid);
  if (!found) throw new HttpError(400, { error: "That process is gone" });
  return {
    pid,
    cmdline: found.args,
    cwd: found.user === "deploy" ? "/srv/app" : "/",
    exe: `/usr/bin/${found.command}`,
    unit: DETAIL[pid]?.unit ?? "",
    state: found.stat.startsWith("R") ? "R (running)" : "S (sleeping)",
    threads: found.threads,
    rss: found.rss * 1024,
    vsize: found.rss * 4096,
    envKeys: ["PATH", "HOME", "LANG", "NODE_ENV"],
    fdCount: 24,
    limits: ["Max open files 1024 1048576 files"],
    ports:
      found.command === "nginx"
        ? ["tcp LISTEN 0 511 0.0.0.0:80 0.0.0.0:*"]
        : [],
    files:
      found.command === "nginx"
        ? [
            { fd: 5, path: "/var/log/nginx/access.log" },
            { fd: 6, path: "/var/log/nginx/error.log" },
          ]
        : [],
  };
});

post(`${P}/:host/processes/:pid/signal`, (req) => {
  const pid = Number(req.params.pid);
  const body = (req.body ?? {}) as { signal?: string };
  const signal = String(body.signal ?? "TERM");
  if (signal === "TERM" || signal === "KILL") {
    PROCESSES.update((list) => list.filter((p) => p.pid !== pid));
  }
  return { ok: true, output: `Sent ${signal} to ${pid}` };
});

post(`${P}/:host/processes/:pid/renice`, (req) => {
  const pid = Number(req.params.pid);
  const body = (req.body ?? {}) as { nice?: number };
  PROCESSES.update((list) =>
    list.map((p) => (p.pid === pid ? { ...p, nice: Number(body.nice) } : p)),
  );
  return { ok: true, output: "" };
});

interface App {
  manager: "pm2" | "supervisor";
  key: string;
  name: string;
  status: string;
  health: "up" | "down" | "wait";
  pid: number | null;
  cpu: number | null;
  mem: number | null;
  restarts: number | null;
  uptime: number | null;
  detail: string;
}

const APPS = value<App[]>("process-manager-apps", () => [
  {
    manager: "pm2",
    key: "0",
    name: "shop-api",
    status: "online",
    health: "up",
    pid: 2310,
    cpu: 22,
    mem: 120 * 1048576,
    restarts: 2,
    uptime: 345_600,
    detail: "/srv/app/server.js",
  },
  {
    manager: "pm2",
    key: "1",
    name: "shop-worker",
    status: "errored",
    health: "down",
    pid: null,
    cpu: 0,
    mem: 0,
    restarts: 14,
    uptime: null,
    detail: "/srv/app/worker.js",
  },
  {
    manager: "supervisor",
    key: "queue",
    name: "queue",
    status: "running",
    health: "up",
    pid: 2311,
    cpu: null,
    mem: null,
    restarts: null,
    uptime: 86_400,
    detail: "pid 2311, uptime 1 day, 0:00:12",
  },
]);

get(`${P}/:host/apps`, () => ({
  pm2: true,
  supervisor: true,
  apps: APPS.get(),
}));

post(`${P}/:host/apps/:manager/:key/:action`, (req) => {
  const { manager, key, action } = req.params as Record<string, string>;
  APPS.update((apps) =>
    action === "delete"
      ? apps.filter((a) => !(a.manager === manager && a.key === key))
      : apps.map((a) => {
          if (a.manager !== manager || a.key !== key) return a;
          if (action === "stop") {
            return {
              ...a,
              status: "stopped",
              health: "down",
              pid: null,
              uptime: null,
            };
          }
          if (action === "start" || action === "restart") {
            return {
              ...a,
              status: manager === "pm2" ? "online" : "running",
              health: "up",
              uptime: 1,
              restarts:
                a.restarts == null
                  ? null
                  : a.restarts + (action === "restart" ? 1 : 0),
            };
          }
          return a;
        }),
  );
  return { ok: true, output: "" };
});

post(`${P}/:host/supervisor-refresh`, () => ({ ok: true, output: "" }));

const LOG_LINES = [
  "GET /api/products 200 14ms",
  "GET /api/cart 200 9ms",
  "POST /api/checkout 201 82ms",
  "Cache warmed: 128 keys",
  "Slow query (310ms): SELECT * FROM orders WHERE status = 'open'",
  "WARN connection pool is at 80%",
  "GET /health 200 1ms",
  "ERROR payment provider timed out, retrying (1/3)",
];

const logs = (count: number, grep: string) => {
  const lines = Array.from({ length: count }, (_, i) => {
    const at = new Date(Date.now() - (count - i) * 4000)
      .toISOString()
      .slice(0, 19);
    return `${at} ${LOG_LINES[i % LOG_LINES.length]}`;
  });
  const needle = grep.toLowerCase();
  return needle ? lines.filter((l) => l.toLowerCase().includes(needle)) : lines;
};

post(`${P}/:host/logs`, (req) => {
  const body = (req.body ?? {}) as { lines?: number; grep?: string };
  const lines = logs(Math.min(Number(body.lines) || 200, 400), body.grep ?? "");
  return { text: lines.join("\n") + "\n", lines: lines.length + 1 };
});

// Live follow: a new line every second or so until the browser closes it.
socket("/plugin-ws/process-manager/follow", (ws) => {
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
    ws.send({ type: "started" });
    ws.send({ type: "lines", data: logs(40, ""), dropped: 0 });
    timer = setInterval(() => {
      if (paused || ws.closed) return;
      i++;
      ws.send({
        type: "lines",
        data: [
          `${new Date().toISOString().slice(0, 19)} ${LOG_LINES[i % LOG_LINES.length]}`,
        ],
        dropped: 0,
      });
    }, 1100);
  });
  ws.onClose(() => {
    if (timer) clearInterval(timer);
  });
});

interface Watch {
  id: number;
  hostId: number;
  kind: string;
  target: string;
  rule: string;
  threshold: number;
  autoRestart: boolean;
  state: string;
}

const WATCHES = value<Watch[]>("process-manager-watches", () => [
  {
    id: 1,
    hostId: 1,
    kind: "pm2",
    target: "shop-worker",
    rule: "down",
    threshold: 0,
    autoRestart: true,
    state: "down",
  },
  {
    id: 2,
    hostId: 1,
    kind: "process",
    target: "nginx",
    rule: "down",
    threshold: 0,
    autoRestart: false,
    state: "up",
  },
]);

get(`${P}/watches`, () => ({ watches: WATCHES.get() }));
get(`${P}/:host/watches`, () => ({ watches: WATCHES.get(), max: 50 }));

post(`${P}/:host/watches`, (req) => {
  const body = (req.body ?? {}) as Partial<Watch>;
  if (!body.target || !body.kind) {
    throw new HttpError(400, { error: "The target is not valid" });
  }
  WATCHES.update((list) => [
    ...list,
    {
      id: Math.max(0, ...list.map((w) => w.id)) + 1,
      hostId: Number(req.params.host) || 1,
      kind: body.kind ?? "process",
      target: body.target ?? "",
      rule: body.rule ?? "down",
      threshold: Number(body.threshold) || 0,
      autoRestart: body.autoRestart === true,
      state: "up",
    },
  ]);
  return { watches: WATCHES.get(), max: 50 };
});

del(`${P}/:host/watches/:id`, (req) => {
  const id = Number(req.params.id);
  WATCHES.update((list) => list.filter((w) => w.id !== id));
  return { watches: WATCHES.get(), max: 50 };
});
