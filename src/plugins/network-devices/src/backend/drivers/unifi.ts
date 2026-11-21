import type {
  ClientInfo,
  DeviceInfo,
  NeighborInfo,
  PortInfo,
} from "../../shared/types.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";
import { asArray, baseUrl, int, optional, str } from "./web.js";

/**
 * A UniFi Network application: on UniFi OS (a UDM, Cloud Key or UniFi OS
 * Server) or a self-hosted controller. The ports, clients and neighbors are
 * those of every switch and gateway the site has adopted.
 */
const TIMEOUT_MS = 15_000;
const SITE = /^[A-Za-z0-9_-]{1,64}$/;

interface Session {
  prefix: string;
  headers: Record<string, string>;
}

function site(target: Target): string {
  const value = target.options.site?.trim() || "default";
  if (!SITE.test(value)) throw new DriverError("The site name is not valid");
  return value;
}

async function call(
  target: Target,
  io: DriverIo,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown },
): Promise<Response> {
  try {
    return await io.fetch(url, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: TIMEOUT_MS,
      allowPrivateHosts: [target.address.replace(/^\[|\]$/g, "")],
      tls: target.ca ? { ca: target.ca } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DriverError(`Could not reach the controller: ${message}`);
  }
}

/** "name=value" pairs from the Set-Cookie headers. */
export function cookiesOf(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const list =
    headers.getSetCookie?.() ??
    (headers.get("set-cookie") ?? "").split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  return list
    .map((cookie) => cookie.split(";")[0].trim())
    .filter((pair) => pair.includes("="))
    .join("; ");
}

/** Signs in, trying UniFi OS first and the classic controller after. */
async function login(target: Target, io: DriverIo): Promise<Session> {
  const base = baseUrl(target);
  const apiKey = target.credentials.apiKey;
  if (apiKey) {
    return { prefix: "/proxy/network", headers: { "x-api-key": apiKey } };
  }
  const body = {
    username: target.credentials.username ?? "",
    password: target.credentials.password ?? "",
  };
  const os = await call(target, io, `${base}/api/auth/login`, {
    method: "POST",
    body: { ...body, rememberMe: false },
  });
  if (os.ok) {
    const csrf = os.headers.get("x-csrf-token");
    return {
      prefix: "/proxy/network",
      headers: {
        cookie: cookiesOf(os),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
    };
  }
  if (os.status === 401 || os.status === 403) {
    throw new DriverError("The controller refused the login", os.status);
  }
  const classic = await call(target, io, `${base}/api/login`, {
    method: "POST",
    body,
  });
  if (!classic.ok) {
    throw new DriverError(
      classic.status === 400 || classic.status === 401
        ? "The controller refused the login"
        : `The controller answered ${classic.status}`,
      classic.status,
    );
  }
  const cookie = cookiesOf(classic);
  const csrf = /csrf_token=([^;]+)/.exec(cookie)?.[1];
  return {
    prefix: "",
    headers: { cookie, ...(csrf ? { "x-csrf-token": csrf } : {}) },
  };
}

async function api(
  target: Target,
  io: DriverIo,
  session: Session,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Record<string, unknown>[]> {
  const response = await call(
    target,
    io,
    `${baseUrl(target)}${session.prefix}/api/s/${site(target)}${path}`,
    { ...init, headers: session.headers },
  );
  if (!response.ok) {
    throw new DriverError(
      response.status === 401 || response.status === 403
        ? "The controller refused the login"
        : `The controller answered ${response.status}`,
      response.status,
    );
  }
  const json = (await response.json()) as {
    meta?: { rc?: string; msg?: string };
    data?: unknown;
  };
  if (json.meta?.rc && json.meta.rc !== "ok") {
    throw new DriverError(`The controller said ${json.meta.msg ?? "no"}`);
  }
  return asArray(json.data);
}

async function devices(target: Target, io: DriverIo, session: Session) {
  return api(target, io, session, "/stat/device");
}

const mac = (value: unknown) => str(value).toLowerCase();

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  const session = await login(target, io);
  const [sysinfo] = await api(target, io, session, "/stat/sysinfo");
  const list = await optional(devices(target, io, session), []);
  const gateway = list.find((d) => ["ugw", "udm", "uxg"].includes(str(d.type)));
  const stats = (gateway?.["system-stats"] ?? {}) as Record<string, unknown>;
  return {
    name: str(sysinfo?.name) || str(sysinfo?.hostname) || target.address,
    model: "UniFi Network",
    version: str(sysinfo?.version) || undefined,
    description: `${list.length} devices on site ${site(target)}`,
    uptimeSec: int(gateway?.uptime) ?? int(sysinfo?.uptime),
    cpu: int(stats.cpu),
    memory: int(stats.mem),
  };
}

/** Port ids carry the switch's MAC, since one controller has many switches. */
export function portId(switchMac: string, index: number): string {
  return `${switchMac}/${index}`;
}

function splitPortId(id: string): { mac: string; index: number } {
  const match = /^([0-9a-f]{2}(?::[0-9a-f]{2}){5})\/(\d{1,3})$/.exec(id);
  if (!match) throw new DriverError("Unknown port");
  return { mac: match[1], index: Number(match[2]) };
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  const session = await login(target, io);
  const out: PortInfo[] = [];
  for (const device of await devices(target, io, session)) {
    const switchMac = mac(device.mac);
    const deviceName = str(device.name) || str(device.model) || switchMac;
    for (const port of asArray(device.port_table)) {
      const index = int(port.port_idx);
      if (index === undefined) continue;
      const info: PortInfo = {
        id: portId(switchMac, index),
        name: `${deviceName} ${str(port.name) || `Port ${index}`}`,
        up: port.up === true,
        adminUp: port.enable !== false,
        speedMbps: int(port.speed) || undefined,
        rxBytes: int(port.rx_bytes),
        txBytes: int(port.tx_bytes),
        rxErrors: int(port.rx_errors),
        txErrors: int(port.tx_errors),
      };
      if (port.port_poe === true) {
        const watts = Number(port.poe_power);
        info.poe = {
          enabled: port.poe_enable === true || str(port.poe_mode) === "auto",
          ...(Number.isFinite(watts) ? { watts } : {}),
          delivering: port.poe_good === true,
        };
      }
      out.push(info);
    }
  }
  return out;
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  const session = await login(target, io);
  const list = await devices(target, io, session);
  const names = new Map(
    list.map((d) => [mac(d.mac), str(d.name) || mac(d.mac)]),
  );
  return (await api(target, io, session, "/stat/sta")).flatMap((row) => {
    const address = mac(row.mac);
    if (!address) return [];
    const wired = row.is_wired === true;
    const via = wired ? mac(row.sw_mac) : mac(row.ap_mac);
    const port = wired
      ? `${names.get(via) ?? via} ${str(row.sw_port)}`.trim()
      : str(row.essid) || undefined;
    return [
      {
        mac: address,
        ip: str(row.ip) || undefined,
        name: str(row.name) || str(row.hostname) || undefined,
        port,
        kind: wired ? ("table" as const) : ("wifi" as const),
        signal: wired ? undefined : int(row.signal),
        vlan: int(row.vlan),
      },
    ];
  });
}

async function neighbors(
  target: Target,
  io: DriverIo,
): Promise<NeighborInfo[]> {
  const session = await login(target, io);
  const out: NeighborInfo[] = [];
  for (const device of await devices(target, io, session)) {
    const deviceName = str(device.name) || mac(device.mac);
    for (const row of asArray(device.lldp_table)) {
      out.push({
        localPort: `${deviceName} ${str(row.local_port_name) || str(row.local_port_idx)}`,
        remoteName: str(row.system_name) || str(row.chassis_descr) || undefined,
        remotePort: str(row.port_id) || undefined,
        remoteMac: mac(row.chassis_id) || undefined,
      });
    }
  }
  return out;
}

/** Settings worth keeping a history of; device state is left out. */
const CONFIG_PARTS = [
  "setting",
  "networkconf",
  "wlanconf",
  "portconf",
  "portforward",
  "firewallrule",
  "firewallgroup",
  "routing",
  "usergroup",
];

/** Fields that change by themselves and would show up in every diff. */
const NOISE = new Set(["_id", "site_id", "attr_hidden_id", "attr_no_delete"]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !NOISE.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, stable(v)]),
    );
  }
  return value;
}

export const unifiDriver: Driver = {
  info: {
    id: "unifi",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "username", type: "text", required: false },
      { key: "password", type: "secret", required: false },
      { key: "apiKey", type: "secret", required: false },
    ],
    features: {
      portControl: false,
      poe: true,
      reboot: false,
      clients: true,
      neighbors: true,
      configBackup: true,
    },
  },
  validate(credentials) {
    if (credentials.apiKey) return null;
    return credentials.username && credentials.password
      ? null
      : "Give a username and password, or an API key";
  },
  probe,
  ports,
  clients,
  neighbors,

  async poeCycle(target, io, id) {
    const { mac: switchMac, index } = splitPortId(id);
    const session = await login(target, io);
    await api(target, io, session, "/cmd/devmgr", {
      method: "POST",
      body: { cmd: "power-cycle", mac: switchMac, port_idx: index },
    });
  },

  async backupConfig(target, io) {
    const session = await login(target, io);
    const out: Record<string, unknown> = {};
    for (const part of CONFIG_PARTS) {
      const rows = await optional(
        api(target, io, session, `/rest/${part}`),
        null,
      );
      if (rows) out[part] = stable(rows);
    }
    if (Object.keys(out).length === 0) {
      throw new DriverError("The controller did not give its settings");
    }
    return { content: JSON.stringify(out, null, 2), format: "json" };
  },
};
