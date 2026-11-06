import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/out-of-band";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const drivers = [
  {
    id: "redfish",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: true,
      eventLog: true,
      boot: true,
      media: true,
      console: false,
    },
    powerActions: ["on", "graceful-shutdown", "off", "cycle", "reset"],
  },
  {
    id: "ipmi",
    defaultPort: 623,
    web: false,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: true,
      eventLog: true,
      boot: true,
      media: false,
      console: true,
    },
    powerActions: ["on", "graceful-shutdown", "off", "cycle", "reset"],
  },
  {
    id: "amt",
    defaultPort: 16992,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: false,
      eventLog: false,
      boot: false,
      media: false,
      console: false,
    },
    powerActions: ["on", "off", "reset"],
  },
];

const sensor = (
  id: string,
  name: string,
  kind: string,
  value: number,
  unit: string,
  state = "ok",
) => ({ id, name, kind, value, unit, state });

const reading = (power: string) => ({
  at: ago(0),
  info: {
    manufacturer: "Dell Inc.",
    model: "PowerEdge R640",
    serial: "7XK2M93",
    biosVersion: "2.19.1",
    bmcVersion: "7.00.00.181",
    hostname: "pve-rack",
  },
  power,
  health: "ok",
  sensors: [
    sensor("t1", "CPU1 Temp", "temperature", 54, "C"),
    sensor("t2", "Inlet Temp", "temperature", 24, "C"),
    sensor("f1", "Fan1A", "fan", 4800, "RPM"),
    sensor("f2", "Fan2A", "fan", 4920, "RPM"),
    sensor("p1", "System Power", "power", 212, "W"),
    sensor("psu1", "PSU1", "psu", 1, "", "ok"),
    sensor("psu2", "PSU2", "psu", 1, "", "ok"),
  ],
});

interface Device extends Record<string, unknown> {
  id: number;
}
const devices = collection<Device>("out-of-band-devices", () => [
  {
    id: 1,
    hostId: 7,
    name: "Rack server iDRAC",
    driver: "redfish",
    address: "192.168.1.90",
    port: 443,
    options: { scheme: "https" },
    hasCa: false,
    pollSeconds: 60,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    reading: reading("on"),
  },
  {
    id: 2,
    hostId: null,
    name: "Old Supermicro",
    driver: "ipmi",
    address: "192.168.1.91",
    port: 623,
    options: {},
    hasCa: false,
    pollSeconds: 120,
    status: "down",
    lastError: "Unable to establish IPMI session",
    lastSeenAt: ago(60 * 3),
    reading: null,
  },
]);

get(`${P}/drivers`, () => ({ drivers }));
get(`${P}/devices`, () => ({ devices: devices.all() }));
post(`${P}/devices`, (req) => ({
  device: devices.insert({
    hostId: null,
    driver: "redfish",
    port: null,
    options: {},
    hasCa: false,
    pollSeconds: 60,
    lastError: null,
    ...(req.body as object),
    id: devices.nextId(),
    status: "up",
    lastSeenAt: ago(0),
    reading: reading("on"),
  } as Device),
}));
put(`${P}/devices/:id`, (req) => ({
  device: devices.patch(req.params.id, req.body as Partial<Device>),
}));
del(`${P}/devices/:id`, (req) => {
  devices.remove(req.params.id);
  return { ok: true };
});
post(`${P}/devices/test`, () => ({ reading: reading("on") }));
post(`${P}/devices/:id/poll`, (req) => ({
  device: devices.find(req.params.id),
}));
post(`${P}/devices/:id/power`, (req) => {
  const action = (req.body as { action?: string }).action;
  const power =
    action === "off" || action === "graceful-shutdown" ? "off" : "on";
  const d = devices.find(req.params.id);
  if (d?.reading) {
    devices.patch(req.params.id, {
      reading: { ...(d.reading as object), power },
    });
  }
  return { ok: true };
});
post(`${P}/devices/:id/boot`, () => ({ ok: true }));
get(`${P}/devices/:id/log`, () => ({
  entries: [
    {
      id: "1",
      at: ago(60 * 2),
      severity: "info",
      message: "Power supply 2 returned to normal state",
    },
    {
      id: "2",
      at: ago(60 * 26),
      severity: "warning",
      message: "Fan redundancy lost",
    },
    {
      id: "3",
      at: ago(60 * 27),
      severity: "info",
      message: "Fan redundancy restored",
    },
  ],
}));
del(`${P}/devices/:id/log`, () => ({ ok: true }));
get(`${P}/devices/:id/media`, () => ({
  slots: [
    { id: "cd", name: "Virtual CD", inserted: false },
    { id: "usb", name: "Virtual USB", inserted: false },
  ],
}));
post(`${P}/devices/:id/media/mount`, () => ({ ok: true }));
post(`${P}/devices/:id/media/eject`, () => ({ ok: true }));
