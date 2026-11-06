import type { ClientInfo, DeviceInfo, PortInfo } from "../../shared/types.js";
import type { Driver, DriverIo, Target } from "./types.js";
import {
  asArray,
  basicAuth,
  baseUrl,
  int,
  optional,
  request,
  str,
} from "./web.js";

/** OPNsense API. The key and secret are sent as basic auth. */
function headers(target: Target) {
  return {
    authorization: basicAuth(
      target.credentials.apiKey ?? "",
      target.credentials.apiSecret ?? "",
    ),
  };
}

function get(target: Target, io: DriverIo, path: string) {
  return request(target, io, `${baseUrl(target)}/api${path}`, {
    headers: headers(target),
  });
}

/** "1 day, 02:03:04" or "02:03:04" to seconds. */
export function parseUptime(value: string): number | undefined {
  const match = /^(?:(\d+) days?, )?(\d+):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  const system = (await get(
    target,
    io,
    "/diagnostics/system/systemInformation",
  )) as Record<string, unknown>;
  const time = await optional(
    get(target, io, "/diagnostics/system/systemTime") as Promise<
      Record<string, unknown>
    >,
    {},
  );
  const versions = Array.isArray(system.versions)
    ? (system.versions as unknown[]).map(str)
    : [];
  return {
    name: str(system.name) || target.address,
    model: versions[1] || undefined,
    version: versions[0] || undefined,
    uptimeSec: parseUptime(str(time.uptime)),
  };
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  const [config, stats] = await Promise.all([
    get(target, io, "/diagnostics/interface/getInterfaceConfig") as Promise<
      Record<string, Record<string, unknown>>
    >,
    optional(
      get(
        target,
        io,
        "/diagnostics/interface/getInterfaceStatistics",
      ) as Promise<{
        statistics?: Record<string, Record<string, unknown>>;
      }>,
      {},
    ),
  ]);
  // Statistics are keyed "[em0] / 00:11:22:33:44:55" or by name
  const byDevice = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(stats.statistics ?? {})) {
    const device = /^\[([^\]]+)\]/.exec(key)?.[1] ?? str(value.name) ?? key;
    byDevice.set(device, value);
  }
  return Object.entries(config ?? {})
    .filter(([name]) => !/^(lo\d*|pflog\d*|pfsync\d*|enc\d*)$/.test(name))
    .map(([name, value]): PortInfo => {
      const counters = byDevice.get(name) ?? {};
      const active = str(value.status) === "active";
      return {
        id: name,
        name,
        description: str(value.description) || undefined,
        up: active,
        adminUp: !str(value.flags).includes("down"),
        mac: str(value.macaddr) || undefined,
        rxBytes: int(counters["received-bytes"]),
        txBytes: int(counters["sent-bytes"]),
        rxErrors: int(counters["received-errors"]),
        txErrors: int(counters["send-errors"]),
      };
    });
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  const [arp, leases] = await Promise.all([
    optional(get(target, io, "/diagnostics/interface/getArp"), []),
    optional(
      get(target, io, "/dhcpv4/leases/searchLease") as Promise<{
        rows?: unknown;
      }>,
      {},
    ),
  ]);
  const byMac = new Map<string, ClientInfo>();
  for (const row of asArray(arp)) {
    const mac = str(row.mac).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      ip: str(row.ip) || undefined,
      name: str(row.hostname) || undefined,
      port: str(row.intf) || undefined,
      kind: "arp",
    });
  }
  for (const row of asArray(leases.rows)) {
    const mac = str(row.hwaddr).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      ...byMac.get(mac),
      mac,
      ip: str(row.address) || byMac.get(mac)?.ip,
      name: str(row.hostname) || byMac.get(mac)?.name,
      kind: "dhcp",
    });
  }
  return [...byMac.values()];
}

export const opnsenseDriver: Driver = {
  info: {
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
  probe,
  ports,
  clients,
  neighbors: async () => [],

  async reboot(target, io) {
    await request(target, io, `${baseUrl(target)}/api/core/system/reboot`, {
      method: "POST",
      headers: headers(target),
      body: {},
    });
  },
};
