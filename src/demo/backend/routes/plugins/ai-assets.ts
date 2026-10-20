import { del, get, HttpError, post, put } from "../../router";
import { value } from "../../store";

// The AI plugin's asset inventory: hosts, containers and the outside
// addresses they talk to, with notes the model wrote, a map and impact.

const P = "/plugin-api/ai/assets";
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

type Kind = "host" | "guest" | "container" | "external";
type Importance = "critical" | "high" | "medium" | "low";

interface Seed {
  id: number;
  kind: Kind;
  hostId: number | null;
  name: string;
  ips: string[];
  zone: string | null;
  os: string | null;
  role: string | null;
  importance: Importance | null;
  reason: string | null;
  system: string | null;
  counts?: [number, number, number, number];
  facts?: Record<string, unknown>;
}

const SEEDS: Seed[] = [
  {
    id: 1,
    kind: "host",
    hostId: 1,
    name: "web-01",
    ips: ["10.0.12.21"],
    zone: "dmz",
    os: "Ubuntu 24.04",
    role: "Public web server behind the load balancer",
    importance: "high",
    reason: "Serves the customer site and the API",
    system: "Storefront",
    counts: [6, 14, 5, 3],
    facts: { kernel: "6.8.0-79", docker: "27.3.1", uptimeDays: 23 },
  },
  {
    id: 2,
    kind: "host",
    hostId: 2,
    name: "web-02",
    ips: ["10.0.12.22"],
    zone: "dmz",
    os: "Ubuntu 24.04",
    role: "Second web node, shares load with web-01",
    importance: "high",
    reason: "Half of the storefront traffic",
    system: "Storefront",
    counts: [5, 11, 4, 2],
  },
  {
    id: 3,
    kind: "host",
    hostId: 3,
    name: "db-primary",
    ips: ["10.0.12.40"],
    zone: "internal",
    os: "Debian 12",
    role: "PostgreSQL primary",
    importance: "critical",
    reason: "Every web node and the worker depend on it",
    system: "Storefront",
    counts: [3, 4, 2, 0],
  },
  {
    id: 4,
    kind: "host",
    hostId: 4,
    name: "db-replica",
    ips: ["10.0.12.41"],
    zone: "internal",
    os: "Debian 12",
    role: "PostgreSQL read replica",
    importance: "medium",
    reason: "Reports and failover",
    system: "Storefront",
    counts: [3, 2, 2, 0],
  },
  {
    id: 5,
    kind: "host",
    hostId: 5,
    name: "cache-01",
    ips: ["10.0.12.55"],
    zone: "internal",
    os: "Alpine 3.20",
    role: "Redis cache and queue",
    importance: "high",
    reason: "Sessions and the job queue live here",
    system: "Storefront",
    counts: [2, 6, 1, 1],
  },
  {
    id: 6,
    kind: "host",
    hostId: 6,
    name: "bastion",
    ips: ["10.0.12.2"],
    zone: "dmz",
    os: "Ubuntu 22.04",
    role: "SSH jump host",
    importance: "medium",
    reason: "The only way in from outside",
    system: "Access",
    counts: [2, 3, 1, 0],
  },
  {
    id: 7,
    kind: "guest",
    hostId: 7,
    name: "proxmox",
    ips: ["192.168.1.10"],
    zone: "internal",
    os: "Proxmox VE 8.3",
    role: "Hypervisor for the homelab",
    importance: "high",
    reason: "Runs the nas and pihole guests",
    system: "Homelab",
    counts: [4, 9, 3, 0],
  },
  {
    id: 8,
    kind: "host",
    hostId: 9,
    name: "pihole",
    ips: ["192.168.1.31"],
    zone: "internal",
    os: "Debian 12",
    role: "DNS and ad blocking",
    importance: "medium",
    reason: "Every device on the network resolves through it",
    system: "Homelab",
    counts: [3, 5, 2, 0],
  },
  {
    id: 9,
    kind: "container",
    hostId: 1,
    name: "app",
    ips: ["172.18.0.2"],
    zone: "internal",
    os: null,
    role: "The storefront application",
    importance: "high",
    reason: "Takes the web traffic",
    system: "Storefront",
  },
  {
    id: 10,
    kind: "container",
    hostId: 1,
    name: "caddy",
    ips: ["172.18.0.3"],
    zone: "internal",
    os: null,
    role: "Reverse proxy and TLS",
    importance: "high",
    reason: "All traffic enters through it",
    system: "Storefront",
  },
  {
    id: 11,
    kind: "container",
    hostId: 1,
    name: "grafana",
    ips: ["172.18.0.5"],
    zone: "internal",
    os: null,
    role: "Dashboards",
    importance: "low",
    reason: "Only the team looks at it",
    system: "Monitoring",
  },
  {
    id: 12,
    kind: "external",
    hostId: null,
    name: "api.stripe.com",
    ips: ["52.4.17.9"],
    zone: "external",
    os: null,
    role: "Payment provider",
    importance: null,
    reason: null,
    system: null,
  },
  {
    id: 13,
    kind: "external",
    hostId: null,
    name: "registry.npmjs.org",
    ips: ["104.16.2.35"],
    zone: "external",
    os: null,
    role: null,
    importance: null,
    reason: null,
    system: null,
  },
];

type EdgeType = "runs_on" | "depends_on" | "connects_to";
const EDGES: Array<[number, number, EdgeType, string]> = [
  [9, 1, "runs_on", "Docker container on web-01"],
  [10, 1, "runs_on", "Docker container on web-01"],
  [11, 1, "runs_on", "Docker container on web-01"],
  [8, 7, "runs_on", "Proxmox guest on proxmox"],
  [10, 9, "depends_on", "caddy proxies to app on port 3000"],
  [9, 3, "depends_on", "app connects to 10.0.12.40:5432"],
  [9, 5, "depends_on", "app connects to 10.0.12.55:6379"],
  [2, 3, "depends_on", "Listening 5432 reached from 10.0.12.22"],
  [2, 5, "depends_on", "Connects to 10.0.12.55:6379"],
  [4, 3, "depends_on", "Streaming replication from 10.0.12.40"],
  [1, 3, "depends_on", "Connects to 10.0.12.40:5432"],
  [1, 12, "connects_to", "Outbound 443 to 52.4.17.9"],
  [2, 12, "connects_to", "Outbound 443 to 52.4.17.9"],
  [1, 13, "connects_to", "Outbound 443 to 104.16.2.35"],
  [6, 1, "connects_to", "SSH from the bastion"],
  [6, 2, "connects_to", "SSH from the bastion"],
];

type Source = "ai" | "user" | null;
interface Row extends Seed {
  roleSource: Source;
  importanceSource: Source;
  systemSource: Source;
}

const assets = value<Row[]>("ai-assets", () =>
  SEEDS.map((seed) => ({
    ...seed,
    roleSource: seed.role ? ("ai" as const) : null,
    importanceSource: seed.importance ? ("ai" as const) : null,
    systemSource: seed.system ? ("ai" as const) : null,
  })),
);

type Asset = ReturnType<typeof assets.get>[number];

const keyOf = (a: Asset) =>
  a.kind === "external"
    ? `external:${a.name}`
    : `${a.kind}:${a.hostId}:${a.name}`;

function item(a: Asset) {
  const counts = a.counts ?? [0, 0, 0, 0];
  return {
    id: a.id,
    key: keyOf(a),
    kind: a.kind,
    hostId: a.hostId,
    name: a.name,
    ips: a.ips,
    zone: a.zone,
    zoneSource: a.zone ? ("rule" as const) : null,
    multiZone: a.id === 6,
    collectedAt: ago(75),
    removedAt: null,
    os: a.os,
    role: a.role,
    roleSource: a.roleSource,
    importance: a.importance,
    importanceSource: a.importanceSource,
    importanceReason: a.reason,
    system: a.system,
    systemSource: a.systemSource,
    annotatedAt: a.role ? ago(70) : null,
    counts: {
      listening: counts[0],
      outbound: counts[1],
      services: counts[2],
      containers: counts[3],
    },
  };
}

const peerOf = (id: number) => {
  const a = assets.get().find((x) => x.id === id)!;
  return { id: a.id, key: keyOf(a), kind: a.kind, name: a.name };
};

function edge(index: number) {
  const [from, to, type, evidence] = EDGES[index];
  return {
    id: index + 1,
    fromAsset: from,
    toAsset: to,
    type,
    detail: null,
    evidence,
    source: type === "runs_on" ? "docker" : "ss",
    firstSeen: ago(60 * 24 * 9),
    lastSeen: ago(75),
  };
}

get(P, (req) => {
  const q = (req.query.q ?? "").toLowerCase();
  const list = assets
    .get()
    .filter(
      (a) =>
        (!q || a.name.toLowerCase().includes(q) || a.ips.join().includes(q)) &&
        (!req.query.zone || a.zone === req.query.zone) &&
        (!req.query.kind || a.kind === req.query.kind),
    )
    .map(item);
  return { assets: list };
});

get(`${P}/zones`, () => ({
  zones: [
    {
      id: 1,
      name: "Production",
      kind: "dmz",
      cidr: "10.0.12.0/24",
      priority: 10,
    },
    {
      id: 2,
      name: "Homelab",
      kind: "internal",
      cidr: "192.168.1.0/24",
      priority: 20,
    },
  ],
  builtin: ["internal", "dmz", "external", "cloud", "overlay"],
}));
post(`${P}/zones`, () => ({ success: true }));
put(`${P}/zones/:id`, () => ({ success: true }));
del(`${P}/zones/:id`, () => ({ success: true }));

get(`${P}/runs`, () => ({
  runs: [
    {
      id: 3,
      kind: "collect",
      trigger: "schedule",
      startedAt: ago(75),
      finishedAt: ago(74),
      status: "done",
      hostsTotal: 9,
      hostsOk: 9,
      hostsFailed: 0,
      errorSummary: null,
      tokens: 0,
    },
  ],
  running: false,
}));
get(`${P}/annotation-runs`, () => ({
  runs: [
    {
      id: 2,
      kind: "annotate",
      trigger: "collection",
      startedAt: ago(73),
      finishedAt: ago(70),
      status: "done",
      hostsTotal: 13,
      hostsOk: 13,
      hostsFailed: 0,
      errorSummary: null,
      tokens: 18240,
    },
  ],
  running: false,
}));
post(`${P}/collect`, () => ({ status: "started" }));
post(`${P}/annotate`, () => ({ status: "started" }));

const settings = value("ai-assets-settings", () => ({
  dailyEnabled: true,
  dailyTime: "03:30",
  collectorSet: true,
  collectorIsMe: true,
  annotateAfterCollect: true,
  annotateProviderId: null as number | null,
  annotateModel: null as string | null,
  annotateProviders: [
    { id: 1, label: "Anthropic", defaultModel: "claude-sonnet-5-5" },
  ],
}));
get(`${P}/settings`, () => ({ settings: settings.get() }));
put(`${P}/settings`, (req) => ({
  settings: settings.update((prev) => ({ ...prev, ...(req.body as object) })),
}));

get(`${P}/graph`, (req) => {
  const types = (req.query.types ?? "runs_on,depends_on,connects_to").split(
    ",",
  );
  const withContainers = req.query.containers === "1";
  const withExternal = req.query.external === "1";
  const visible = assets.get().filter((a) => {
    if (a.kind === "container") return withContainers;
    if (a.kind === "external") return withExternal;
    return true;
  });
  const ids = new Set(visible.map((a) => a.id));
  const nodes = visible.map((a) => ({
    id: a.id,
    key: keyOf(a),
    kind: a.kind,
    name: a.name,
    zone: a.zone,
    multiZone: a.id === 6,
    role: a.role,
    importance: a.importance,
    system: a.system,
    containers: a.kind === "host" ? (a.counts?.[3] ?? 0) : 0,
  }));
  const edges = EDGES.map((e, i) => ({
    key: `e${i}`,
    from: e[0],
    to: e[1],
    type: e[2],
    source: e[2] === "runs_on" ? "docker" : "ss",
    stale: false,
  })).filter((e) => types.includes(e.type) && ids.has(e.from) && ids.has(e.to));
  return { nodes, edges };
});

get(`${P}/exposure`, () => ({
  entries: [],
  truncated: false,
  collectedAt: ago(75),
}));

get(`${P}/:id/impact`, (req) => {
  const root = Number(req.params.id);
  const strong = new Set<EdgeType>(["runs_on", "depends_on"]);
  const seen = new Map<number, { depth: number; via: number; weak: boolean }>();
  const queue: Array<{ id: number; depth: number }> = [{ id: root, depth: 0 }];
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    for (const [i, [from, to, type]] of EDGES.entries()) {
      if (to !== id || seen.has(from) || from === root) continue;
      seen.set(from, { depth: depth + 1, via: i, weak: !strong.has(type) });
      queue.push({ id: from, depth: depth + 1 });
    }
  }
  const make = (id: number) => {
    const a = assets.get().find((x) => x.id === id)!;
    const info = seen.get(id)!;
    const [from, to, type] = EDGES[info.via];
    return {
      asset: {
        id: a.id,
        key: keyOf(a),
        kind: a.kind,
        name: a.name,
        zone: a.zone,
        role: a.role,
        importance: a.importance,
      },
      depth: info.depth,
      path: [{ from, to, type, source: "ss" }],
    };
  };
  const all = [...seen.keys()];
  const strongIds = all.filter((id) => !seen.get(id)!.weak);
  const weakIds = all.filter((id) => seen.get(id)!.weak);
  const count = (ids: number[]) => {
    const out = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    for (const id of ids) {
      const a = assets.get().find((x) => x.id === id)!;
      out[a.importance ?? "unknown"] += 1;
    }
    return out;
  };
  const target = assets.get().find((x) => x.id === root);
  if (!target) throw new HttpError(404, { error: "Asset not found" });
  return {
    asset: { id: root, key: keyOf(target), name: target.name },
    direct: strongIds.filter((id) => seen.get(id)!.depth === 1).map(make),
    transitive: strongIds.filter((id) => seen.get(id)!.depth > 1).map(make),
    weak: weakIds.map(make),
    counts: { strong: count(strongIds), weak: count(weakIds) },
    truncated: false,
  };
});

get(`${P}/:id`, (req) => {
  const found = assets.get().find((a) => a.id === Number(req.params.id));
  if (!found) throw new HttpError(404, { error: "Asset not found" });
  const out = EDGES.flatMap((e, i) => (e[0] === found.id ? [i] : []));
  const incoming = EDGES.flatMap((e, i) => (e[1] === found.id ? [i] : []));
  const base = item(found);
  const { os: _os, counts: _counts, ...rest } = base;
  return {
    asset: { ...rest, facts: found.facts ?? null },
    outgoing: out.map((i) => ({ ...edge(i), peer: peerOf(EDGES[i][1]) })),
    incoming: incoming.map((i) => ({ ...edge(i), peer: peerOf(EDGES[i][0]) })),
  };
});

put(`${P}/:id/zone`, (req) => {
  const zone = (req.body as { zone: string | null }).zone;
  assets.update((all) =>
    all.map((a) => (a.id === Number(req.params.id) ? { ...a, zone } : a)),
  );
  return { success: true };
});
put(`${P}/:id/annotation`, (req) => {
  const changes = req.body as Partial<Asset> & { importanceReason?: string };
  assets.update((all) =>
    all.map((a) =>
      a.id === Number(req.params.id)
        ? {
            ...a,
            ...(changes.role !== undefined && {
              role: changes.role,
              roleSource: "user" as const,
            }),
            ...(changes.importance !== undefined && {
              importance: changes.importance,
              importanceSource: "user" as const,
            }),
            ...(changes.system !== undefined && {
              system: changes.system,
              systemSource: "user" as const,
            }),
          }
        : a,
    ),
  );
  return { success: true };
});
del(`${P}/:id/annotation/:field`, (req) => {
  const field = `${req.params.field}Source`;
  assets.update((all) =>
    all.map((a) =>
      a.id === Number(req.params.id) ? { ...a, [field]: "ai" } : a,
    ),
  );
  return { success: true };
});
