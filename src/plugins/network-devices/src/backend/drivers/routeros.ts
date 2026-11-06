import type {
  ClientInfo,
  DeviceInfo,
  NeighborInfo,
  PortInfo,
} from "../../shared/types.js";
import type { Driver, DriverIo, Target } from "./types.js";
import { DriverError } from "./types.js";
import {
  asArray,
  basicAuth,
  baseUrl,
  int,
  optional,
  request,
  str,
} from "./web.js";

/** RouterOS v7 REST API. */
function get(target: Target, io: DriverIo, path: string) {
  return request(target, io, `${baseUrl(target)}/rest${path}`, {
    headers: {
      authorization: basicAuth(
        target.credentials.username ?? "",
        target.credentials.password ?? "",
      ),
    },
  });
}

function send(
  target: Target,
  io: DriverIo,
  method: string,
  path: string,
  body: unknown,
) {
  return request(target, io, `${baseUrl(target)}/rest${path}`, {
    method,
    body,
    headers: {
      authorization: basicAuth(
        target.credentials.username ?? "",
        target.credentials.password ?? "",
      ),
    },
  });
}

/** "1w2d3h4m5s" to seconds. */
export function parseUptime(value: string): number | undefined {
  const match =
    /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(
      value.trim(),
    );
  if (!match || !value.trim()) return undefined;
  const [, w, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return w * 604800 + d * 86400 + h * 3600 + m * 60 + s;
}

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  const resource = (await get(target, io, "/system/resource")) as Record<
    string,
    unknown
  >;
  const identity = await optional(
    get(target, io, "/system/identity") as Promise<Record<string, unknown>>,
    {},
  );
  const total = int(resource["total-memory"]);
  const free = int(resource["free-memory"]);
  const info: DeviceInfo = {
    name: str(identity.name) || target.address,
    model: str(resource["board-name"]) || undefined,
    version: str(resource.version) || undefined,
    uptimeSec: parseUptime(str(resource.uptime)),
    cpu: int(resource["cpu-load"]),
  };
  if (total && free !== undefined) {
    info.memory = Math.round(((total - free) / total) * 100);
  }
  return info;
}

function flag(value: unknown): boolean {
  return value === true || value === "true";
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  const [rows, poe] = await Promise.all([
    get(target, io, "/interface"),
    optional(get(target, io, "/interface/ethernet/poe"), []),
  ]);
  const poeByName = new Map(
    asArray(poe).map((row) => [str(row.name), str(row["poe-out"])]),
  );
  return asArray(rows)
    .filter((row) => !["vlan", "wg", "loopback"].includes(str(row.type)))
    .map((row): PortInfo => {
      const name = str(row.name);
      const port: PortInfo = {
        id: str(row[".id"]),
        name,
        description: str(row.comment) || undefined,
        up: flag(row.running) && !flag(row.disabled),
        adminUp: !flag(row.disabled),
        mac: str(row["mac-address"]) || undefined,
        rxBytes: int(row["rx-byte"]),
        txBytes: int(row["tx-byte"]),
        rxErrors: int(row["rx-error"]),
        txErrors: int(row["tx-error"]),
      };
      const mode = poeByName.get(name);
      if (mode !== undefined) {
        port.poe = { enabled: mode !== "off" };
      }
      return port;
    });
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  const [leases, arp, wifi, legacyWifi] = await Promise.all([
    optional(get(target, io, "/ip/dhcp-server/lease"), []),
    optional(get(target, io, "/ip/arp"), []),
    optional(get(target, io, "/interface/wifi/registration-table"), []),
    optional(get(target, io, "/interface/wireless/registration-table"), []),
  ]);
  const byMac = new Map<string, ClientInfo>();
  for (const row of asArray(arp)) {
    const mac = str(row["mac-address"]).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      ip: str(row.address) || undefined,
      port: str(row.interface) || undefined,
      kind: "arp",
    });
  }
  for (const row of asArray(leases)) {
    const mac = str(row["mac-address"]).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      ...byMac.get(mac),
      mac,
      ip: str(row.address) || byMac.get(mac)?.ip,
      name: str(row["host-name"]) || undefined,
      kind: "dhcp",
    });
  }
  for (const row of [...asArray(wifi), ...asArray(legacyWifi)]) {
    const mac = str(row["mac-address"]).toLowerCase();
    if (!mac) continue;
    const signal = int(str(row.signal).split("@")[0]);
    byMac.set(mac, {
      ...byMac.get(mac),
      mac,
      port: str(row.interface) || byMac.get(mac)?.port,
      signal,
      kind: "wifi",
    });
  }
  return [...byMac.values()];
}

async function neighbors(
  target: Target,
  io: DriverIo,
): Promise<NeighborInfo[]> {
  const rows = await optional(get(target, io, "/ip/neighbor"), []);
  return asArray(rows).map((row) => ({
    localPort: str(row.interface),
    remoteName: str(row.identity) || undefined,
    remotePort: str(row["interface-name"]) || undefined,
    remoteMac: str(row["mac-address"]).toLowerCase() || undefined,
    remoteAddress: str(row.address) || undefined,
  }));
}

function safeId(value: string): string {
  if (!/^\*[0-9A-Fa-f]+$/.test(value)) throw new DriverError("Unknown port");
  return value;
}

export const routerosDriver: Driver = {
  info: {
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
  probe,
  ports,
  clients,
  neighbors,

  async setPort(target, io, portId, up) {
    await send(target, io, "PATCH", `/interface/${safeId(portId)}`, {
      disabled: up ? "false" : "true",
    });
  },

  async poeCycle(target, io, portId) {
    const id = safeId(portId);
    const all = asArray(await get(target, io, "/interface"));
    const name = str(all.find((row) => str(row[".id"]) === id)?.name);
    if (!name) throw new DriverError("Unknown port");
    const poe = asArray(await get(target, io, "/interface/ethernet/poe"));
    const row = poe.find((entry) => str(entry.name) === name);
    if (!row) throw new DriverError("This port has no PoE");
    const poeId = safeId(str(row[".id"]));
    const mode =
      str(row["poe-out"]) === "off" ? "auto-on" : str(row["poe-out"]);
    await send(target, io, "PATCH", `/interface/ethernet/poe/${poeId}`, {
      "poe-out": "off",
    });
    await (io.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))))(
      3000,
    );
    await send(target, io, "PATCH", `/interface/ethernet/poe/${poeId}`, {
      "poe-out": mode,
    });
  },

  async reboot(target, io) {
    await send(target, io, "POST", "/system/reboot", {});
  },
};
