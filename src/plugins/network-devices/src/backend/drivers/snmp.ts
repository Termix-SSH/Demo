import type {
  ClientInfo,
  DeviceInfo,
  NeighborInfo,
  PortInfo,
} from "../../shared/types.js";
import { createSnmpClient } from "./snmp-client.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type SnmpClient,
  type SnmpValue,
  type Target,
} from "./types.js";

const O = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifType: "1.3.6.1.2.1.2.2.1.3",
  ifSpeed: "1.3.6.1.2.1.2.2.1.5",
  ifPhysAddress: "1.3.6.1.2.1.2.2.1.6",
  ifAdminStatus: "1.3.6.1.2.1.2.2.1.7",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifInOctets: "1.3.6.1.2.1.2.2.1.10",
  ifInErrors: "1.3.6.1.2.1.2.2.1.14",
  ifOutOctets: "1.3.6.1.2.1.2.2.1.16",
  ifOutErrors: "1.3.6.1.2.1.2.2.1.20",
  ifName: "1.3.6.1.2.1.31.1.1.1.1",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  ifHighSpeed: "1.3.6.1.2.1.31.1.1.1.15",
  ifAlias: "1.3.6.1.2.1.31.1.1.1.18",
  bridgePortIf: "1.3.6.1.2.1.17.1.4.1.2",
  pvid: "1.3.6.1.2.1.17.7.1.4.5.1.1",
  fdbQ: "1.3.6.1.2.1.17.7.1.2.2.1.2",
  fdb: "1.3.6.1.2.1.17.4.3.1.2",
  arp: "1.3.6.1.2.1.4.22.1.2",
  cpu: "1.3.6.1.2.1.25.3.3.1.2",
  poeAdmin: "1.3.6.1.2.1.105.1.1.1.3",
  poeStatus: "1.3.6.1.2.1.105.1.1.1.6",
  lldpChassis: "1.0.8802.1.1.2.1.4.1.1.5",
  lldpPortId: "1.0.8802.1.1.2.1.4.1.1.7",
  lldpPortDesc: "1.0.8802.1.1.2.1.4.1.1.8",
  lldpSysName: "1.0.8802.1.1.2.1.4.1.1.9",
};

// Interface types worth showing as ports: ethernet, gigabit, wifi and LAGs
const PORT_TYPES = new Set([6, 62, 69, 71, 117, 161]);
const LOOPBACK = 24;

function text(value: SnmpValue | undefined | null): string {
  if (!value) return "";
  const raw = value.value;
  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8").replace(/\0+$/g, "").trim();
  }
  return String(raw).trim();
}

function num(value: SnmpValue | undefined | null): number | undefined {
  if (!value) return undefined;
  const raw = value.value;
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (Buffer.isBuffer(raw)) {
    // Counter64 arrives as big endian bytes
    let total = 0;
    for (const byte of raw) total = total * 256 + byte;
    return total;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatMac(raw: Buffer | string | number): string | undefined {
  if (!Buffer.isBuffer(raw) || raw.length !== 6) return undefined;
  return [...raw].map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}

/** The part of an oid after its table column. */
function suffix(oid: string, column: string): string {
  return oid.startsWith(`${column}.`) ? oid.slice(column.length + 1) : oid;
}

function indexed(values: SnmpValue[], column: string): Map<string, SnmpValue> {
  const map = new Map<string, SnmpValue>();
  for (const value of values) map.set(suffix(value.oid, column), value);
  return map;
}

async function quiet(task: Promise<SnmpValue[]>): Promise<SnmpValue[]> {
  try {
    return await task;
  } catch {
    return [];
  }
}

async function withClient<T>(
  target: Target,
  io: DriverIo,
  work: (client: SnmpClient) => Promise<T>,
): Promise<T> {
  const client = (io.snmp ?? createSnmpClient)(target);
  try {
    return await work(client);
  } finally {
    client.close();
  }
}

function sleep(io: DriverIo, ms: number): Promise<void> {
  if (io.sleep) return io.sleep(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  return withClient(target, io, async (client) => {
    const [name, description, ticks] = await client.get([
      O.sysName,
      O.sysDescr,
      O.sysUpTime,
    ]);
    if (!name && !description) {
      throw new DriverError("The device did not answer SNMP");
    }
    const info: DeviceInfo = {
      name: text(name) || target.address,
      description: text(description) || undefined,
    };
    const up = num(ticks);
    if (up !== undefined) info.uptimeSec = Math.floor(up / 100);
    const loads = (await quiet(client.walk(O.cpu)))
      .map((row) => num(row))
      .filter((value): value is number => value !== undefined);
    if (loads.length) {
      info.cpu = Math.round(loads.reduce((a, b) => a + b, 0) / loads.length);
    }
    return info;
  });
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  return withClient(target, io, async (client) => {
    const [
      descr,
      type,
      speed,
      phys,
      admin,
      oper,
      inOctets,
      inErrors,
      outOctets,
      outErrors,
      names,
      hcIn,
      hcOut,
      highSpeed,
      alias,
      bridgeToIf,
      pvid,
      poeAdmin,
      poeStatus,
    ] = await Promise.all([
      client.walk(O.ifDescr),
      quiet(client.walk(O.ifType)),
      quiet(client.walk(O.ifSpeed)),
      quiet(client.walk(O.ifPhysAddress)),
      client.walk(O.ifAdminStatus),
      client.walk(O.ifOperStatus),
      quiet(client.walk(O.ifInOctets)),
      quiet(client.walk(O.ifInErrors)),
      quiet(client.walk(O.ifOutOctets)),
      quiet(client.walk(O.ifOutErrors)),
      quiet(client.walk(O.ifName)),
      quiet(client.walk(O.ifHCInOctets)),
      quiet(client.walk(O.ifHCOutOctets)),
      quiet(client.walk(O.ifHighSpeed)),
      quiet(client.walk(O.ifAlias)),
      quiet(client.walk(O.bridgePortIf)),
      quiet(client.walk(O.pvid)),
      quiet(client.walk(O.poeAdmin)),
      quiet(client.walk(O.poeStatus)),
    ]);

    const maps = {
      type: indexed(type, O.ifType),
      speed: indexed(speed, O.ifSpeed),
      phys: indexed(phys, O.ifPhysAddress),
      admin: indexed(admin, O.ifAdminStatus),
      oper: indexed(oper, O.ifOperStatus),
      inOctets: indexed(inOctets, O.ifInOctets),
      inErrors: indexed(inErrors, O.ifInErrors),
      outOctets: indexed(outOctets, O.ifOutOctets),
      outErrors: indexed(outErrors, O.ifOutErrors),
      names: indexed(names, O.ifName),
      hcIn: indexed(hcIn, O.ifHCInOctets),
      hcOut: indexed(hcOut, O.ifHCOutOctets),
      highSpeed: indexed(highSpeed, O.ifHighSpeed),
      alias: indexed(alias, O.ifAlias),
    };

    const vlanByIf = new Map<string, number>();
    const bridgeMap = indexed(bridgeToIf, O.bridgePortIf);
    for (const [bridgePort, value] of indexed(pvid, O.pvid)) {
      const ifIndex = bridgeMap.has(bridgePort)
        ? String(num(bridgeMap.get(bridgePort)))
        : bridgePort;
      const vlan = num(value);
      if (vlan !== undefined) vlanByIf.set(ifIndex, vlan);
    }

    const poeAdminMap = indexed(poeAdmin, O.poeAdmin);
    const poeStatusMap = indexed(poeStatus, O.poeStatus);

    const all = descr.map((row) => suffix(row.oid, O.ifDescr));
    const wanted = all.filter((index) => {
      const kind = num(maps.type.get(index));
      return kind !== undefined && PORT_TYPES.has(kind);
    });
    const indexes = wanted.length
      ? wanted
      : all.filter((index) => num(maps.type.get(index)) !== LOOPBACK);

    const byIndex = indexed(descr, O.ifDescr);
    return indexes.map((index): PortInfo => {
      const rx = num(maps.hcIn.get(index)) ?? num(maps.inOctets.get(index));
      const tx = num(maps.hcOut.get(index)) ?? num(maps.outOctets.get(index));
      const mbps =
        num(maps.highSpeed.get(index)) ??
        (num(maps.speed.get(index)) ?? 0) / 1_000_000;
      const isUp = num(maps.oper.get(index)) === 1;
      const port: PortInfo = {
        id: index,
        name: text(maps.names.get(index)) || text(byIndex.get(index)) || index,
        up: isUp,
        adminUp: num(maps.admin.get(index)) !== 2,
        rxBytes: rx,
        txBytes: tx,
        rxErrors: num(maps.inErrors.get(index)),
        txErrors: num(maps.outErrors.get(index)),
      };
      const aliasText = text(maps.alias.get(index));
      if (aliasText) port.description = aliasText;
      if (isUp && mbps > 0) port.speedMbps = Math.round(mbps);
      const mac = maps.phys.get(index);
      const macText = mac ? formatMac(mac.value as Buffer) : undefined;
      if (macText) port.mac = macText;
      const vlan = vlanByIf.get(index);
      if (vlan !== undefined) port.vlan = vlan;
      // The PoE table is numbered group.port. Port n of group 1 is taken to
      // be interface n, which is how most switches number them.
      const poeKey = `1.${index}`;
      if (poeAdminMap.has(poeKey)) {
        port.poe = {
          enabled: num(poeAdminMap.get(poeKey)) === 1,
          delivering: num(poeStatusMap.get(poeKey)) === 3,
        };
      }
      return port;
    });
  });
}

function macFromIndex(parts: string[]): string | undefined {
  if (parts.length !== 6) return undefined;
  const bytes = parts.map(Number);
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return undefined;
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  return withClient(target, io, async (client) => {
    const [fdbQ, fdbPlain, arp, names, bridgeToIf] = await Promise.all([
      quiet(client.walk(O.fdbQ)),
      quiet(client.walk(O.fdb)),
      quiet(client.walk(O.arp)),
      quiet(client.walk(O.ifName)),
      quiet(client.walk(O.bridgePortIf)),
    ]);
    const nameOf = indexed(names, O.ifName);
    const bridgeMap = indexed(bridgeToIf, O.bridgePortIf);
    const portName = (bridgePort: number | undefined): string | undefined => {
      if (bridgePort === undefined || bridgePort === 0) return undefined;
      const key = String(bridgePort);
      const ifIndex = bridgeMap.has(key)
        ? String(num(bridgeMap.get(key)))
        : key;
      return text(nameOf.get(ifIndex)) || ifIndex;
    };

    const byMac = new Map<string, ClientInfo>();
    for (const row of fdbQ) {
      const parts = suffix(row.oid, O.fdbQ).split(".");
      const mac = macFromIndex(parts.slice(1));
      const port = portName(num(row));
      if (!mac || !port) continue;
      byMac.set(mac, {
        mac,
        port,
        vlan: Number(parts[0]),
        kind: "table",
      });
    }
    if (byMac.size === 0) {
      for (const row of fdbPlain) {
        const mac = macFromIndex(suffix(row.oid, O.fdb).split("."));
        const port = portName(num(row));
        if (!mac || !port) continue;
        byMac.set(mac, { mac, port, kind: "table" });
      }
    }
    for (const row of arp) {
      const mac = formatMac(row.value as Buffer);
      const parts = suffix(row.oid, O.arp).split(".");
      const ip = parts.slice(1).join(".");
      if (!mac || parts.length !== 5) continue;
      const known = byMac.get(mac);
      if (known) known.ip = ip;
      else byMac.set(mac, { mac, ip, kind: "arp" });
    }
    return [...byMac.values()];
  });
}

async function neighbors(
  target: Target,
  io: DriverIo,
): Promise<NeighborInfo[]> {
  return withClient(target, io, async (client) => {
    const [chassis, portId, portDesc, sysName, names] = await Promise.all([
      quiet(client.walk(O.lldpChassis)),
      quiet(client.walk(O.lldpPortId)),
      quiet(client.walk(O.lldpPortDesc)),
      quiet(client.walk(O.lldpSysName)),
      quiet(client.walk(O.ifName)),
    ]);
    const nameOf = indexed(names, O.ifName);
    const chassisMap = indexed(chassis, O.lldpChassis);
    const portIdMap = indexed(portId, O.lldpPortId);
    const portDescMap = indexed(portDesc, O.lldpPortDesc);
    const sysMap = indexed(sysName, O.lldpSysName);
    const keys = new Set([
      ...chassisMap.keys(),
      ...portIdMap.keys(),
      ...sysMap.keys(),
    ]);
    const out: NeighborInfo[] = [];
    for (const key of keys) {
      // timeMark.localPortNum.remIndex
      const local = key.split(".")[1] ?? "";
      const chassisValue = chassisMap.get(key);
      const mac = chassisValue
        ? formatMac(chassisValue.value as Buffer)
        : undefined;
      out.push({
        localPort: text(nameOf.get(local)) || local,
        remoteName: text(sysMap.get(key)) || undefined,
        remotePort:
          text(portDescMap.get(key)) || text(portIdMap.get(key)) || undefined,
        remoteMac: mac,
      });
    }
    return out;
  });
}

function writable(target: Target): Target {
  const write = target.credentials.writeCommunity;
  if (target.options.snmpVersion === "3" || !write) return target;
  return {
    ...target,
    credentials: { ...target.credentials, community: write },
  };
}

function index(portId: string): string {
  if (!/^\d{1,9}$/.test(portId)) throw new DriverError("Unknown port");
  return portId;
}

export const snmpDriver: Driver = {
  info: {
    id: "snmp",
    defaultPort: 161,
    web: false,
    fields: [
      { key: "community", type: "secret", required: false },
      { key: "writeCommunity", type: "secret", required: false },
      { key: "username", type: "text", required: false },
      {
        key: "authProtocol",
        type: "select",
        required: false,
        options: ["sha", "md5", "sha224", "sha256", "sha384", "sha512"],
      },
      { key: "authKey", type: "secret", required: false },
      {
        key: "privProtocol",
        type: "select",
        required: false,
        options: ["aes", "des", "aes256b", "aes256r"],
      },
      { key: "privKey", type: "secret", required: false },
    ],
    features: {
      portControl: true,
      poe: true,
      reboot: false,
      clients: true,
      neighbors: true,
    },
  },

  validate(credentials, options) {
    if (options.snmpVersion === "3") {
      return credentials.username ? null : "An SNMPv3 user name is required";
    }
    return credentials.community ? null : "A community is required";
  },

  probe,
  ports,
  clients,
  neighbors,

  async setPort(target, io, portId, up) {
    const id = index(portId);
    await withClient(writable(target), io, (client) =>
      client.set(`${O.ifAdminStatus}.${id}`, "integer", up ? 1 : 2),
    );
  },

  async poeCycle(target, io, portId) {
    const id = index(portId);
    const oid = `${O.poeAdmin}.1.${id}`;
    await withClient(writable(target), io, async (client) => {
      await client.set(oid, "integer", 2);
      await sleep(io, 3000);
      await client.set(oid, "integer", 1);
    });
  },
};
