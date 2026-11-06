import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/ip-kvm";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const drivers = [
  {
    id: "pikvm",
    defaultPort: 443,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: true,
      paste: true,
      snapshot: true,
    },
    powerActions: ["on", "graceful-shutdown", "off", "reset"],
  },
  {
    id: "nanokvm",
    defaultPort: 80,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: false,
      paste: false,
      snapshot: false,
    },
    powerActions: ["on", "off", "reset"],
  },
  {
    id: "jetkvm",
    defaultPort: 80,
    fields: [{ key: "password", type: "secret", required: true }],
    features: {
      screen: false,
      browserScreen: true,
      power: false,
      media: false,
      paste: false,
      snapshot: false,
    },
    powerActions: [],
  },
];

interface Device extends Record<string, unknown> {
  id: number;
}

const devices = collection<Device>("ip-kvm-devices", () => [
  {
    id: 1,
    hostId: 8,
    name: "NAS PiKVM",
    driver: "pikvm",
    address: "192.168.1.71",
    port: 443,
    options: { scheme: "https", mac: "a8:a1:59:3c:4e:10" },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    reading: {
      at: ago(0),
      model: "Raspberry Pi 4",
      version: "4.89",
      hostname: "pikvm",
      power: "on",
      width: 1920,
      height: 1080,
      signal: true,
    },
  },
  {
    id: 2,
    hostId: null,
    name: "Workshop NanoKVM",
    driver: "nanokvm",
    address: "192.168.1.72",
    port: 80,
    options: { scheme: "http" },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    reading: { at: ago(0), model: "NanoKVM", version: "1.4.1", power: "off" },
  },
  {
    id: 3,
    hostId: null,
    name: "Lab JetKVM",
    driver: "jetkvm",
    address: "192.168.1.73",
    port: 80,
    options: { scheme: "http" },
    hasCa: false,
    pollSeconds: 60,
    status: "down",
    lastError: "Connection timed out",
    lastSeenAt: ago(60 * 5),
    reading: null,
  },
]);

get(`${P}/drivers`, () => ({ drivers }));
get(`${P}/devices`, () => ({ devices: devices.all() }));
post(`${P}/devices`, (req) => {
  const b = req.body as Partial<Device>;
  const device = devices.insert({
    hostId: null,
    name: "KVM",
    driver: "pikvm",
    address: "",
    port: null,
    options: {},
    hasCa: false,
    pollSeconds: 30,
    lastError: null,
    ...b,
    id: devices.nextId(),
    status: "up",
    lastSeenAt: ago(0),
    reading: { at: ago(0), power: "on", signal: true },
  });
  return { device };
});
put(`${P}/devices/:id`, (req) => ({
  device: devices.patch(req.params.id, req.body as Partial<Device>),
}));
del(`${P}/devices/:id`, (req) => {
  devices.remove(req.params.id);
  return { ok: true };
});
post(`${P}/devices/test`, () => ({
  reading: { at: ago(0), model: "Raspberry Pi 4", power: "on", signal: true },
}));
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
post(`${P}/devices/:id/wake`, () => ({ ok: true }));
post(`${P}/devices/:id/paste`, () => ({ ok: true }));
post(`${P}/devices/:id/session`, () => ({ sd: "" }));
get(`${P}/devices/:id/media`, () => ({
  media: {
    images: [
      {
        id: "debian",
        name: "debian-13.1-amd64-netinst.iso",
        size: 754_000_000,
      },
      { id: "rescue", name: "systemrescue-11.iso", size: 1_100_000_000 },
    ],
    mounted: null,
    cdrom: true,
    fromUrl: true,
  },
}));
post(`${P}/devices/:id/media/mount`, () => ({ ok: true }));
post(`${P}/devices/:id/media/eject`, () => ({ ok: true }));
post(`${P}/devices/:id/media/fetch`, () => ({ ok: true }));
