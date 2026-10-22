import { del, get, HttpError, post, put } from "../../router";
import { socket } from "../../sockets";
import { value } from "../../store";
import { hosts } from "../hosts";
import { FakeShell } from "../../shell";
import { DEMO_OFFLINE_HOSTS } from "../../../fixtures/hosts";

const P = "/plugin-api/docker";

interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: "running" | "paused" | "exited";
  ports: string;
  created: string;
  command: string;
  networks: string[];
  mounts: string[];
  labels: Record<string, string>;
  hostId: number;
}

const created = (days: number) =>
  new Date(Date.now() - days * 864e5)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19) + " +0000 UTC";

function c(
  hostId: number,
  id: string,
  name: string,
  image: string,
  state: Container["state"],
  ports: string,
  days: number,
  command: string,
): Container {
  return {
    id,
    name,
    image,
    state,
    status:
      state === "running"
        ? `Up ${days} days`
        : state === "paused"
          ? `Up ${days} days (Paused)`
          : "Exited (0) 9 hours ago",
    ports,
    created: created(days),
    command,
    networks: ["bridge"],
    mounts: name === "postgres" ? ["/srv/pg:/var/lib/postgresql/data"] : [],
    labels: { "com.docker.compose.project": "stack" },
    hostId,
  };
}

const SEED: Container[] = [
  c(
    1,
    "3f2a91c4b7e1",
    "app",
    "ghcr.io/example/app:2.4.1",
    "running",
    "0.0.0.0:3000->3000/tcp",
    3,
    "node server.js",
  ),
  c(
    1,
    "8b1d40fa2c93",
    "postgres",
    "postgres:16-alpine",
    "running",
    "5432/tcp",
    9,
    "docker-entrypoint.sh postgres",
  ),
  c(
    1,
    "c72e5ab8091d",
    "redis",
    "redis:7-alpine",
    "running",
    "6379/tcp",
    9,
    "redis-server",
  ),
  c(
    1,
    "d90f13c6ba47",
    "caddy",
    "caddy:2-alpine",
    "running",
    "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp",
    3,
    "caddy run",
  ),
  c(
    1,
    "77be12f0c3aa",
    "grafana",
    "grafana/grafana:11.2.0",
    "running",
    "0.0.0.0:3001->3000/tcp",
    9,
    "/run.sh",
  ),
  c(
    1,
    "5a4c8e2f1db6",
    "backup-runner",
    "restic/restic:0.17",
    "exited",
    "",
    1,
    "restic backup /data",
  ),
  c(
    1,
    "9e11a0b3cd22",
    "watchtower",
    "containrrr/watchtower:latest",
    "paused",
    "8080/tcp",
    12,
    "/watchtower",
  ),
  c(
    2,
    "1c0de5f7aa10",
    "app",
    "ghcr.io/example/app:2.4.1",
    "running",
    "0.0.0.0:3000->3000/tcp",
    3,
    "node server.js",
  ),
  c(
    2,
    "2b77e9c1d0f4",
    "node-exporter",
    "prom/node-exporter:v1.8.2",
    "running",
    "9100/tcp",
    20,
    "/bin/node_exporter",
  ),
  c(
    10,
    "4d5e6f7a8b9c",
    "plex",
    "plexinc/pms-docker:latest",
    "running",
    "0.0.0.0:32400->32400/tcp",
    30,
    "/init",
  ),
  c(
    10,
    "5e6f7a8b9c0d",
    "sonarr",
    "linuxserver/sonarr:4",
    "running",
    "0.0.0.0:8989->8989/tcp",
    30,
    "/init",
  ),
  c(
    10,
    "6f7a8b9c0d1e",
    "qbittorrent",
    "linuxserver/qbittorrent:5",
    "exited",
    "",
    2,
    "/init",
  ),
  c(
    13,
    "7a8b9c0d1e2f",
    "traefik",
    "traefik:v3.1",
    "running",
    "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp",
    15,
    "traefik",
  ),
  c(
    13,
    "8b9c0d1e2f3a",
    "uptime-kuma",
    "louislam/uptime-kuma:1",
    "running",
    "0.0.0.0:3001->3001/tcp",
    15,
    "node server/server.js",
  ),
];

const containers = value<Container[]>("docker-containers", () => SEED);
const sessions = new Map<string, number>();

const LOGS: Record<string, string[]> = {
  app: [
    "INFO  starting app 2.4.1",
    "INFO  connected to postgres at db-primary:5432",
    "INFO  listening on 0.0.0.0:3000",
    "INFO  GET / 200 12ms",
    "WARN  slow query took 412ms: select * from orders where ...",
    "INFO  GET /api/health 200 2ms",
    "INFO  POST /api/orders 201 88ms",
  ],
  postgres: [
    "LOG:  database system is ready to accept connections",
    "LOG:  autovacuum launcher started",
    "LOG:  checkpoint starting: time",
    "LOG:  checkpoint complete: wrote 214 buffers (1.3%)",
    "WARNING:  connection limit at 80% of max_connections",
  ],
  redis: [
    "Ready to accept connections tcp",
    "Background saving started by pid 41",
    "Background saving terminated with success",
  ],
  caddy: [
    "INFO  serving initial configuration",
    "INFO  certificate obtained successfully",
    "ERROR upstream 10.0.12.22:80 dial tcp: i/o timeout",
    "INFO  upstream 10.0.12.22:80 recovered",
  ],
};

function sessionHost(sessionId: string): number {
  const hostId = sessions.get(sessionId);
  if (hostId === undefined) {
    throw new HttpError(400, {
      error: "SSH session not found or not connected",
      connected: false,
    });
  }
  return hostId;
}

function find(sessionId: string, id: string): Container {
  const hostId = sessionHost(sessionId);
  const container = containers
    .get()
    .find((x) => x.hostId === hostId && (x.id === id || x.name === id));
  if (!container) throw new HttpError(404, { error: "Container not found" });
  return container;
}

function setContainer(id: string, changes: Partial<Container>) {
  containers.update((all) =>
    all.map((x) => (x.id === id ? { ...x, ...changes } : x)),
  );
}

post(`${P}/ssh/connect`, (req) => {
  const { sessionId, hostId } = req.body as {
    sessionId: string;
    hostId: number;
  };
  if (DEMO_OFFLINE_HOSTS.has(hostId)) {
    throw new HttpError(500, {
      error: "connect ETIMEDOUT",
      connectionLogs: [
        { type: "info", stage: "connect", message: "Connecting to host" },
        { type: "error", stage: "connect", message: "Timed out after 30s" },
      ],
    });
  }
  sessions.set(sessionId, hostId);
  return {
    success: true,
    message: "SSH connected",
    connectionLogs: [
      {
        type: "info",
        stage: "connect",
        message: `Connecting to ${hosts.find(hostId)?.ip ?? "host"}`,
      },
      { type: "success", stage: "auth", message: "Authenticated" },
      { type: "success", stage: "docker", message: "Docker is available" },
    ],
  };
});
post(`${P}/ssh/connect-totp`, () => ({ success: true }));
post(`${P}/ssh/connect-browser-sign-in`, () => ({ success: true }));
post(`${P}/ssh/disconnect`, (req) => {
  sessions.delete((req.body as { sessionId: string }).sessionId);
  return { success: true, message: "SSH session disconnected" };
});
post(`${P}/ssh/keepalive`, () => ({ success: true, connected: true }));
get(`${P}/ssh/status`, (req) => ({
  success: true,
  connected: sessions.has(req.query.sessionId),
}));
get(`${P}/validate/:sessionId`, (req) => {
  const hostId = sessionHost(req.params.sessionId);
  const runtime = hosts.find(hostId)?.pluginSettings?.docker?.containerRuntime;
  return runtime === "podman"
    ? { available: true, version: "5.2.2", runtime: "podman" }
    : { available: true, version: "27.3.1", runtime: "docker" };
});
get(`${P}/containers/:sessionId`, (req) => {
  const hostId = sessionHost(req.params.sessionId);
  return containers
    .get()
    .filter((x) => x.hostId === hostId)
    .map(({ hostId: _h, ...rest }) => rest);
});
get(`${P}/containers/:sessionId/:id/logs`, (req) => {
  const container = find(req.params.sessionId, req.params.id);
  const lines = LOGS[container.name] ?? ["INFO  started", "INFO  healthy"];
  const t = Date.now();
  const stamp = req.query.timestamps === "true";
  return {
    success: true,
    logs: lines
      .map((line, i) =>
        stamp
          ? `${new Date(t - (lines.length - i) * 61_000).toISOString()} ${line}`
          : line,
      )
      .join("\n"),
  };
});
get(`${P}/containers/:sessionId/:id/stats`, (req) => {
  const container = find(req.params.sessionId, req.params.id);
  const t = Date.now() / 1000;
  const seed = container.id.charCodeAt(0);
  const cpu =
    container.state === "running"
      ? (2 + 3 * Math.abs(Math.sin(t / 6 + seed))).toFixed(2)
      : "0.00";
  const mem = container.state === "running" ? 40 + (seed % 200) : 0;
  return {
    cpu: `${cpu}%`,
    memoryUsed: `${mem}MiB`,
    memoryLimit: "1.9GiB",
    memoryPercent: `${((mem / 1946) * 100).toFixed(2)}%`,
    netInput: `${(12 + (seed % 40)).toFixed(1)}MB`,
    netOutput: `${(4 + (seed % 20)).toFixed(1)}MB`,
    blockRead: "8.4MB",
    blockWrite: "1.2MB",
    pids: container.state === "running" ? String(4 + (seed % 20)) : "0",
  };
});
get(`${P}/containers/:sessionId/:id`, (req) => {
  const { hostId: _h, ...rest } = find(req.params.sessionId, req.params.id);
  return rest;
});
post(`${P}/containers/:sessionId/:id/:action`, (req) => {
  const container = find(req.params.sessionId, req.params.id);
  const next: Record<string, Partial<Container>> = {
    start: { state: "running", status: "Up Less than a second" },
    restart: { state: "running", status: "Up Less than a second" },
    stop: { state: "exited", status: "Exited (0) Less than a second ago" },
    pause: { state: "paused", status: `${container.status} (Paused)` },
    unpause: {
      state: "running",
      status: container.status.replace(" (Paused)", ""),
    },
  };
  setContainer(container.id, next[req.params.action] ?? {});
  return { success: true, message: `Container ${req.params.action} succeeded` };
});
del(`${P}/containers/:sessionId/:id/remove`, (req) => {
  const container = find(req.params.sessionId, req.params.id);
  containers.update((all) => all.filter((x) => x.id !== container.id));
  return { success: true, message: "Container removed successfully" };
});

type StackState = "running" | "partial" | "stopped" | "paused" | "not-deployed";

interface StackService {
  service: string;
  name: string;
  id: string;
  image: string;
  state: string;
  status: string;
  health: string;
  ports: string;
}

interface Stack {
  hostId: number;
  name: string;
  compose: string;
  env: string;
  services: StackService[];
}

function svc(
  stack: string,
  service: string,
  image: string,
  state: "running" | "exited",
  ports = "",
): StackService {
  return {
    service,
    name: `${stack}-${service}-1`,
    id: Math.random().toString(16).slice(2, 14).padEnd(12, "0"),
    image,
    state,
    status: state === "running" ? "Up 3 days" : "Exited (0) 2 hours ago",
    health: "",
    ports,
  };
}

const STACKS_SEED: Stack[] = [
  {
    hostId: 1,
    name: "web-app",
    compose: `services:
  app:
    image: ghcr.io/example/app:2.4.1
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - postgres
      - redis
  postgres:
    image: postgres:16-alpine
    volumes:
      - /srv/pg:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
`,
    env: "DATABASE_URL=postgres://app@postgres:5432/app\nREDIS_URL=redis://redis:6379\n",
    services: [
      svc(
        "web-app",
        "app",
        "ghcr.io/example/app:2.4.1",
        "running",
        "0.0.0.0:3000->3000/tcp",
      ),
      svc("web-app", "postgres", "postgres:16-alpine", "running", "5432/tcp"),
      svc("web-app", "redis", "redis:7-alpine", "running", "6379/tcp"),
    ],
  },
  {
    hostId: 1,
    name: "monitoring",
    compose: `services:
  grafana:
    image: grafana/grafana:11.2.0
    ports:
      - "3001:3000"
  prometheus:
    image: prom/prometheus:v2.54.1
`,
    env: "",
    services: [
      svc(
        "monitoring",
        "grafana",
        "grafana/grafana:11.2.0",
        "running",
        "0.0.0.0:3001->3000/tcp",
      ),
      svc("monitoring", "prometheus", "prom/prometheus:v2.54.1", "exited"),
    ],
  },
  {
    hostId: 1,
    name: "proxy",
    compose: `services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
`,
    env: "",
    services: [
      svc(
        "proxy",
        "caddy",
        "caddy:2-alpine",
        "running",
        "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp",
      ),
    ],
  },
  {
    hostId: 1,
    name: "backups",
    compose: `services:
  restic:
    image: restic/restic:0.17
    command: backup /data
`,
    env: "",
    services: [svc("backups", "restic", "restic/restic:0.17", "exited")],
  },
];

const stacks = value<Stack[]>("docker-stacks", () => STACKS_SEED);

function declaredServices(compose: string): string[] {
  return [...compose.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((m) => m[1]);
}

function stackSummary(stack: Stack) {
  const running = stack.services.filter((x) => x.state === "running").length;
  const total = stack.services.length;
  const paused = stack.services.some((x) => x.state === "paused");
  const state: StackState =
    total === 0
      ? "not-deployed"
      : paused
        ? "paused"
        : running === total
          ? "running"
          : running === 0
            ? "stopped"
            : "partial";
  return { running, total, state };
}

function findStack(sessionId: string, name: string): Stack {
  const hostId = sessionHost(sessionId);
  const stack = stacks
    .get()
    .find((x) => x.hostId === hostId && x.name === name);
  if (!stack) throw new HttpError(404, { error: "Stack not found" });
  return stack;
}

function setStack(stack: Stack, changes: Partial<Stack>) {
  stacks.update((all) =>
    all.map((x) => (x === stack ? { ...x, ...changes } : x)),
  );
}

get(`${P}/stacks-status`, () => ({ enabled: true }));
get(`${P}/stacks/:sessionId`, (req) => {
  const hostId = sessionHost(req.params.sessionId);
  return {
    root: "/opt/stacks",
    stacks: stacks
      .get()
      .filter((x) => x.hostId === hostId)
      .map((x) => ({
        name: x.name,
        managed: true,
        composeFile: `/opt/stacks/${x.name}/compose.yaml`,
        ...stackSummary(x),
      })),
  };
});
post(`${P}/stacks/:sessionId/validate`, () => ({ valid: true, output: "" }));
post(`${P}/stacks/:sessionId`, (req) => {
  const hostId = sessionHost(req.params.sessionId);
  const body = req.body as { name: string; compose: string; env?: string };
  stacks.update((all) => [
    ...all,
    {
      hostId,
      name: body.name,
      compose: body.compose,
      env: body.env ?? "",
      services: [],
    },
  ]);
  return { success: true, name: body.name };
});
get(`${P}/stacks/:sessionId/:name/logs`, (req) => {
  const stack = findStack(req.params.sessionId, req.params.name);
  const only = req.query.service;
  const t = Date.now();
  const lines = stack.services
    .filter((x) => !only || x.service === only)
    .flatMap((x, i) => [
      `${x.name}  | starting ${x.service}`,
      `${x.name}  | ready (${i + 1})`,
    ]);
  return {
    logs: lines
      .map(
        (line, i) =>
          `${new Date(t - (lines.length - i) * 4_000).toISOString()} ${line}`,
      )
      .join("\n"),
  };
});
get(`${P}/stacks/:sessionId/:name`, (req) => {
  const stack = findStack(req.params.sessionId, req.params.name);
  return {
    name: stack.name,
    managed: true,
    composeFile: `/opt/stacks/${stack.name}/compose.yaml`,
    compose: stack.compose,
    env: stack.env || null,
    declaredServices: declaredServices(stack.compose),
    services: stack.services,
    ...stackSummary(stack),
  };
});
put(`${P}/stacks/:sessionId/:name/:kind`, (req) => {
  const stack = findStack(req.params.sessionId, req.params.name);
  const content = (req.body as { content: string }).content;
  setStack(
    stack,
    req.params.kind === "env" ? { env: content } : { compose: content },
  );
  return { success: true };
});
post(`${P}/stacks/:sessionId/:name/action`, (req) => {
  const stack = findStack(req.params.sessionId, req.params.name);
  const { action, service } = req.body as { action: string; service?: string };
  if (action === "destroy") {
    stacks.update((all) => all.filter((x) => x !== stack));
    return { success: true, output: "" };
  }
  const state =
    action === "stop" ? "exited" : action === "pause" ? "paused" : "running";
  const current =
    stack.services.length > 0
      ? stack.services
      : declaredServices(stack.compose).map((s) =>
          svc(stack.name, s, `${s}:latest`, "exited"),
        );
  const services =
    action === "down"
      ? []
      : current.map((x) =>
          !service || x.service === service
            ? {
                ...x,
                state,
                status:
                  state === "running"
                    ? "Up Less than a second"
                    : state === "paused"
                      ? "Up 3 days (Paused)"
                      : "Exited (0) Less than a second ago",
              }
            : x,
        );
  setStack(stack, { services });
  return { success: true, output: "" };
});

const UPDATE_IMAGES: Record<string, { status: string }> = {
  "ghcr.io/example/app:2.4.1": { status: "update" },
  "grafana/grafana:11.2.0": { status: "update" },
  "caddy:2-alpine": { status: "update" },
  "restic/restic:0.17": { status: "pinned" },
};
const updated = value<string[]>("docker-updated-images", () => []);
get(`${P}/updates/:sessionId`, (req) => {
  const hostId = sessionHost(req.params.sessionId);
  const done = new Set(updated.get());
  const images: Record<string, { status: string }> = {};
  for (const x of containers.get().filter((y) => y.hostId === hostId)) {
    images[x.image] = done.has(x.image)
      ? { status: "current" }
      : (UPDATE_IMAGES[x.image] ?? { status: "current" });
  }
  return { checkedAt: Date.now(), images };
});
post(`${P}/updates/:sessionId/:id`, (req) => {
  const container = find(req.params.sessionId, req.params.id);
  updated.update((all) => [...all, container.image]);
  return { success: true, recreated: true };
});

socket("/plugin-ws/docker/console", (ws) => {
  let shell: FakeShell | null = null;
  ws.onMessage((raw) => {
    if (typeof raw !== "string") return;
    const msg = JSON.parse(raw) as { type: string; data?: unknown };
    const data = (msg.data ?? {}) as Record<string, unknown>;
    switch (msg.type) {
      case "connect": {
        const name = String(
          data.containerName ?? data.containerId ?? "container",
        ).slice(0, 12);
        const shellName = String(data.shell ?? "/bin/sh");
        ws.send({
          type: "connected",
          data: {
            shell: shellName,
            requestedShell: data.shell,
            shellChanged: false,
          },
        });
        shell = new FakeShell(
          { name, ip: "172.17.0.2", username: "root" },
          (out) => ws.send({ type: "output", data: out }),
          { banner: false },
        );
        shell.start();
        break;
      }
      case "input":
        shell?.input(String(msg.data ?? ""));
        break;
      case "resize":
        shell?.resize(Number(data.cols) || 80);
        break;
      case "ping":
        ws.send({ type: "pong" });
        break;
      case "disconnect":
        ws.send({ type: "disconnected", message: "Console session ended" });
        ws.close();
        break;
    }
  });
});
