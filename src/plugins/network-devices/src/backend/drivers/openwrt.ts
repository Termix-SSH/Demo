import type { ClientInfo, DeviceInfo, PortInfo } from "../../shared/types.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";
import { asArray, baseUrl, int, optional, request, str } from "./web.js";

const NO_SESSION = "00000000000000000000000000000000";

/** OpenWrt ubus over its JSON-RPC web endpoint. Logs in for each batch of calls. */
async function ubus(
  target: Target,
  io: DriverIo,
  calls: Array<[string, string, Record<string, unknown>]>,
): Promise<unknown[]> {
  const url = `${baseUrl(target, "http")}/ubus`;
  const login = (await request(target, io, url, {
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: [
        NO_SESSION,
        "session",
        "login",
        {
          username: target.credentials.username ?? "",
          password: target.credentials.password ?? "",
        },
      ],
    },
  })) as { result?: unknown[] };
  const session = (login.result?.[1] as { ubus_rpc_session?: string })
    ?.ubus_rpc_session;
  if (!session) throw new DriverError("The device refused the login", 401);
  const answers: unknown[] = [];
  for (const [object, method, params] of calls) {
    const reply = (await request(target, io, url, {
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "call",
        params: [session, object, method, params],
      },
    })) as { result?: unknown[] };
    const [code, data] = reply.result ?? [];
    // 0 is ok, 6 is permission denied, 4 is not found
    if (code !== 0) {
      throw new DriverError(
        code === 6
          ? "The login may not use this part of the device"
          : `The device returned error ${String(code)}`,
      );
    }
    answers.push(data);
  }
  return answers;
}

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  const [board, info] = (await ubus(target, io, [
    ["system", "board", {}],
    ["system", "info", {}],
  ])) as Array<Record<string, any>>;
  const memory = info.memory as { total?: number; free?: number } | undefined;
  const release = board.release as { description?: string } | undefined;
  const load = Array.isArray(info.load) ? Number(info.load[0]) : undefined;
  return {
    name: str(board.hostname) || target.address,
    model: str(board.model) || undefined,
    version: release?.description,
    uptimeSec: int(info.uptime),
    // ubus load is the 1 minute average times 65536
    cpu:
      load !== undefined && Number.isFinite(load)
        ? Math.min(100, Math.round((load / 65536) * 100))
        : undefined,
    memory:
      memory?.total && memory.free !== undefined
        ? Math.round(((memory.total - memory.free) / memory.total) * 100)
        : undefined,
  };
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  const [status] = (await ubus(target, io, [
    ["network.device", "status", {}],
  ])) as Array<Record<string, Record<string, any>>>;
  return Object.entries(status ?? {})
    .filter(([name]) => !/^(lo|ifb\d+|bonding_masters)$/.test(name))
    .map(([name, value]): PortInfo => {
      const speed = /^(\d+)/.exec(str(value.speed));
      const stats = (value.statistics ?? {}) as Record<string, unknown>;
      return {
        id: name,
        name,
        up: value.carrier === true || value.up === true,
        adminUp: value.up !== false,
        mac: str(value.macaddr) || undefined,
        speedMbps: speed ? Number(speed[1]) : undefined,
        rxBytes: int(stats.rx_bytes),
        txBytes: int(stats.tx_bytes),
        rxErrors: int(stats.rx_errors),
        txErrors: int(stats.tx_errors),
      };
    });
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  const byMac = new Map<string, ClientInfo>();
  const [leases] = await optional(
    ubus(target, io, [["luci-rpc", "getDHCPLeases", {}]]),
    [{}],
  );
  for (const row of asArray(
    (leases as { dhcp_leases?: unknown })?.dhcp_leases,
  )) {
    const mac = str(row.macaddr).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      ip: str(row.ipaddr) || undefined,
      name: str(row.hostname) || undefined,
      kind: "dhcp",
    });
  }
  const [devices] = await optional(
    ubus(target, io, [["iwinfo", "devices", {}]]),
    [{}],
  );
  const radios = ((devices as { devices?: unknown })?.devices ??
    []) as string[];
  for (const radio of Array.isArray(radios) ? radios.slice(0, 8) : []) {
    const [list] = await optional(
      ubus(target, io, [["iwinfo", "assoclist", { device: radio }]]),
      [{}],
    );
    for (const row of asArray((list as { results?: unknown })?.results)) {
      const mac = str(row.mac).toLowerCase();
      if (!mac) continue;
      byMac.set(mac, {
        ...byMac.get(mac),
        mac,
        port: radio,
        signal: int(row.signal),
        kind: "wifi",
      });
    }
  }
  return [...byMac.values()];
}

export const openwrtDriver: Driver = {
  info: {
    id: "openwrt",
    defaultPort: 80,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      portControl: false,
      poe: false,
      reboot: true,
      clients: true,
      neighbors: false,
    },
  },
  probe,
  ports,
  clients,
  neighbors: async () => [],

  async reboot(target, io) {
    await ubus(target, io, [["system", "reboot", {}]]);
  },
};
