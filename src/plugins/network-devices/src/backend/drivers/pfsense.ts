import type { ClientInfo, DeviceInfo, PortInfo } from "../../shared/types.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";
import {
  asArray,
  basicAuth,
  baseUrl,
  int,
  optional,
  request,
  requestText,
  str,
} from "./web.js";

/**
 * pfSense CE or Plus with the REST API package (pfSense-pkg-RESTAPI, v2).
 * An API key or a user and password; the config backup uses pfSense's own
 * XML-RPC, which needs the user and password.
 */
function headers(target: Target): Record<string, string> {
  const { apiKey, username, password } = target.credentials;
  if (apiKey) return { "x-api-key": apiKey };
  return { authorization: basicAuth(username ?? "", password ?? "") };
}

async function get(target: Target, io: DriverIo, path: string) {
  const body = (await request(target, io, `${baseUrl(target)}/api/v2${path}`, {
    headers: headers(target),
  })) as { data?: unknown } | null;
  return body?.data;
}

const obj = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** "1 Day 02 Hours 03 Minutes 04 Seconds" or a number to seconds. */
export function parseUptime(value: unknown): number | undefined {
  const seconds = int(value);
  if (seconds !== undefined) return seconds;
  const text = str(value);
  const part = (unit: string) =>
    Number(new RegExp(`(\\d+)\\s*${unit}`, "i").exec(text)?.[1] ?? 0);
  const total =
    part("day") * 86400 +
    part("hour") * 3600 +
    part("minute") * 60 +
    part("second");
  return total || undefined;
}

async function probe(target: Target, io: DriverIo): Promise<DeviceInfo> {
  const system = obj(await get(target, io, "/status/system"));
  const [host, version] = await Promise.all([
    optional(get(target, io, "/system/hostname").then(obj), {}),
    optional(get(target, io, "/system/version").then(obj), {}),
  ]);
  const hostname = [str(host.hostname), str(host.domain)]
    .filter(Boolean)
    .join(".");
  return {
    name: hostname || target.address,
    model: str(system.platform) || "pfSense",
    version: str(version.version) || undefined,
    uptimeSec: parseUptime(system.uptime),
    cpu:
      int(system.cpu_usage) !== undefined
        ? Math.round(Number(system.cpu_usage))
        : undefined,
    memory:
      int(system.mem_usage) !== undefined
        ? Math.round(Number(system.mem_usage))
        : undefined,
  };
}

async function ports(target: Target, io: DriverIo): Promise<PortInfo[]> {
  return asArray(await get(target, io, "/status/interfaces")).map((row) => {
    const name = str(row.name) || str(row.hwif);
    const status = str(row.status).toLowerCase();
    // "1000baseT", "2500Base-T" or "10Gbase-SR"
    const speed = /(\d+)(G)?base/i.exec(str(row.media));
    return {
      id: name,
      name: str(row.descr) ? `${str(row.descr)} (${name})` : name,
      description: str(row.ipaddr) || undefined,
      up: status === "up" || status === "associated",
      adminUp: row.enable !== false && status !== "down",
      speedMbps: speed ? Number(speed[1]) * (speed[2] ? 1000 : 1) : undefined,
      mac: str(row.macaddr).toLowerCase() || undefined,
      rxBytes: int(row.inbytes),
      txBytes: int(row.outbytes),
      rxErrors: int(row.inerrs),
      txErrors: int(row.outerrs),
    };
  });
}

async function clients(target: Target, io: DriverIo): Promise<ClientInfo[]> {
  const [arp, leases] = await Promise.all([
    optional(get(target, io, "/diagnostics/arp_table"), []),
    optional(get(target, io, "/status/dhcp_server/leases"), []),
  ]);
  const byMac = new Map<string, ClientInfo>();
  for (const row of asArray(arp)) {
    const mac = str(row.mac_address).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      mac,
      ip: str(row.ip_address) || undefined,
      name: str(row.hostname).replace(/^\?$/, "") || undefined,
      port: str(row.interface) || undefined,
      kind: "arp",
    });
  }
  for (const row of asArray(leases)) {
    const mac = str(row.mac).toLowerCase();
    if (!mac) continue;
    byMac.set(mac, {
      ...byMac.get(mac),
      mac,
      ip: str(row.ip) || byMac.get(mac)?.ip,
      name: str(row.hostname) || byMac.get(mac)?.name,
      kind: "dhcp",
    });
  }
  return [...byMac.values()];
}

/** The parts of config.xml kept in each backup. */
export const CONFIG_SECTIONS = [
  "system",
  "interfaces",
  "vlans",
  "gateways",
  "staticroutes",
  "dhcpd",
  "dhcpdv6",
  "dnsmasq",
  "unbound",
  "filter",
  "nat",
  "aliases",
  "openvpn",
  "ipsec",
  "wireguard",
  "virtualip",
  "shaper",
  "syslog",
  "snmpd",
  "cert",
  "ca",
];

export function backupCall(sections: string[]): string {
  const values = sections
    .map((section) => `<value><string>${section}</string></value>`)
    .join("");
  return `<?xml version="1.0"?><methodCall><methodName>pfsense.backup_config_section</methodName><params><param><value><array><data>${values}</data></array></value></param></params></methodCall>`;
}

export const pfsenseDriver: Driver = {
  info: {
    id: "pfsense",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "apiKey", type: "secret", required: false },
      { key: "username", type: "text", required: false },
      { key: "password", type: "secret", required: false },
    ],
    features: {
      portControl: false,
      poe: false,
      reboot: true,
      clients: true,
      neighbors: false,
      configBackup: true,
    },
  },
  validate(credentials) {
    if (credentials.apiKey) return null;
    return credentials.username && credentials.password
      ? null
      : "Give an API key, or a username and password";
  },
  probe,
  ports,
  clients,
  neighbors: async () => [],

  async reboot(target, io) {
    await request(target, io, `${baseUrl(target)}/api/v2/diagnostics/reboot`, {
      method: "POST",
      headers: headers(target),
      body: {},
    });
  },

  async backupConfig(target, io) {
    const { username, password } = target.credentials;
    if (!username || !password) {
      throw new DriverError(
        "Saving the configuration needs a username and password with XML-RPC access",
      );
    }
    const content = await requestText(
      target,
      io,
      `${baseUrl(target)}/xmlrpc.php`,
      {
        method: "POST",
        headers: {
          authorization: basicAuth(username, password),
          "content-type": "text/xml",
        },
        body: backupCall(CONFIG_SECTIONS),
      },
    );
    if (/<fault>/.test(content)) {
      const reason =
        /<name>faultString<\/name>\s*<value>(?:<string>)?([^<]*)/.exec(
          content,
        )?.[1];
      throw new DriverError(
        `pfSense refused the backup${reason ? `: ${reason.trim()}` : ""}`,
      );
    }
    if (!content.includes("<methodResponse>")) {
      throw new DriverError("The device did not send its configuration");
    }
    return { content, format: "xml" };
  },
};
