import { del, get, HttpError, post, put } from "../../router";
import { collection } from "../../store";
import { rawFetch } from "../../fetch";

const P = "/plugin-api/alerts";

type Severity = "info" | "success" | "warning" | "critical";
interface AlertItem {
  id: number;
  source: string;
  category: string;
  severity: Severity;
  title: string;
  body: string | null;
  link: { tab?: string; url?: string } | null;
  context: Record<string, unknown> | null;
  deliveries: Array<{
    channelId: number;
    name: string;
    ok: boolean;
    error?: string;
  }> | null;
  readAt: string | null;
  createdAt: string;
}

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function item(
  id: number,
  source: string,
  category: string,
  severity: Severity,
  title: string,
  body: string,
  minutes: number,
  read = false,
  link: AlertItem["link"] = null,
): AlertItem {
  return {
    id,
    source,
    category,
    severity,
    title,
    body,
    link,
    context: null,
    deliveries:
      severity === "critical"
        ? [{ channelId: 1, name: "Ops Discord", ok: true }]
        : null,
    readAt: read ? ago(minutes - 1) : null,
    createdAt: ago(minutes),
  };
}

const SEED: AlertItem[] = [
  item(
    1,
    "host-metrics",
    "host.disk",
    "warning",
    "nas disk at 81%",
    "/srv/data on nas is above the 80% threshold.",
    7,
  ),
  item(
    2,
    "core",
    "host.status",
    "critical",
    "media-server is offline",
    "No answer to status checks for 5 minutes.",
    18,
    false,
    { tab: "dashboard" },
  ),
  item(
    3,
    "automations",
    "automation.run",
    "success",
    "Nightly backup finished",
    "backup-runner completed in 12m 43s.",
    62,
  ),
  item(
    4,
    "acme-ssl",
    "tls.renewal",
    "info",
    "Certificate renews in 9 days",
    "grafana.home.arpa expires on Oct 17.",
    180,
    true,
  ),
  item(
    5,
    "termix",
    "announcement",
    "info",
    "Termix 26.10.0 is out",
    "Plugins, a new Manage tab, onboarding and more.",
    600,
    true,
    { url: "https://github.com/Termix-SSH/Termix/releases" },
  ),
  item(
    6,
    "host-metrics",
    "host.cpu",
    "warning",
    "db-primary CPU above 90%",
    "Sustained for 10 minutes. Back to 72% now.",
    1440,
    true,
  ),
];
const items = collection<AlertItem>("alerts-items", () => SEED);
const channels = collection("alerts-channels", () => [
  {
    id: 1,
    name: "Ops Discord",
    type: "discord",
    enabled: true,
    createdAt: ago(9000),
    usable: true,
    config: { webhookUrl: "https://discord.com/api/webhooks/demo" },
  },
  {
    id: 2,
    name: "Phone (ntfy)",
    type: "ntfy",
    enabled: true,
    createdAt: ago(8000),
    usable: true,
    config: { server: "https://ntfy.sh", topic: "termix-demo" },
  },
  {
    id: 3,
    name: "On-call email",
    type: "email",
    enabled: false,
    createdAt: ago(7000),
    usable: true,
    config: { to: "oncall@example.com" },
  },
]);
const rules = collection("alerts-rules", () => [
  {
    id: 1,
    name: "Anything critical",
    match: "*",
    minSeverity: "critical",
    channelIds: [1, 2],
    enabled: true,
  },
  {
    id: 2,
    name: "Disk warnings",
    match: "host.disk",
    minSeverity: "warning",
    channelIds: [1],
    enabled: true,
  },
  {
    id: 3,
    name: "Backups",
    match: "automation.*",
    minSeverity: "info",
    channelIds: [3],
    enabled: false,
  },
]);

const unreadCount = () => items.all().filter((i) => !i.readAt).length;

get(`${P}/items`, (req) => {
  let list = [...items.all()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (req.query.unread === "true") list = list.filter((i) => !i.readAt);
  if (req.query.severity)
    list = list.filter((i) => i.severity === req.query.severity);
  if (req.query.source)
    list = list.filter((i) => i.source === req.query.source);
  return {
    items: list.slice(0, Number(req.query.limit) || 100),
    unread: unreadCount(),
  };
});
get(`${P}/unread`, () => ({ count: unreadCount() }));
post(`${P}/items/read`, (req) => {
  const {
    ids,
    all,
    read = true,
  } = req.body as { ids?: number[]; all?: boolean; read?: boolean };
  const stamp = read ? new Date().toISOString() : null;
  let count = 0;
  for (const i of items.all()) {
    if (all || ids?.includes(i.id)) {
      items.patch(i.id, { readAt: stamp });
      count += 1;
    }
  }
  broadcast("unread", { count: unreadCount() });
  return { count };
});
del(`${P}/items/:id`, (req) => {
  items.remove(req.params.id);
  return { success: true };
});
del(`${P}/items`, (req) => {
  const before = items.all().length;
  items.replace(
    req.query.read === "true" ? items.all().filter((i) => !i.readAt) : [],
  );
  return { removed: before - items.all().length };
});
get(`${P}/categories`, () => [
  ...new Map(
    items
      .all()
      .map((i) => [
        `${i.source}:${i.category}`,
        { source: i.source, category: i.category },
      ]),
  ).values(),
]);
get(`${P}/meta`, () => ({
  emailAvailable: true,
  channelTypes: ["webhook", "ntfy", "discord", "email"],
}));
get(`${P}/channels`, () =>
  channels.all().map(({ config: _c, ...rest }) => rest),
);
get(`${P}/channels/:id`, (req) => {
  const found = channels.find(req.params.id);
  if (!found) throw new HttpError(404, { error: "Channel not found" });
  return found;
});
post(`${P}/channels`, (req) => {
  const body = req.body as {
    name: string;
    type: string;
    config: Record<string, unknown>;
    enabled?: boolean;
  };
  const record = {
    id: channels.nextId(),
    enabled: true,
    usable: true,
    createdAt: new Date().toISOString(),
    ...body,
  };
  channels.insert(record as never);
  return record;
});
put(`${P}/channels/:id`, (req) =>
  channels.patch(req.params.id, req.body as never),
);
del(`${P}/channels/:id`, (req) => {
  channels.remove(req.params.id);
  return { success: true };
});
post(`${P}/channels/:id/test`, () => ({ success: true }));
get(`${P}/rules`, () => rules.all());
post(`${P}/rules`, (req) => {
  const record = { id: rules.nextId(), ...(req.body as object) };
  rules.insert(record as never);
  return record;
});
put(`${P}/rules/:id`, (req) => rules.patch(req.params.id, req.body as never));
del(`${P}/rules/:id`, (req) => {
  rules.remove(req.params.id);
  return { success: true };
});

// The live stream: the unread count on connect, then a fresh alert now and
// then so the toaster and badge have something to do.
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
function broadcast(event: string, data: unknown) {
  const chunk = encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
  for (const controller of streams) {
    try {
      controller.enqueue(chunk);
    } catch {
      streams.delete(controller);
    }
  }
}

const LIVE: Array<
  Omit<
    AlertItem,
    "id" | "createdAt" | "readAt" | "context" | "deliveries" | "link"
  >
> = [
  {
    source: "host-metrics",
    category: "host.memory",
    severity: "warning",
    title: "proxmox memory at 88%",
    body: "Three VMs are ballooning. Consider moving one.",
  },
  {
    source: "core",
    category: "host.status",
    severity: "success",
    title: "media-server is back online",
    body: "Answered status checks again after 4 minutes.",
  },
  {
    source: "automations",
    category: "automation.run",
    severity: "success",
    title: "Rotate logs finished",
    body: "Ran on 6 hosts with no errors.",
  },
  {
    source: "tunnels",
    category: "tunnel.status",
    severity: "info",
    title: "Tunnel pihole-dns reconnected",
    body: "Local port 8053 is forwarding again.",
  },
];
let liveIndex = 0;
let liveTimer: ReturnType<typeof setInterval> | null = null;

function pushLive() {
  const next = LIVE[liveIndex % LIVE.length];
  liveIndex += 1;
  const record: AlertItem = {
    ...next,
    id: items.nextId(),
    link: null,
    context: null,
    deliveries: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  items.insert(record);
  broadcast("item", record);
  broadcast("unread", { count: unreadCount() });
}

rawFetch(
  (path) => path === `${P}/stream`,
  async (_path, init) => {
    let own: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        own = controller;
        streams.add(controller);
        controller.enqueue(
          encoder.encode(
            `event: unread\ndata: ${JSON.stringify({ count: unreadCount() })}\n\n`,
          ),
        );
        if (!liveTimer) {
          setTimeout(pushLive, 45_000);
          liveTimer = setInterval(pushLive, 150_000);
        }
      },
      cancel() {
        if (own) streams.delete(own);
      },
    });
    init?.signal?.addEventListener("abort", () => {
      if (own) {
        streams.delete(own);
        try {
          own.close();
        } catch {
          // Already closed.
        }
      }
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  },
);
