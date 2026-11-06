import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/network-devices";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const drivers = [
  {
    id: "snmp",
    defaultPort: 161,
    web: false,
    fields: [{ key: "community", type: "secret", required: true }],
    features: {
      portControl: false,
      poe: true,
      reboot: false,
      clients: true,
      neighbors: true,
    },
  },
  {
    id: "routeros",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      portControl: true,
      poe: true,
      reboot: true,
      clients: true,
      neighbors: true,
    },
  },
  {
    id: "opnsense",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "apiKey", type: "text", required: true },
      { key: "apiSecret", type: "secret", required: true },
    ],
    features: {
      portControl: false,
      poe: false,
      reboot: true,
      clients: true,
      neighbors: false,
    },
  },
  {
    id: "openwrt",
    defaultPort: 80,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      portControl: true,
      poe: false,
      reboot: true,
      clients: true,
      neighbors: false,
    },
  },
];

const port = (
  n: number,
  name: string,
  up: boolean,
  extra: Record<string, unknown> = {},
) => ({
  id: String(n),
  name,
  up,
  adminUp: true,
  speedMbps: up ? 1000 : undefined,
  vlan: 1,
  rxBytes: 48_000_000_000 * ((n % 3) + 1),
  txBytes: 12_000_000_000 * ((n % 4) + 1),
  rxErrors: 0,
  txErrors: 0,
  rxBps: up ? 120_000 * n : 0,
  txBps: up ? 40_000 * n : 0,
  ...extra,
});

const traffic = Array.from({ length: 30 }, (_, i) => ({
  at: Date.now() - (30 - i) * 60_000,
  rxBps: 800_000 + Math.round(Math.sin(i / 3) * 300_000),
  txBps: 250_000 + Math.round(Math.cos(i / 4) * 90_000),
}));

interface Device extends Record<string, unknown> {
  id: number;
}

const devices = collection<Device>("network-devices", () => [
  {
    id: 1,
    name: "Core switch",
    driver: "snmp",
    address: "192.168.1.5",
    port: 161,
    options: { snmpVersion: "2c", watchedPorts: ["1"] },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    snapshot: {
      at: ago(0),
      info: {
        name: "sw-core",
        model: "Netgear GS116PE",
        version: "2.6.0.48",
        uptimeSec: 86400 * 41,
        cpu: 6,
        memory: 31,
      },
      ports: [
        port(1, "Uplink", true, { speedMbps: 10000 }),
        port(2, "proxmox", true, { poe: { enabled: false } }),
        port(3, "nas", true),
        port(4, "AP living room", true, {
          poe: { enabled: true, watts: 7.4, delivering: true },
        }),
        port(5, "Camera", true, {
          poe: { enabled: true, watts: 4.1, delivering: true },
        }),
        port(6, "spare", false),
      ],
    },
    traffic,
  },
  {
    id: 2,
    name: "Router",
    driver: "routeros",
    address: "192.168.1.1",
    port: 443,
    options: { scheme: "https" },
    hasCa: false,
    pollSeconds: 30,
    status: "up",
    lastError: null,
    lastSeenAt: ago(0),
    snapshot: {
      at: ago(0),
      info: {
        name: "hap-ax3",
        model: "RouterOS hAP ax3",
        version: "7.16.1",
        uptimeSec: 86400 * 12,
        cpu: 11,
        memory: 44,
      },
      ports: [
        port(1, "ether1-wan", true),
        port(2, "ether2-lan", true),
        port(3, "ether3", false),
      ],
    },
    traffic,
  },
]);

get(`${P}/drivers`, () => ({ drivers }));
get(`${P}/devices`, () => ({ devices: devices.all() }));
post(`${P}/devices`, (req) => ({
  device: devices.insert({
    driver: "snmp",
    port: null,
    options: {},
    hasCa: false,
    pollSeconds: 30,
    lastError: null,
    ...(req.body as object),
    id: devices.nextId(),
    status: "up",
    lastSeenAt: ago(0),
    snapshot: {
      at: ago(0),
      info: { name: "device" },
      ports: [port(1, "port1", true)],
    },
    traffic: [],
  } as Device),
}));
put(`${P}/devices/:id`, (req) => ({
  device: devices.patch(req.params.id, req.body as Partial<Device>),
}));
del(`${P}/devices/:id`, (req) => {
  devices.remove(req.params.id);
  return { ok: true };
});
post(`${P}/devices/test`, () => ({
  info: { name: "sw-core", model: "Netgear GS116PE", version: "2.6.0.48" },
}));
post(`${P}/devices/:id/poll`, (req) => ({
  device: devices.find(req.params.id),
}));
post(`${P}/devices/:id/reboot`, () => ({ ok: true }));
post(`${P}/devices/:id/ports/:port/state`, () => ({ ok: true }));
post(`${P}/devices/:id/ports/:port/poe-cycle`, () => ({ ok: true }));
get(`${P}/devices/:id/clients`, () => ({
  clients: [
    {
      mac: "a8:a1:59:3c:4e:10",
      ip: "192.168.1.20",
      name: "nas",
      port: "3",
      kind: "dhcp",
    },
    {
      mac: "2c:f0:5d:81:6e:3a",
      ip: "192.168.1.40",
      name: "media-server",
      port: "2",
      kind: "dhcp",
    },
    {
      mac: "f4:92:bf:12:34:56",
      ip: "192.168.1.88",
      name: "iphone",
      kind: "wifi",
      signal: -58,
    },
  ],
}));
get(`${P}/devices/:id/neighbors`, () => ({
  neighbors: [
    {
      localPort: "1",
      remoteName: "router",
      remotePort: "ether2-lan",
      remoteAddress: "192.168.1.1",
    },
    {
      localPort: "4",
      remoteName: "ap-living",
      remotePort: "eth0",
      remoteMac: "f4:92:bf:aa:bb:cc",
    },
  ],
}));
post(`${P}/discover`, () => ({
  results: [
    {
      address: "192.168.1.5",
      driver: "snmp",
      name: "sw-core",
      description: "Netgear GS116PE",
      added: true,
    },
    {
      address: "192.168.1.6",
      driver: "snmp",
      name: "sw-garage",
      description: "TP-Link TL-SG108PE",
      added: false,
    },
  ],
}));
