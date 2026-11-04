import { get, HttpError, post, put } from "../../router";
import { value } from "../../store";
import { hosts } from "../hosts";

const P = "/plugin-api/wake-on-lan";
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

interface Saved {
  config: Record<string, unknown>;
  status: string;
  openPorts: number[];
  changedAt: string;
}

const CONFIG = {
  lanIp: "",
  netmask: "255.255.255.0",
  description: "",
  linkUrl: "",
  autoOpenLink: false,
  wakeFrom: null,
  wakePort: 9,
  wakeMode: "magic",
  wakeCommand: "",
  wakeTimeout: 120,
  wakeConfirm: false,
  wakeCron: "",
  statusFrom: null,
  ports: "",
  pingCommand: "",
  shutdownMode: "ssh",
  shutdownCommand: "",
  shutdownTimeout: 120,
  shutdownConfirm: true,
  shutdownCron: "",
  commandTarget: "host",
  commandRelay: null,
  solEnabled: false,
  solPort: 8009,
  solUser: "",
};

const devices = value<Record<number, Saved>>("wake-on-lan-devices", () => ({
  8: {
    config: {
      ...CONFIG,
      lanIp: "192.168.1.20",
      description: "Backups and media files",
      linkUrl: "https://nas.lab.local",
      ports: "22,445,5000",
      wakeCron: "0 7 * * 1-5",
      shutdownCron: "0 23 * * *",
    },
    status: "online",
    openPorts: [22, 445, 5000],
    changedAt: ago(130),
  },
  10: {
    config: {
      ...CONFIG,
      lanIp: "192.168.1.40",
      description: "Plex and the arr stack",
      ports: "22,8096",
    },
    status: "offline",
    openPorts: [],
    changedAt: ago(320),
  },
}));

function hostOf(id: number) {
  const record = hosts.find(id) as unknown as
    Record<string, unknown> | undefined;
  if (!record) throw new HttpError(404, { error: "Host not found" });
  return record;
}

function settingsOf(record: Record<string, unknown>) {
  const all = record.pluginSettings as
    Record<string, Record<string, unknown>> | undefined;
  return all?.["wake-on-lan"] ?? {};
}

function saved(id: number): Saved {
  return (
    devices.get()[id] ?? {
      config: { ...CONFIG },
      status: "unknown",
      openPorts: [],
      changedAt: ago(1),
    }
  );
}

function summary(record: Record<string, unknown>) {
  const id = Number(record.id);
  const device = saved(id);
  const config = device.config;
  const mac = String(settingsOf(record).macAddress ?? "");
  return {
    hostId: id,
    name: record.name,
    address: config.lanIp || record.ip,
    folder: record.folder ?? null,
    macAddress: mac,
    description: config.description,
    linkUrl: config.linkUrl,
    autoOpenLink: config.autoOpenLink,
    status: device.status,
    openPorts: device.openPorts,
    statusChangedAt: device.changedAt,
    lastSeenAt: device.status === "online" ? ago(1) : device.changedAt,
    wakeConfirm: config.wakeConfirm,
    shutdownConfirm: config.shutdownConfirm,
    canWake: mac !== "",
    canShutdown: config.shutdownMode !== "none",
    canSleep: config.solEnabled,
    canEdit: true,
  };
}

const enabled = () =>
  (hosts.all() as unknown as Array<Record<string, unknown>>).filter(
    (record) => settingsOf(record).enablePower === true,
  );

function setStatus(id: number, status: string, openPorts: number[]) {
  devices.set({
    ...devices.get(),
    [id]: {
      ...saved(id),
      status,
      openPorts,
      changedAt: new Date().toISOString(),
    },
  });
}

/** Moves a device on a moment later, like a real one answering. */
function settle(id: number, status: string, openPorts: number[]) {
  setTimeout(() => setStatus(id, status, openPorts), 5000);
}

function wake(id: number) {
  hostOf(id);
  setStatus(id, "waking", []);
  const ports = String(saved(id).config.ports)
    .split(",")
    .filter(Boolean)
    .map(Number);
  settle(id, "online", ports);
  return { success: true };
}

get(`${P}/devices`, () => ({
  devices: enabled().map(summary),
  can: { wake: true, shutdown: true, scan: true, server: true },
}));

get(`${P}/status`, () => ({
  statuses: enabled().map((record) => {
    const { hostId, status, openPorts, statusChangedAt, lastSeenAt } =
      summary(record);
    return { hostId, status, openPorts, statusChangedAt, lastSeenAt };
  }),
}));

get(`${P}/devices/:hostId`, (req) => {
  const record = hostOf(Number(req.params.hostId));
  const settings = settingsOf(record);
  return {
    summary: summary(record),
    macAddress: settings.macAddress ?? "",
    broadcastAddress: settings.broadcastAddress ?? "",
    config: saved(Number(record.id)).config,
    secrets: { hasSecureOn: false, hasSolPassword: false },
  };
});

function writeSettings(id: number, patch: Record<string, unknown>) {
  const record = hostOf(id);
  const all = (record.pluginSettings ?? {}) as Record<string, unknown>;
  hosts.patch(id, {
    pluginSettings: {
      ...all,
      "wake-on-lan": { ...settingsOf(record), ...patch },
    },
  } as never);
}

put(`${P}/devices/:hostId`, (req) => {
  const id = Number(req.params.hostId);
  const { macAddress, broadcastAddress, secureOn, solPassword, ...config } =
    req.body as Record<string, unknown>;
  void secureOn;
  void solPassword;
  writeSettings(id, { enablePower: true, macAddress, broadcastAddress });
  devices.set({ ...devices.get(), [id]: { ...saved(id), config } });
  return { success: true };
});

post(`${P}/devices/:hostId/wake`, (req) => wake(Number(req.params.hostId)));
post(`${P}/host/:id/wake`, (req) => wake(Number(req.params.id)));

post(`${P}/devices/:hostId/shutdown`, (req) => {
  const id = Number(req.params.hostId);
  hostOf(id);
  setStatus(id, "stopping", []);
  settle(id, "offline", []);
  return { success: true };
});

post(`${P}/devices/:hostId/sleep`, (req) => {
  const id = Number(req.params.hostId);
  setStatus(id, "stopping", []);
  settle(id, "offline", []);
  return { success: true };
});

post(`${P}/devices/:hostId/test`, () => ({
  ok: true,
  code: 0,
  output: "ok\n",
}));

post(`${P}/scan`, () => ({
  results: [
    {
      ip: "192.168.1.20",
      mac: "a8:a1:59:3c:4e:10",
      name: "nas.lab.local",
      vendor: "Synology",
      match: { hostId: 8, name: "nas", by: "mac", hasMac: true },
    },
    {
      ip: "192.168.1.42",
      mac: "d8:43:ae:bc:03:97",
      name: "desktop.lab.local",
      vendor: "ASUSTek",
      match: null,
    },
    {
      ip: "192.168.1.43",
      mac: "b8:27:eb:12:9a:04",
      name: "",
      vendor: "Raspberry Pi",
      match: null,
    },
  ],
  hint: null,
}));

post(`${P}/scan/attach`, (req) => {
  const { hostId, ip, mac, relayId } = req.body as {
    hostId: number;
    ip: string;
    mac: string;
    relayId: number | null;
  };
  writeSettings(hostId, { enablePower: true, macAddress: mac });
  const device = saved(hostId);
  devices.set({
    ...devices.get(),
    [hostId]: {
      ...device,
      config: { ...device.config, lanIp: ip, wakeFrom: relayId },
    },
  });
  return { success: true };
});

post(`${P}/devices`, () => {
  throw new HttpError(400, {
    error: "Adding hosts is turned off in the demo",
  });
});
