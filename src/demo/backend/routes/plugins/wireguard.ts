import { del, get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/wireguard";

const now = () => Math.floor(Date.now() / 1000);

interface Iface {
  name: string;
  active: boolean;
  enabled: boolean;
  address: string[];
  listenPort: number;
  publicKey: string;
  endpoint: string;
  dns: string;
  allowedIps: string;
  keepalive: number;
  nat: boolean;
}
interface Client {
  name: string;
  publicKey: string;
  allowedIps: string[];
  enabled: boolean;
  managed: boolean;
  hasConfig: boolean;
  endpoint: string;
  latestHandshake: number;
  rx: number;
  tx: number;
}

const ifaces = value<Iface[]>("wireguard-ifaces", () => [
  {
    name: "wg0",
    active: true,
    enabled: true,
    address: ["10.8.0.1/24"],
    listenPort: 51820,
    publicKey: "7hKq3mG0u3m9b8kX2c1pQ1eVw5fYb8aN4sTzR6dLhEo=",
    endpoint: "vpn.acme.example:51820",
    dns: "10.8.0.1",
    allowedIps: "0.0.0.0/0",
    keepalive: 25,
    nat: true,
  },
  {
    name: "wg-site",
    active: false,
    enabled: true,
    address: ["10.9.0.1/30"],
    listenPort: 51821,
    publicKey: "Zc9aP2r5Lw1sVb7nQ0dXkT3yHf8mUe6iJg4oAtCqRzY=",
    endpoint: "",
    dns: "",
    allowedIps: "10.9.0.0/30",
    keepalive: 25,
    nat: false,
  },
]);

const client = (
  name: string,
  ip: string,
  agoSec: number,
  enabled = true,
): Client => ({
  name,
  publicKey:
    `${name.padEnd(8, "x")}Qw9Lk2mN5bV8cX1zA4sD7fG0hJ3pOiU6yTrEwQ=`.slice(
      0,
      44,
    ),
  allowedIps: [`${ip}/32`],
  enabled,
  managed: true,
  hasConfig: true,
  endpoint: enabled ? "203.0.113.77:49211" : "",
  latestHandshake: enabled ? now() - agoSec : 0,
  rx: 184_000_000,
  tx: 912_000_000,
});

const clients = value<Record<string, Client[]>>("wireguard-clients", () => ({
  wg0: [
    client("laptop", "10.8.0.2", 40),
    client("phone", "10.8.0.3", 3600),
    client("old-tablet", "10.8.0.4", 0, false),
  ],
  "wg-site": [client("branch", "10.9.0.2", 9000)],
}));

const view = (i: Iface) => ({
  ...i,
  clients: (clients.get()[i.name] ?? []).length,
});

get(`${P}/summary`, () => [
  {
    hostId: 9,
    checkedAt: new Date().toISOString(),
    installed: true,
    total: 2,
    up: 1,
    down: 1,
    downNames: ["wg-site"],
    clients: 4,
  },
]);
get(`${P}/:host/status`, () => ({
  root: true,
  os: "Debian GNU/Linux 12",
  packageManager: "apt",
  installed: true,
  version: "wireguard-tools v1.0.20210914",
  init: "systemd",
  ipForward: true,
  firewall: "ufw",
  iptables: true,
}));
post(`${P}/:host/install`, () => ({ ok: true }));
get(`${P}/:host/logs`, () => ({
  text: "wg-quick@wg0.service: Started WireGuard via wg-quick(8) for wg0.\nwg0: peer laptop handshake completed\n",
}));
get(`${P}/:host/interfaces`, () => ifaces.get().map(view));
post(`${P}/:host/interfaces`, (req) => {
  const b = req.body as Partial<Iface> & { address?: string; start?: boolean };
  ifaces.update((l) => [
    ...l,
    {
      name: b.name ?? "wg1",
      active: !!b.start,
      enabled: true,
      address: [b.address ?? "10.10.0.1/24"],
      listenPort: b.listenPort ?? 51822,
      publicKey: "Nn3dR8sT1vB5kQ0wXc7aLm2pYh9fUe4iJg6oZtCqRzA=",
      endpoint: b.endpoint ?? "",
      dns: b.dns ?? "",
      allowedIps: b.allowedIps ?? "0.0.0.0/0",
      keepalive: b.keepalive ?? 25,
      nat: !!b.nat,
    },
  ]);
  return { ok: true };
});

const base = `${P}/:host/interfaces/:iface`;
put(base, (req) => {
  ifaces.update((l) =>
    l.map((i) =>
      i.name === req.params.iface ? { ...i, ...(req.body as object) } : i,
    ),
  );
  return { ok: true };
});
del(base, (req) => {
  ifaces.update((l) => l.filter((i) => i.name !== req.params.iface));
  return { ok: true };
});
post(`${base}/service/:action`, (req) => {
  const active = req.params.action !== "stop";
  ifaces.update((l) =>
    l.map((i) => (i.name === req.params.iface ? { ...i, active } : i)),
  );
  return { ok: true };
});
get(`${base}/config`, (req) => {
  const i = ifaces.get().find((x) => x.name === req.params.iface);
  return {
    text: `[Interface]\nAddress = ${i?.address[0] ?? ""}\nListenPort = ${i?.listenPort ?? 0}\nPrivateKey = __KEEP__\n`,
  };
});
put(`${base}/config`, () => ({ ok: true }));
get(`${base}/clients`, (req) => clients.get()[req.params.iface] ?? []);
post(`${base}/clients`, (req) => {
  const name = (req.body as { name: string }).name;
  clients.update((all) => ({
    ...all,
    [req.params.iface]: [
      ...(all[req.params.iface] ?? []),
      client(name, `10.8.0.${10 + (all[req.params.iface] ?? []).length}`, 0),
    ],
  }));
  return {
    name,
    config: `[Interface]\nPrivateKey = demo\nAddress = 10.8.0.10/32\nDNS = 10.8.0.1\n\n[Peer]\nPublicKey = demo\nEndpoint = vpn.acme.example:51820\nAllowedIPs = 0.0.0.0/0\n`,
  };
});
post(`${base}/clients/:name/state`, (req) => {
  const enabled = !!(req.body as { enabled?: boolean }).enabled;
  clients.update((all) => ({
    ...all,
    [req.params.iface]: (all[req.params.iface] ?? []).map((c) =>
      c.name === decodeURIComponent(req.params.name) ? { ...c, enabled } : c,
    ),
  }));
  return { ok: true };
});
del(`${base}/clients/:name`, (req) => {
  clients.update((all) => ({
    ...all,
    [req.params.iface]: (all[req.params.iface] ?? []).filter(
      (c) => c.name !== decodeURIComponent(req.params.name),
    ),
  }));
  return { ok: true };
});
