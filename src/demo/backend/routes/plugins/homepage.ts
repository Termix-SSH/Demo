import { del, get, post, put } from "../../router";
import { collection, value } from "../../store";

const P = "/plugin-api/homepage";
const stamp = new Date(Date.now() - 12 * 864e5).toISOString();

interface Item {
  id: number;
  userId: string;
  typeId: string;
  title: string | null;
  config: string;
  createdAt: string;
  updatedAt: string;
}

type Seed = [
  id: number,
  typeId: string,
  title: string | null,
  config: object,
  x: number,
  y: number,
  w: number,
  h: number,
];

// Positions are in canvas pixels on a 30px grid.
const SEED: Seed[] = [
  [
    1,
    "text_banner",
    null,
    { text: "Homelab", fontSize: "xl", textAlign: "left", fontWeight: "bold" },
    30,
    30,
    390,
    60,
  ],
  [
    2,
    "clock",
    "Local time",
    { showSeconds: false, format: "24h" },
    30,
    120,
    270,
    150,
  ],
  [
    3,
    "host_grid",
    "Servers",
    { hostIds: [1, 2, 3, 7, 8, 9], showIp: true, columns: 3 },
    330,
    120,
    570,
    240,
  ],
  [
    4,
    "ping_status",
    "Services",
    {
      urls: [
        { label: "Grafana", url: "https://grafana.home.arpa" },
        { label: "Home Assistant", url: "http://192.168.1.30:8123" },
        { label: "Jellyfin", url: "http://192.168.1.40:8096" },
        { label: "Paperless", url: "http://192.168.1.33:8000" },
      ],
      refreshInterval: 60,
      showLatency: true,
    },
    930,
    120,
    330,
    240,
  ],
  [
    5,
    "service_grid",
    "Apps",
    {
      services: [
        {
          label: "Proxmox",
          url: "https://192.168.1.10:8006",
          accentColor: "#e57000",
        },
        {
          label: "Pi-hole",
          url: "http://192.168.1.31/admin",
          accentColor: "#96060c",
        },
        {
          label: "Grafana",
          url: "https://grafana.home.arpa",
          accentColor: "#f46800",
        },
        {
          label: "NAS",
          url: "https://192.168.1.20:5001",
          accentColor: "#3b82f6",
        },
        { label: "Router", url: "https://192.168.1.1", accentColor: "#22c55e" },
        {
          label: "Uptime",
          url: "http://172.16.4.11:3001",
          accentColor: "#5cdd8b",
        },
      ],
      columns: 3,
      showLabels: true,
      iconSize: "md",
    },
    30,
    300,
    270,
    270,
  ],
  [
    6,
    "markdown_notes",
    "Notes",
    {
      content:
        "## This week\n\n- [x] Move Jellyfin to the new LXC\n- [ ] Replace the NAS fan\n- [ ] Renew the grafana cert (9 days left)\n\nBackups run at **3am**.",
      renderMarkdown: true,
    },
    330,
    390,
    570,
    210,
  ],
  [
    7,
    "recent_activity",
    "Recent",
    { maxItems: 6, filterTypes: [], showTimestamp: true },
    930,
    390,
    330,
    210,
  ],
  [8, "calendar", null, { startOnMonday: true }, 1290, 120, 300, 270],
  [
    9,
    "rss_feed",
    "Termix releases",
    {
      feedUrl: "https://github.com/Termix-SSH/Termix/releases.atom",
      maxItems: 5,
      showDescription: false,
    },
    1290,
    420,
    300,
    180,
  ],
];

const items = collection<Item>("homepage-items", () =>
  SEED.map(([id, typeId, title, config]) => ({
    id,
    userId: "demo-user",
    typeId,
    title,
    config: JSON.stringify(config),
    createdAt: stamp,
    updatedAt: stamp,
  })),
);
const layout = value("homepage-layout", () => ({
  id: 1,
  userId: "demo-user",
  layout: {
    entries: SEED.map(([itemId, , , , x, y, w, h], zOrder) => ({
      itemId,
      x,
      y,
      w,
      h,
      zOrder,
    })),
    pan: { x: 0, y: 0 },
    zoom: 1,
  },
  updatedAt: stamp,
}));
const links = collection("homepage-links", () =>
  [
    ["Grafana", "https://grafana.home.arpa"],
    ["Proxmox", "https://192.168.1.10:8006"],
    ["Pi-hole", "http://192.168.1.31/admin"],
    ["Termix docs", "https://docs.termix.site"],
  ].map(([label, url], i) => ({
    id: i + 1,
    userId: "demo-user",
    label,
    url,
    order: i,
    createdAt: stamp,
  })),
);

get(`${P}/items`, () => items.all());
post(`${P}/items`, (req) => {
  const body = req.body as {
    typeId: string;
    title?: string | null;
    config?: object;
  };
  const record: Item = {
    id: items.nextId(),
    userId: "demo-user",
    typeId: body.typeId,
    title: body.title ?? null,
    config: JSON.stringify(body.config ?? {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  items.insert(record);
  return record;
});
put(`${P}/items/:id`, (req) => {
  const body = req.body as { title?: string | null; config?: object };
  return items.patch(req.params.id, {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.config !== undefined
      ? { config: JSON.stringify(body.config) }
      : {}),
    updatedAt: new Date().toISOString(),
  });
});
del(`${P}/items/:id`, (req) => {
  items.remove(req.params.id);
  return { success: true };
});
get(`${P}/layout`, () => layout.get());
put(`${P}/layout`, (req) =>
  layout.update((prev) => ({
    ...prev,
    layout: req.body as typeof prev.layout,
    updatedAt: new Date().toISOString(),
  })),
);
get(`${P}/service-links`, () => links.all());
post(`${P}/service-links`, (req) => {
  const body = req.body as { label: string; url: string };
  const record = {
    id: links.nextId(),
    userId: "demo-user",
    order: links.all().length,
    createdAt: new Date().toISOString(),
    ...body,
  };
  links.insert(record);
  return record;
});
del(`${P}/service-links/:id`, (req) => {
  links.remove(req.params.id);
  return { success: true };
});
get(`${P}/ping`, (req) => {
  const url = req.query.url ?? "";
  const down = url.includes("33:8000");
  return {
    ok: !down,
    statusCode: down ? null : 200,
    latencyMs: down ? 0 : 8 + (url.length % 40),
  };
});
get(`${P}/rss`, () => [
  {
    title: "Termix 26.10.0",
    link: "https://github.com/Termix-SSH/Termix/releases",
    pubDate: new Date(Date.now() - 864e5).toISOString(),
    description: "Plugins, the Manage tab, onboarding",
  },
  {
    title: "Termix 2.9.1",
    link: "https://github.com/Termix-SSH/Termix/releases",
    pubDate: new Date(Date.now() - 20 * 864e5).toISOString(),
    description: null,
  },
  {
    title: "Termix 2.9.0",
    link: "https://github.com/Termix-SSH/Termix/releases",
    pubDate: new Date(Date.now() - 35 * 864e5).toISOString(),
    description: null,
  },
]);
get(`${P}/proxy`, () => ({ status: "ok", value: 42 }));
