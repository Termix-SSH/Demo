import { del, get, HttpError, patch, post, put } from "../../router";
import { collection } from "../../store";
import { hosts } from "../hosts";
import { DEMO_USER_ID } from "../../../fixtures/hosts";

const P = "/plugin-api/reverse-proxy";

type Kind = "http" | "tcp" | "udp";

interface Route {
  id: number;
  hostId: number;
  userId: string;
  createdAt: string;
  name: string;
  kind: Kind;
  domain: string;
  listenPort: number | null;
  targetHost: string;
  targetPort: number;
  tlsMode: "off" | "acme" | "selfsigned" | "custom";
  certId: number | null;
  authMode: "none" | "user" | "host";
  options: Record<string, unknown>;
  enabled: boolean;
}

interface Cert {
  id: number;
  domains: string[];
  source: "acme" | "selfsigned" | "custom";
  status: "pending" | "ready" | "error";
  error: string | null;
  notAfter: string | null;
  createdAt: string;
}

const days = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

const certs = collection<Cert>("reverse-proxy-certs", () => [
  {
    id: 1,
    domains: ["shop.example.com"],
    source: "acme",
    status: "ready",
    error: null,
    notAfter: days(71),
    createdAt: days(-19),
  },
  {
    id: 2,
    domains: ["grafana.example.com"],
    source: "acme",
    status: "ready",
    error: null,
    notAfter: days(44),
    createdAt: days(-46),
  },
  {
    id: 3,
    domains: ["admin.internal"],
    source: "selfsigned",
    status: "ready",
    error: null,
    notAfter: days(340),
    createdAt: days(-25),
  },
]);

const r = (
  id: number,
  hostId: number,
  input: Partial<Route> & Pick<Route, "name" | "kind" | "targetPort">,
): Route => ({
  id,
  hostId,
  userId: DEMO_USER_ID,
  createdAt: days(-30 + id),
  domain: "",
  listenPort: null,
  targetHost: "",
  tlsMode: "off",
  certId: null,
  authMode: "none",
  options: {},
  enabled: true,
  ...input,
});

const routes = collection<Route>("reverse-proxy-routes", () => [
  r(1, 1, {
    name: "Shop",
    kind: "http",
    domain: "shop.example.com",
    targetPort: 3000,
    tlsMode: "acme",
    certId: 1,
    options: { forceHttps: true, preserveHost: true },
  }),
  r(2, 1, {
    name: "Grafana",
    kind: "http",
    domain: "grafana.example.com",
    targetPort: 3001,
    tlsMode: "acme",
    certId: 2,
    authMode: "user",
    options: { forceHttps: true },
  }),
  r(3, 1, {
    name: "Admin panel",
    kind: "http",
    domain: "admin.internal",
    targetPort: 8080,
    tlsMode: "selfsigned",
    certId: 3,
    authMode: "host",
    options: { forceHttps: true, allowIps: ["10.0.0.0/8"] },
  }),
  r(4, 1, {
    name: "Postgres",
    kind: "tcp",
    listenPort: 15432,
    targetHost: "10.0.12.40",
    targetPort: 5432,
    options: { allowIps: ["10.0.0.0/8"], idleSeconds: 600 },
  }),
  r(5, 1, {
    name: "Game server",
    kind: "udp",
    listenPort: 27015,
    targetPort: 27015,
    enabled: false,
  }),
  r(6, 2, {
    name: "Status page",
    kind: "http",
    domain: "status.example.com",
    targetPort: 8090,
  }),
]);

function hostAddress(id: number): string {
  const found = hosts.find(id) as { ip?: string } | undefined;
  return found?.ip ?? "";
}

function enabledHosts() {
  return hosts
    .all()
    .map((h) => h as typeof h & { pluginSettings?: Record<string, unknown> })
    .filter((h) => {
      const s = h.pluginSettings?.["reverse-proxy"] as
        { enableReverseProxy?: boolean } | undefined;
      return (
        s?.enableReverseProxy === true ||
        routes.all().some((x) => x.hostId === h.id)
      );
    });
}

function runtime(route: Route) {
  if (!route.enabled) return { state: "stopped" as const };
  const seed = route.id * 7919;
  const listening =
    route.kind === "http"
      ? route.tlsMode === "off"
        ? "0.0.0.0:8081"
        : "0.0.0.0:8444"
      : `0.0.0.0:${route.listenPort}/${route.kind}`;
  return {
    state: "running" as const,
    listening,
    connections: (seed % 23) + 1,
    bytesIn: (seed % 900) * 1_048_576 + 12_345,
    bytesOut: (seed % 4100) * 1_048_576 + 98_765,
  };
}

get(`${P}/state`, () => ({
  routes: routes.all().map((route) => ({
    ...route,
    runtime: runtime(route),
    hostName: (hosts.find(route.hostId) as { name?: string } | undefined)?.name,
  })),
  hosts: enabledHosts().map((h) => ({
    id: h.id,
    name: h.name,
    address: hostAddress(h.id),
    enabled: true,
    defaultAccess: "none",
    targetAddress: "",
  })),
  certs: certs.all(),
  ports: {
    http: 8081,
    https: 8444,
    bindHost: "0.0.0.0",
    running: { http: 8081, https: 8444 },
  },
  needsBaseUrl: false,
  needsEmail: false,
}));

// A Let's Encrypt route gets a certificate that is ready a moment later.
function withCert(input: Route): Route {
  if (input.kind !== "http" || input.tlsMode !== "acme" || !input.domain) {
    return input;
  }
  const existing = certs
    .all()
    .find((c) => c.source === "acme" && c.domains.includes(input.domain));
  if (existing) return { ...input, certId: existing.id };
  const cert = certs.insert({
    id: certs.nextId(),
    domains: [input.domain],
    source: "acme",
    status: "pending",
    error: null,
    notAfter: null,
    createdAt: new Date().toISOString(),
  });
  setTimeout(
    () => certs.patch(cert.id, { status: "ready", notAfter: days(90) }),
    2500,
  );
  return { ...input, certId: cert.id };
}

function fromBody(body: unknown) {
  const b = (body ?? {}) as Partial<Route>;
  if (!b.name?.trim()) throw new HttpError(400, { error: "Add a name" });
  if (b.kind === "http" && !b.domain?.trim()) {
    throw new HttpError(400, { error: "Add a domain" });
  }
  return {
    name: b.name.trim(),
    kind: b.kind ?? "http",
    domain: b.domain ?? "",
    listenPort: b.listenPort ?? null,
    targetHost: b.targetHost ?? "",
    targetPort: b.targetPort ?? 80,
    tlsMode: b.tlsMode ?? "off",
    certId: b.certId ?? null,
    authMode: b.authMode ?? "none",
    options: b.options ?? {},
    enabled: b.enabled ?? true,
  };
}

post(`${P}/routes`, (req) => {
  const { hostId } = (req.body ?? {}) as { hostId?: number };
  const created = routes.insert(
    withCert({
      id: routes.nextId(),
      hostId: Number(hostId),
      userId: DEMO_USER_ID,
      createdAt: new Date().toISOString(),
      ...fromBody(req.body),
    }),
  );
  return { route: created };
});
put(`${P}/routes/:id`, (req) => {
  const current = routes.find(req.params.id);
  if (!current) throw new HttpError(404, { error: "Route not found" });
  const next = withCert({ ...current, ...fromBody(req.body) });
  return { route: routes.patch(current.id, next) };
});
patch(`${P}/routes/:id/enabled`, (req) => {
  const { enabled } = (req.body ?? {}) as { enabled?: boolean };
  return { route: routes.patch(req.params.id, { enabled: !!enabled }) };
});
del(`${P}/routes/:id`, (req) => {
  routes.remove(req.params.id);
  return { ok: true };
});

post(`${P}/certs/selfsigned`, (req) => {
  const { domains = [] } = (req.body ?? {}) as { domains?: string[] };
  return {
    cert: certs.insert({
      id: certs.nextId(),
      domains,
      source: "selfsigned",
      status: "ready",
      error: null,
      notAfter: days(365),
      createdAt: new Date().toISOString(),
    }),
  };
});
post(`${P}/certs/upload`, () => ({
  cert: certs.insert({
    id: certs.nextId(),
    domains: ["uploaded.example.com"],
    source: "custom",
    status: "ready",
    error: null,
    notAfter: days(200),
    createdAt: new Date().toISOString(),
  }),
}));
post(`${P}/certs/:id/renew`, async (req) => {
  await new Promise((done) => setTimeout(done, 1200));
  return { cert: certs.patch(req.params.id, { notAfter: days(90) }) };
});
del(`${P}/certs/:id`, (req) => {
  certs.remove(req.params.id);
  return { ok: true };
});
