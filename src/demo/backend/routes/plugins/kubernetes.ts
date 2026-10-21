import { del, get, HttpError, post } from "../../router";
import { socket } from "../../sockets";
import { value } from "../../store";
import { hosts } from "../hosts";
import { FakeShell } from "../../shell";

const P = "/plugin-api/kubernetes";

type Kind =
  | "pods"
  | "deployments"
  | "statefulsets"
  | "daemonsets"
  | "replicasets"
  | "jobs"
  | "cronjobs"
  | "services"
  | "ingresses"
  | "configmaps"
  | "secrets"
  | "pvcs"
  | "pvs"
  | "nodes"
  | "namespaces"
  | "events";
type Tone = "ok" | "warn" | "error" | "idle";

interface Row {
  kind: Kind;
  name: string;
  namespace?: string;
  created: string;
  status: string;
  tone: Tone;
  fields: Record<string, string | number | null>;
  labels?: Record<string, string>;
  containers?: string[];
  images?: string[];
  replicas?: number;
  suspended?: boolean;
  unschedulable?: boolean;
  keys?: string[];
  capacity?: { cpu: number | null; memory: number | null };
  // Demo only: which workload a pod belongs to.
  owner?: string;
}

const sessions = new Map<string, number>();
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const D = 24 * 60;

const NODES = ["k3s-server", "k3s-agent-1", "k3s-agent-2"];

function pod(
  ns: string,
  name: string,
  owner: string,
  image: string,
  opts: Partial<Row> & { restarts?: number; node?: number } = {},
): Row {
  const { restarts = 0, node = 0, ...rest } = opts;
  const status = rest.status ?? "Running";
  return {
    kind: "pods",
    name,
    namespace: ns,
    created: ago(2 * D + name.length * 37),
    status,
    tone:
      status === "Running" || status === "Completed"
        ? status === "Completed"
          ? "idle"
          : "ok"
        : "error",
    fields: {
      ready: status === "Running" ? "1/1" : "0/1",
      restarts,
      node: NODES[node % NODES.length],
      ip: `10.42.${node}.${10 + ((name.length * 7) % 200)}`,
      owner,
    },
    labels: { app: owner.split("/")[1] ?? owner },
    containers: [owner.split("/")[1] ?? "app"],
    images: [image],
    owner,
    ...rest,
  };
}

function workload(
  kind: Kind,
  ns: string,
  name: string,
  image: string,
  ready: number,
  want: number,
  days: number,
): Row {
  const tone: Tone = ready === want ? "ok" : ready === 0 ? "error" : "warn";
  return {
    kind,
    name,
    namespace: ns,
    created: ago(days * D),
    status:
      ready === want
        ? "Available"
        : ready === 0
          ? "Unavailable"
          : "Progressing",
    tone,
    fields: {
      ready: `${ready}/${want}`,
      upToDate: want,
      available: ready,
      images: image,
    },
    labels: { app: name },
    containers: [name],
    images: [image],
    replicas: want,
  };
}

function seed(): Row[] {
  const rows: Row[] = [
    workload("deployments", "demo", "web", "nginx:1.27-alpine", 2, 2, 12),
    workload(
      "deployments",
      "demo",
      "api",
      "ghcr.io/example/api:3.8.2",
      3,
      3,
      9,
    ),
    workload(
      "deployments",
      "demo",
      "crashy",
      "ghcr.io/example/crashy:0.1.0",
      0,
      1,
      2,
    ),
    workload(
      "deployments",
      "monitoring",
      "grafana",
      "grafana/grafana:11.2.0",
      1,
      1,
      20,
    ),
    workload(
      "deployments",
      "kube-system",
      "coredns",
      "rancher/mirrored-coredns-coredns:1.11.3",
      1,
      1,
      40,
    ),
    workload(
      "deployments",
      "kube-system",
      "metrics-server",
      "rancher/mirrored-metrics-server:v0.7.2",
      1,
      1,
      40,
    ),
    workload(
      "deployments",
      "kube-system",
      "traefik",
      "rancher/mirrored-library-traefik:3.1.2",
      1,
      1,
      40,
    ),
    {
      ...workload(
        "statefulsets",
        "demo",
        "redis",
        "redis:7.4-alpine",
        1,
        1,
        12,
      ),
    },
    {
      ...workload(
        "statefulsets",
        "demo",
        "postgres",
        "postgres:16-alpine",
        1,
        1,
        12,
      ),
    },
    {
      ...workload(
        "daemonsets",
        "monitoring",
        "node-exporter",
        "prom/node-exporter:v1.8.2",
        3,
        3,
        20,
      ),
    },
    pod("demo", "web-7c9f6d8b5-x2kqp", "deployments/web", "nginx:1.27-alpine", {
      node: 1,
    }),
    pod("demo", "web-7c9f6d8b5-m8tzl", "deployments/web", "nginx:1.27-alpine", {
      node: 2,
    }),
    pod(
      "demo",
      "api-5d4b8c7f9-hq4wn",
      "deployments/api",
      "ghcr.io/example/api:3.8.2",
      { node: 1 },
    ),
    pod(
      "demo",
      "api-5d4b8c7f9-p7vrc",
      "deployments/api",
      "ghcr.io/example/api:3.8.2",
      { node: 2 },
    ),
    pod(
      "demo",
      "api-5d4b8c7f9-zz9kd",
      "deployments/api",
      "ghcr.io/example/api:3.8.2",
      { node: 0, restarts: 1 },
    ),
    pod(
      "demo",
      "crashy-6b7d9f5c4-ttr2s",
      "deployments/crashy",
      "ghcr.io/example/crashy:0.1.0",
      { status: "CrashLoopBackOff", restarts: 17, node: 2 },
    ),
    pod("demo", "redis-0", "statefulsets/redis", "redis:7.4-alpine", {
      node: 1,
    }),
    pod("demo", "postgres-0", "statefulsets/postgres", "postgres:16-alpine", {
      node: 2,
    }),
    pod(
      "demo",
      "report-28812345-4jxlm",
      "jobs/report-28812345",
      "busybox:1.36",
      { status: "Completed", node: 1 },
    ),
    pod(
      "monitoring",
      "grafana-84f7c6d9b-2wq8n",
      "deployments/grafana",
      "grafana/grafana:11.2.0",
      { node: 0 },
    ),
    pod(
      "monitoring",
      "node-exporter-4gq2x",
      "daemonsets/node-exporter",
      "prom/node-exporter:v1.8.2",
      { node: 0 },
    ),
    pod(
      "monitoring",
      "node-exporter-8kfvz",
      "daemonsets/node-exporter",
      "prom/node-exporter:v1.8.2",
      { node: 1 },
    ),
    pod(
      "monitoring",
      "node-exporter-r6mzc",
      "daemonsets/node-exporter",
      "prom/node-exporter:v1.8.2",
      { node: 2 },
    ),
    pod(
      "kube-system",
      "coredns-ccb96694c-5lwxs",
      "deployments/coredns",
      "rancher/mirrored-coredns-coredns:1.11.3",
    ),
    pod(
      "kube-system",
      "metrics-server-5985cbc9d7-hb4sv",
      "deployments/metrics-server",
      "rancher/mirrored-metrics-server:v0.7.2",
    ),
    pod(
      "kube-system",
      "traefik-57b79cf995-9c6dl",
      "deployments/traefik",
      "rancher/mirrored-library-traefik:3.1.2",
    ),
    {
      kind: "jobs",
      name: "report-28812345",
      namespace: "demo",
      created: ago(6 * 60),
      status: "Complete",
      tone: "idle",
      fields: { completions: "1/1", duration: 14 },
      containers: ["report"],
      images: ["busybox:1.36"],
    },
    {
      kind: "cronjobs",
      name: "report",
      namespace: "demo",
      created: ago(12 * D),
      status: "Scheduled",
      tone: "ok",
      fields: { schedule: "0 */6 * * *", active: 0, lastSchedule: ago(6 * 60) },
      suspended: false,
    },
    {
      kind: "cronjobs",
      name: "cleanup",
      namespace: "demo",
      created: ago(12 * D),
      status: "Suspended",
      tone: "idle",
      fields: { schedule: "30 3 * * *", active: 0, lastSchedule: ago(4 * D) },
      suspended: true,
    },
  ];
  const svc = (
    ns: string,
    name: string,
    type: string,
    ip: string,
    ports: string,
    ext = "",
  ) => ({
    kind: "services" as const,
    name,
    namespace: ns,
    created: ago(12 * D),
    status: "Active",
    tone: "ok" as const,
    fields: { type, clusterIP: ip, externalIP: ext, ports },
  });
  rows.push(
    svc("demo", "web", "ClusterIP", "10.43.18.201", "80/TCP"),
    svc("demo", "api", "ClusterIP", "10.43.77.12", "8080/TCP"),
    svc("demo", "redis", "ClusterIP", "None", "6379/TCP"),
    svc("demo", "postgres", "ClusterIP", "10.43.5.90", "5432/TCP"),
    svc(
      "kube-system",
      "traefik",
      "LoadBalancer",
      "10.43.120.4",
      "80:31080/TCP,443:31443/TCP",
      "10.0.12.22",
    ),
    svc("monitoring", "grafana", "ClusterIP", "10.43.99.31", "3000/TCP"),
    {
      kind: "ingresses",
      name: "web",
      namespace: "demo",
      created: ago(12 * D),
      status: "Active",
      tone: "ok",
      fields: {
        class: "traefik",
        hosts: "shop.example.com",
        address: "10.0.12.22",
        tls: "yes",
      },
    },
    {
      kind: "ingresses",
      name: "grafana",
      namespace: "monitoring",
      created: ago(20 * D),
      status: "Active",
      tone: "ok",
      fields: {
        class: "traefik",
        hosts: "grafana.example.com",
        address: "10.0.12.22",
        tls: "yes",
      },
    },
    {
      kind: "configmaps",
      name: "web-config",
      namespace: "demo",
      created: ago(12 * D),
      status: "Active",
      tone: "ok",
      fields: { keys: 2 },
      keys: ["nginx.conf", "robots.txt"],
    },
    {
      kind: "configmaps",
      name: "api-settings",
      namespace: "demo",
      created: ago(9 * D),
      status: "Active",
      tone: "ok",
      fields: { keys: 3 },
      keys: ["LOG_LEVEL", "CACHE_TTL", "FEATURE_FLAGS"],
    },
    {
      kind: "secrets",
      name: "api-credentials",
      namespace: "demo",
      created: ago(9 * D),
      status: "Active",
      tone: "ok",
      fields: { type: "Opaque", keys: 2 },
      keys: ["DATABASE_URL", "STRIPE_KEY"],
    },
    {
      kind: "secrets",
      name: "shop-tls",
      namespace: "demo",
      created: ago(19),
      status: "Active",
      tone: "ok",
      fields: { type: "kubernetes.io/tls", keys: 2 },
      keys: ["tls.crt", "tls.key"],
    },
    {
      kind: "pvcs",
      name: "data-postgres-0",
      namespace: "demo",
      created: ago(12 * D),
      status: "Bound",
      tone: "ok",
      fields: {
        capacity: "20Gi",
        access: "RWO",
        storageClass: "local-path",
        volume: "pvc-3a91f0c2",
      },
    },
    {
      kind: "pvcs",
      name: "data-redis-0",
      namespace: "demo",
      created: ago(12 * D),
      status: "Bound",
      tone: "ok",
      fields: {
        capacity: "2Gi",
        access: "RWO",
        storageClass: "local-path",
        volume: "pvc-7be41d08",
      },
    },
    {
      kind: "pvs",
      name: "pvc-3a91f0c2",
      created: ago(12 * D),
      status: "Bound",
      tone: "ok",
      fields: {
        capacity: "20Gi",
        access: "RWO",
        reclaim: "Delete",
        claim: "demo/data-postgres-0",
      },
    },
    {
      kind: "pvs",
      name: "pvc-7be41d08",
      created: ago(12 * D),
      status: "Bound",
      tone: "ok",
      fields: {
        capacity: "2Gi",
        access: "RWO",
        reclaim: "Delete",
        claim: "demo/data-redis-0",
      },
    },
  );
  NODES.forEach((name, i) =>
    rows.push({
      kind: "nodes",
      name,
      created: ago(40 * D),
      status: "Ready",
      tone: "ok",
      fields: {
        roles: i === 0 ? "control-plane,master" : "<none>",
        version: "v1.31.2+k3s1",
        internalIP: `10.0.12.${22 + i}`,
        cpu: 4,
        memory: "7.6 GiB",
      },
      unschedulable: false,
      capacity: { cpu: 4000, memory: 8_160_000_000 },
    }),
  );
  for (const ns of [
    "default",
    "demo",
    "monitoring",
    "kube-system",
    "kube-public",
  ]) {
    rows.push({
      kind: "namespaces",
      name: ns,
      created: ago(40 * D),
      status: "Active",
      tone: "ok",
      fields: {},
    });
  }
  const ev = (
    ns: string,
    reason: string,
    object: string,
    message: string,
    count: number,
    warn = false,
    minutes = 3,
  ): Row => ({
    kind: "events",
    name: `${object.split("/")[1]}.${reason.toLowerCase()}`,
    namespace: ns,
    created: ago(minutes),
    status: warn ? "Warning" : "Normal",
    tone: warn ? "warn" : "ok",
    fields: { reason, object, message, count },
  });
  rows.push(
    ev(
      "demo",
      "BackOff",
      "pod/crashy-6b7d9f5c4-ttr2s",
      "Back-off restarting failed container crashy in pod crashy-6b7d9f5c4-ttr2s",
      82,
      true,
      1,
    ),
    ev(
      "demo",
      "Pulled",
      "pod/crashy-6b7d9f5c4-ttr2s",
      'Container image "ghcr.io/example/crashy:0.1.0" already present on machine',
      17,
      false,
      2,
    ),
    ev(
      "demo",
      "ScalingReplicaSet",
      "deployment/api",
      "Scaled up replica set api-5d4b8c7f9 to 3",
      1,
      false,
      40,
    ),
    ev(
      "demo",
      "SuccessfulCreate",
      "job/report-28812345",
      "Created pod: report-28812345-4jxlm",
      1,
      false,
      360,
    ),
    ev(
      "demo",
      "Completed",
      "job/report-28812345",
      "Job completed",
      1,
      false,
      359,
    ),
    ev(
      "monitoring",
      "Unhealthy",
      "pod/grafana-84f7c6d9b-2wq8n",
      'Readiness probe failed: Get "http://10.42.0.31:3000/api/health": context deadline exceeded',
      2,
      true,
      25,
    ),
  );
  return rows;
}

const cluster = value<Row[]>("kubernetes-cluster", seed);
const histories = value<Record<string, string[]>>("kubernetes-history", () => ({
  "deployments/demo/web": [
    "image nginx:1.25-alpine",
    "image nginx:1.27-alpine",
  ],
  "deployments/demo/api": ["first deploy", "add caching", "bump to 3.8.2"],
}));

function hostFor(sessionId: string): number {
  const id = sessions.get(sessionId);
  if (id === undefined) {
    throw new HttpError(400, {
      error: "SSH session not found. Connect again.",
    });
  }
  return id;
}

function find(kind: string, name: string, ns?: string): Row {
  const row = cluster
    .get()
    .find(
      (r) =>
        r.kind === kind &&
        r.name === name &&
        (!ns || !r.namespace || r.namespace === ns),
    );
  if (!row) throw new HttpError(404, { error: `${kind} "${name}" not found` });
  return row;
}

function patchRow(target: Row, changes: Partial<Row>) {
  cluster.update((rows) =>
    rows.map((r) =>
      r.kind === target.kind &&
      r.name === target.name &&
      r.namespace === target.namespace
        ? {
            ...r,
            ...changes,
            fields: { ...r.fields, ...(changes.fields ?? {}) },
          }
        : r,
    ),
  );
}

function strip(row: Row) {
  const { owner: _o, ...rest } = row;
  return rest;
}

function podsOf(row: Row): Row[] {
  const all = cluster.get().filter((r) => r.kind === "pods");
  if (row.kind === "nodes")
    return all.filter((p) => p.fields.node === row.name);
  if (row.kind === "services") {
    return all.filter(
      (p) => p.namespace === row.namespace && p.owner?.endsWith(`/${row.name}`),
    );
  }
  return all.filter(
    (p) =>
      p.namespace === row.namespace && p.owner === `${row.kind}/${row.name}`,
  );
}

function yamlOf(row: Row): string {
  const kindName: Record<string, string> = {
    pods: "Pod",
    deployments: "Deployment",
    statefulsets: "StatefulSet",
    daemonsets: "DaemonSet",
    replicasets: "ReplicaSet",
    jobs: "Job",
    cronjobs: "CronJob",
    services: "Service",
    ingresses: "Ingress",
    configmaps: "ConfigMap",
    secrets: "Secret",
    pvcs: "PersistentVolumeClaim",
    pvs: "PersistentVolume",
    nodes: "Node",
    namespaces: "Namespace",
    events: "Event",
  };
  const api: Record<string, string> = {
    deployments: "apps/v1",
    statefulsets: "apps/v1",
    daemonsets: "apps/v1",
    replicasets: "apps/v1",
    jobs: "batch/v1",
    cronjobs: "batch/v1",
    ingresses: "networking.k8s.io/v1",
  };
  const head = [
    `apiVersion: ${api[row.kind] ?? "v1"}`,
    `kind: ${kindName[row.kind]}`,
    "metadata:",
    `  name: ${row.name}`,
    ...(row.namespace ? [`  namespace: ${row.namespace}`] : []),
    "  labels:",
    `    app: ${row.labels?.app ?? row.name}`,
    `  creationTimestamp: "${row.created}"`,
  ];
  if (["deployments", "statefulsets", "daemonsets"].includes(row.kind)) {
    return [
      ...head,
      "spec:",
      ...(row.kind === "daemonsets"
        ? []
        : [`  replicas: ${row.replicas ?? 1}`]),
      "  selector:",
      "    matchLabels:",
      `      app: ${row.name}`,
      "  template:",
      "    metadata:",
      "      labels:",
      `        app: ${row.name}`,
      "    spec:",
      "      containers:",
      `        - name: ${row.name}`,
      `          image: ${row.images?.[0] ?? "nginx"}`,
      "          resources:",
      "            requests:",
      "              cpu: 100m",
      "              memory: 128Mi",
      "            limits:",
      "              cpu: 500m",
      "              memory: 256Mi",
      "",
    ].join("\n");
  }
  if (row.kind === "configmaps" || row.kind === "secrets") {
    return [
      ...head,
      ...(row.kind === "secrets" ? [`type: ${row.fields.type}`] : []),
      "data:",
      ...(row.keys ?? []).map(
        (k) => `  ${k}: ${row.kind === "secrets" ? "<hidden>" : "..."}`,
      ),
      "",
    ].join("\n");
  }
  return [...head, "spec: {}", `status:`, `  phase: ${row.status}`, ""].join(
    "\n",
  );
}

function describe(row: Row): string {
  const lines = [
    `Name:         ${row.name}`,
    ...(row.namespace ? [`Namespace:    ${row.namespace}`] : []),
    `Labels:       app=${row.labels?.app ?? row.name}`,
    `Created:      ${new Date(row.created).toUTCString()}`,
    `Status:       ${row.status}`,
  ];
  if (row.images?.length) lines.push(`Image:        ${row.images[0]}`);
  for (const [k, v] of Object.entries(row.fields)) {
    if (v !== null && v !== "" && k !== "owner")
      lines.push(`${(k + ":").padEnd(14)}${v}`);
  }
  const events = cluster
    .get()
    .filter(
      (e) =>
        e.kind === "events" && String(e.fields.object).endsWith(`/${row.name}`),
    );
  lines.push("Events:");
  if (!events.length) lines.push("  <none>");
  for (const e of events)
    lines.push(`  ${e.status}  ${e.fields.reason}  ${e.fields.message}`);
  return lines.join("\n");
}

function logsFor(
  row: Row,
  tail: number,
  timestamps: boolean,
  previous: boolean,
): string {
  const name = row.owner?.split("/")[1] ?? row.name;
  const base: Record<string, string[]> = {
    web: [
      '10.42.0.1 - - "GET / HTTP/1.1" 200 615 "-" "kube-probe/1.31"',
      '10.42.1.7 - - "GET /static/app.js HTTP/1.1" 200 48211 "-" "Mozilla/5.0"',
      '10.42.1.7 - - "GET /api/products HTTP/1.1" 200 1840 "-" "Mozilla/5.0"',
    ],
    api: [
      '{"level":"info","msg":"request","method":"GET","path":"/products","status":200,"ms":12}',
      '{"level":"info","msg":"request","method":"POST","path":"/cart","status":201,"ms":28}',
      '{"level":"info","msg":"cache hit","key":"products:page:1"}',
      '{"level":"warn","msg":"slow query","ms":412,"query":"orders_by_user"}',
    ],
    crashy: [
      "starting crashy 0.1.0",
      "loading config from /etc/crashy/config.yaml",
      "panic: open /etc/crashy/config.yaml: no such file or directory",
      "goroutine 1 [running]:",
      "main.main()",
      "\t/src/main.go:42 +0x1c5",
    ],
    redis: [
      "1:M Ready to accept connections tcp",
      "1:M 100 changes in 300 seconds. Saving...",
      "1:M Background saving terminated with success",
    ],
    postgres: [
      "LOG:  checkpoint starting: time",
      "LOG:  checkpoint complete: wrote 37 buffers (0.2%)",
    ],
  };
  const list = base[name] ?? [`${name} is running`];
  if (previous && name !== "crashy") return "";
  const count = name === "crashy" ? list.length : Math.min(tail || 100, 120);
  const out: string[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const line = list[i % list.length];
    const at = new Date(now - (count - i) * 4100).toISOString();
    out.push(timestamps ? `${at} ${line}` : line);
  }
  return out.join("\n");
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

post(`${P}/ssh/connect`, (req) => {
  const { sessionId, hostId } = req.body as {
    sessionId: string;
    hostId: number;
  };
  sessions.set(sessionId, hostId);
  return {
    success: true,
    message: "SSH connected",
    connectionLogs: [
      {
        type: "info",
        stage: "connect",
        message: `Connecting to ${(hosts.find(hostId) as { ip?: string } | undefined)?.ip ?? "host"}`,
      },
      { type: "success", stage: "auth", message: "Authenticated" },
    ],
  };
});
post(`${P}/ssh/connect-totp`, () => ({ success: true }));
post(`${P}/ssh/connect-browser-sign-in`, () => ({ success: true }));
post(`${P}/ssh/disconnect`, (req) => {
  sessions.delete((req.body as { sessionId: string }).sessionId);
  return { success: true };
});
post(`${P}/ssh/keepalive`, () => ({ success: true, connected: true }));
get(`${P}/ssh/status`, (req) => ({
  success: true,
  connected: sessions.has(req.query.sessionId),
}));

get(`${P}/validate/:sessionId`, (req) => {
  hostFor(req.params.sessionId);
  return {
    available: true,
    flavor: "k3s",
    readOnly: false,
    namespace: "",
    version: { client: "v1.31.2+k3s1", server: "v1.31.2+k3s1" },
    helm: "v3.16.2",
    canRevealSecrets: true,
  };
});
get(`${P}/contexts/:sessionId`, () => ({
  contexts: ["default"],
  current: "default",
}));
get(`${P}/namespaces/:sessionId`, () => ({
  namespaces: cluster
    .get()
    .filter((r) => r.kind === "namespaces")
    .map((r) => r.name),
  restricted: false,
}));

get(`${P}/resources/:sessionId/:kind`, async (req) => {
  hostFor(req.params.sessionId);
  await wait(200);
  const ns = req.query.namespace;
  return cluster
    .get()
    .filter(
      (r) =>
        r.kind === req.params.kind &&
        (!ns || !r.namespace || r.namespace === ns),
    )
    .map(strip);
});
get(`${P}/resources/:sessionId/:kind/:name`, (req) => {
  const row = find(req.params.kind, req.params.name, req.query.namespace);
  const data =
    row.kind === "configmaps"
      ? Object.fromEntries(
          (row.keys ?? []).map((k) => [
            k,
            k === "nginx.conf"
              ? "server {\n  listen 80;\n  location / { root /usr/share/nginx/html; }\n}"
              : k === "LOG_LEVEL"
                ? "info"
                : k === "CACHE_TTL"
                  ? "300"
                  : "checkout_v2=true",
          ]),
        )
      : undefined;
  return {
    summary: strip(row),
    describe: describe(row),
    ...(data ? { data } : {}),
  };
});
get(`${P}/resources/:sessionId/:kind/:name/yaml`, (req) => ({
  yaml: yamlOf(find(req.params.kind, req.params.name, req.query.namespace)),
}));
get(`${P}/resources/:sessionId/:kind/:name/events`, (req) => {
  const row = find(req.params.kind, req.params.name, req.query.namespace);
  const names = new Set([row.name, ...podsOf(row).map((p) => p.name)]);
  return cluster
    .get()
    .filter(
      (e) =>
        e.kind === "events" && names.has(String(e.fields.object).split("/")[1]),
    )
    .map(strip);
});
get(`${P}/resources/:sessionId/:kind/:name/pods`, (req) =>
  podsOf(find(req.params.kind, req.params.name, req.query.namespace)).map(
    strip,
  ),
);
get(`${P}/resources/:sessionId/:kind/:name/history`, (req) => {
  const row = find(req.params.kind, req.params.name, req.query.namespace);
  const key = `${row.kind}/${row.namespace}/${row.name}`;
  const list = histories.get()[key] ?? ["initial"];
  if (req.query.revision) {
    const n = Number(req.query.revision);
    return {
      details: `deployment.apps/${row.name} with revision #${n}\nPod Template:\n  Labels:\tapp=${row.name}\n  Annotations:\tkubernetes.io/change-cause: ${list[n - 1] ?? ""}\n  Containers:\n   ${row.name}:\n    Image:\t${row.images?.[0]}\n`,
    };
  }
  return list.map((changeCause, i) => ({ revision: i + 1, changeCause }));
});
get(`${P}/resources/:sessionId/:kind/:name/logs`, (req) => {
  const row = find(req.params.kind, req.params.name, req.query.namespace);
  const target = row.kind === "pods" ? row : (podsOf(row)[0] ?? row);
  return {
    logs: logsFor(
      target,
      Number(req.query.tail) || 100,
      req.query.timestamps === "true",
      req.query.previous === "true",
    ),
  };
});
del(`${P}/resources/:sessionId/:kind/:name`, (req) => {
  const row = find(req.params.kind, req.params.name, req.query.namespace);
  cluster.update((rows) =>
    rows.filter(
      (r) =>
        r !== row &&
        !(
          r.kind === row.kind &&
          r.name === row.name &&
          r.namespace === row.namespace
        ),
    ),
  );
  // A deleted pod comes back under a new name when a workload owns it.
  if (row.kind === "pods" && row.owner && !row.owner.startsWith("jobs/")) {
    const fresh = {
      ...row,
      name: row.name.replace(
        /-[a-z0-9]{5}$/,
        `-${Math.random().toString(36).slice(2, 7)}`,
      ),
      created: new Date().toISOString(),
      fields: { ...row.fields, restarts: 0 },
    };
    cluster.update((rows) => [...rows, fresh]);
  }
  return {
    success: true,
    output: `${row.kind.replace(/s$/, "")} "${row.name}" deleted`,
  };
});
post(`${P}/resources/:sessionId/:kind/:name/action`, async (req) => {
  const b = req.body as {
    action: string;
    namespace?: string;
    replicas?: number;
    image?: string;
    container?: string;
  };
  const row = find(req.params.kind, req.params.name, b.namespace);
  await wait(700);
  const singular = row.kind.replace(/s$/, "");
  switch (b.action) {
    case "scale": {
      const n = Number(b.replicas ?? 1);
      patchRow(row, {
        replicas: n,
        fields: { ready: `${n}/${n}`, upToDate: n, available: n },
      });
      const pods = podsOf(row);
      if (n > pods.length && pods[0]) {
        const extra = Array.from({ length: n - pods.length }, (_, i) => ({
          ...pods[0],
          name: pods[0].name.replace(
            /-[a-z0-9]{5}$/,
            `-${Math.random().toString(36).slice(2, 7)}`,
          ),
          created: new Date().toISOString(),
          fields: {
            ...pods[0].fields,
            node: NODES[(pods.length + i) % 3],
            restarts: 0,
          },
        }));
        cluster.update((rows) => [...rows, ...extra]);
      } else if (n < pods.length) {
        const drop = new Set(pods.slice(n).map((p) => p.name));
        cluster.update((rows) =>
          rows.filter((r) => !(r.kind === "pods" && drop.has(r.name))),
        );
      }
      return { success: true, output: `${singular}.apps/${row.name} scaled` };
    }
    case "restart":
      return {
        success: true,
        output: `${singular}.apps/${row.name} restarted`,
      };
    case "setImage": {
      const key = `${row.kind}/${row.namespace}/${row.name}`;
      histories.update((h) => ({
        ...h,
        [key]: [...(h[key] ?? ["initial"]), `image ${b.image}`],
      }));
      patchRow(row, {
        images: [String(b.image)],
        fields: { images: String(b.image) },
      });
      return {
        success: true,
        output: `${singular}.apps/${row.name} image updated`,
      };
    }
    case "undo":
      return {
        success: true,
        output: `${singular}.apps/${row.name} rolled back`,
      };
    case "suspend":
    case "resume":
      patchRow(row, {
        suspended: b.action === "suspend",
        status: b.action === "suspend" ? "Suspended" : "Scheduled",
        tone: b.action === "suspend" ? "idle" : "ok",
      });
      return { success: true, output: `cronjob.batch/${row.name} patched` };
    case "trigger":
      return {
        success: true,
        output: `job.batch/${row.name}-manual-${Date.now() % 100000} created`,
      };
    case "cordon":
    case "uncordon":
      patchRow(row, {
        unschedulable: b.action === "cordon",
        status: b.action === "cordon" ? "Ready,SchedulingDisabled" : "Ready",
        tone: b.action === "cordon" ? "warn" : "ok",
      });
      return { success: true, output: `node/${row.name} ${b.action}ed` };
    case "drain":
      patchRow(row, {
        unschedulable: true,
        status: "Ready,SchedulingDisabled",
        tone: "warn",
      });
      return {
        success: true,
        output: `node/${row.name} cordoned\nnode/${row.name} drained`,
      };
  }
  throw new HttpError(400, { error: "Unknown action" });
});

function usage(row: Row) {
  const seed = row.name.length * 53 + row.name.charCodeAt(0);
  const crashing = row.status !== "Running";
  return {
    namespace: row.namespace,
    name: row.name,
    cpu: crashing ? 0 : (seed % 180) + 3 + Math.round(Math.random() * 12),
    memory: crashing ? 0 : ((seed % 220) + 18) * 1_048_576,
  };
}
get(`${P}/metrics/:sessionId/pods`, (req) => ({
  available: true,
  rows: cluster
    .get()
    .filter(
      (r) =>
        r.kind === "pods" &&
        r.status === "Running" &&
        (!req.query.namespace || r.namespace === req.query.namespace),
    )
    .map(usage),
}));
get(`${P}/metrics/:sessionId/nodes`, () => ({
  available: true,
  rows: NODES.map((name, i) => {
    const cpu = [612, 1140, 884][i] + Math.round(Math.random() * 60);
    const memory = [3.1, 4.6, 3.9][i] * 1_073_741_824;
    return {
      name,
      cpu,
      memory,
      cpuPercent: Math.round(cpu / 40),
      memoryPercent: Math.round((memory / 8_160_000_000) * 100),
    };
  }),
}));
get(`${P}/metrics/:sessionId/pods/:name`, (req) => {
  const row = find("pods", req.params.name, req.query.namespace);
  const u = usage(row);
  return {
    available: true,
    rows: (row.containers ?? ["app"]).map((name) => ({
      name,
      cpu: u.cpu,
      memory: u.memory,
    })),
  };
});

function manifestNames(yaml: string): string[] {
  const kinds = [...yaml.matchAll(/^kind:\s*(\w+)/gm)].map((m) =>
    m[1].toLowerCase(),
  );
  const names = [...yaml.matchAll(/^\s{2}name:\s*([\w.-]+)/gm)].map(
    (m) => m[1],
  );
  return kinds.map((k, i) => `${k}/${names[i] ?? "unnamed"}`);
}
post(`${P}/manifests/:sessionId/validate`, async (req) => {
  await wait(500);
  const { yaml = "" } = req.body as { yaml?: string };
  if (!/^kind:/m.test(yaml))
    throw new HttpError(400, { error: "error: no objects passed to apply" });
  return {
    success: true,
    resources: manifestNames(yaml).map(
      (n) => `${n} configured (server dry run)`,
    ),
  };
});
post(`${P}/manifests/:sessionId/diff`, async (req) => {
  await wait(500);
  const { yaml = "" } = req.body as { yaml?: string };
  const name = manifestNames(yaml)[0] ?? "deployment/web";
  const replicas = /replicas:\s*(\d+)/.exec(yaml)?.[1];
  return {
    diff: [
      `diff -u -N /tmp/LIVE-1234/apps.v1.Deployment.demo.${name.split("/")[1]} /tmp/MERGED-1234/apps.v1.Deployment.demo.${name.split("/")[1]}`,
      "--- /tmp/LIVE-1234",
      "+++ /tmp/MERGED-1234",
      "@@ -6,7 +6,7 @@",
      "   generation: 4",
      " spec:",
      "-  replicas: 2",
      `+  replicas: ${replicas ?? 3}`,
      "   selector:",
    ].join("\n"),
  };
});
post(`${P}/manifests/:sessionId/apply`, async (req) => {
  await wait(800);
  const { yaml = "" } = req.body as { yaml?: string };
  const replicas = /replicas:\s*(\d+)/.exec(yaml)?.[1];
  const name = /^\s{2}name:\s*([\w.-]+)/m.exec(yaml)?.[1];
  const ns = /^\s{2}namespace:\s*([\w.-]+)/m.exec(yaml)?.[1] ?? "demo";
  const row = cluster
    .get()
    .find(
      (r) => r.name === name && r.namespace === ns && r.replicas !== undefined,
    );
  if (row && replicas) {
    const n = Number(replicas);
    patchRow(row, {
      replicas: n,
      fields: { ready: `${n}/${n}`, upToDate: n, available: n },
    });
  }
  return {
    success: true,
    resources: manifestNames(yaml).map((n) => `${n} configured`),
  };
});
post(`${P}/secrets/:sessionId/:name/reveal`, (req) => {
  const b = (req.body ?? {}) as { namespace?: string };
  const row = find("secrets", req.params.name, b.namespace);
  const values: Record<string, string> = {
    DATABASE_URL: "postgres://api:demo-password@postgres.demo:5432/shop",
    STRIPE_KEY: "sk_test_demo_not_a_real_key",
    "tls.crt":
      "-----BEGIN CERTIFICATE-----\nMIIDdemo...\n-----END CERTIFICATE-----",
    "tls.key":
      "-----BEGIN PRIVATE KEY-----\nMIIEdemo...\n-----END PRIVATE KEY-----",
  };
  return {
    data: Object.fromEntries(
      (row.keys ?? []).map((k) => [k, values[k] ?? "demo"]),
    ),
  };
});

const helm = value("kubernetes-helm", () => [
  {
    name: "podinfo",
    namespace: "demo",
    revision: 3,
    updated: ago(2 * D),
    status: "deployed",
    chart: "podinfo-6.7.1",
    appVersion: "6.7.1",
  },
  {
    name: "grafana",
    namespace: "monitoring",
    revision: 2,
    updated: ago(20 * D),
    status: "deployed",
    chart: "grafana-8.5.2",
    appVersion: "11.2.0",
  },
  {
    name: "cert-manager",
    namespace: "kube-system",
    revision: 1,
    updated: ago(38 * D),
    status: "deployed",
    chart: "cert-manager-v1.16.1",
    appVersion: "v1.16.1",
  },
]);
get(`${P}/helm/:sessionId`, (req) =>
  helm
    .get()
    .filter((r) => !req.query.namespace || r.namespace === req.query.namespace),
);
get(`${P}/helm/:sessionId/:ns/:name/history`, (req) => {
  const rel = helm.get().find((r) => r.name === req.params.name);
  const total = rel?.revision ?? 1;
  return Array.from({ length: total }, (_, i) => ({
    revision: i + 1,
    updated: ago((total - i) * 3 * D),
    status: i + 1 === total ? "deployed" : "superseded",
    chart: rel?.chart ?? "",
    appVersion: rel?.appVersion ?? "",
    description:
      i === 0
        ? "Install complete"
        : i + 1 === total
          ? "Rollback to 1"
          : "Upgrade complete",
  }));
});
get(`${P}/helm/:sessionId/:ns/:name/values`, (req) => ({
  values:
    req.params.name === "podinfo"
      ? 'replicaCount: 2\nui:\n  color: "#f39044"\n  message: Hello from the Termix demo\nresources:\n  requests:\n    cpu: 50m\n    memory: 64Mi\n'
      : "persistence:\n  enabled: true\n  size: 10Gi\n",
}));
get(`${P}/helm/:sessionId/:ns/:name/manifest`, (req) => ({
  manifest: `---\n# Source: ${req.params.name}/templates/service.yaml\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${req.params.name}\n  namespace: ${req.params.ns}\nspec:\n  type: ClusterIP\n  ports:\n    - port: 9898\n---\n# Source: ${req.params.name}/templates/deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${req.params.name}\n  namespace: ${req.params.ns}\n`,
}));
post(`${P}/helm/:sessionId/:ns/:name/rollback`, async (req) => {
  await wait(900);
  helm.update((list) =>
    list.map((r) =>
      r.name === req.params.name
        ? { ...r, revision: r.revision + 1, updated: new Date().toISOString() }
        : r,
    ),
  );
  return { success: true, output: "Rollback was a success! Happy Helming!" };
});
del(`${P}/helm/:sessionId/:ns/:name`, (req) => {
  helm.update((list) => list.filter((r) => r.name !== req.params.name));
  return { success: true, output: `release "${req.params.name}" uninstalled` };
});

socket("/plugin-ws/kubernetes/console", (ws) => {
  let shell: FakeShell | null = null;
  ws.onMessage((raw) => {
    if (typeof raw !== "string") return;
    const msg = JSON.parse(raw) as { type: string; data?: unknown };
    const data = (msg.data ?? {}) as Record<string, unknown>;
    switch (msg.type) {
      case "connect": {
        const podName = String(data.pod ?? "pod");
        ws.send({
          type: "connected",
          data: { pod: podName, container: data.container },
        });
        shell = new FakeShell(
          { name: podName, ip: "10.42.1.17", username: "root" },
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
