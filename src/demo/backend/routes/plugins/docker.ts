import { del, get, HttpError, post } from "../../router";
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
