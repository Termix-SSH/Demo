import type {
  ClientInfo,
  DeviceInfo,
  NeighborInfo,
  PortInfo,
} from "../../shared/types.js";
import { sshShell } from "./ssh-shell.js";
import {
  DriverError,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

/**
 * Cisco IOS and IOS-XE over SSH. Everything is read from show commands in
 * one shell session; an enable password is sent when the login needs it.
 */

// A prompt, alone or with the next command typed after it.
const PROMPT = /^[A-Za-z0-9._()/-]+[#>]/;
const INTERFACE = /^[A-Za-z][A-Za-z-]*\d+(?:[/.:]\d+)*$/;

function shellOf(io: DriverIo) {
  return io.shell ?? sshShell;
}

/** Output of each command, cut out of the shell transcript by its echo. */
export function splitTranscript(
  transcript: string,
  commands: string[],
): string[] {
  const lines = transcript
    .replace(/\r/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "")
    .split("\n");
  let from = 0;
  return commands.map((command) => {
    const start = lines.findIndex(
      (line, i) =>
        i >= from && /[#>]\s*/.test(line) && line.trimEnd().endsWith(command),
    );
    if (start === -1) return "";
    let end = start + 1;
    while (end < lines.length && !PROMPT.test(lines[end].trim())) end++;
    from = end;
    return lines.slice(start + 1, end).join("\n");
  });
}

async function run(
  target: Target,
  io: DriverIo,
  commands: string[],
): Promise<string[]> {
  const enable = target.credentials.enablePassword;
  const lines = [
    ...(enable ? ["enable", enable] : []),
    "terminal length 0",
    "terminal width 0",
    ...commands,
    "exit",
  ];
  const transcript = await shellOf(io)(target, lines);
  return splitTranscript(transcript, commands);
}

/** "0011.2233.4455" to "00:11:22:33:44:55". */
export function ciscoMac(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return hex.length === 12 ? hex.match(/../g)!.join(":") : "";
}

/** "1 week, 2 days, 3 hours, 4 minutes" to seconds. */
export function parseUptime(text: string): number | undefined {
  const part = (unit: string) =>
    Number(new RegExp(`(\\d+) ${unit}`).exec(text)?.[1] ?? 0);
  const total =
    part("year") * 31_536_000 +
    part("week") * 604_800 +
    part("day") * 86_400 +
    part("hour") * 3_600 +
    part("minute") * 60;
  return total || undefined;
}

export function parseVersion(output: string, fallback: string): DeviceInfo {
  const host = /^(\S+) uptime is (.+)$/m.exec(output);
  const version = /Version ([^\s,]+)/.exec(output)?.[1];
  const model =
    /^Model [Nn]umber\s*:\s*(\S+)/m.exec(output)?.[1] ??
    /^cisco (\S+) .*processor/im.exec(output)?.[1];
  return {
    name: host?.[1] ?? fallback,
    model,
    version,
    uptimeSec: host ? parseUptime(host[2]) : undefined,
  };
}

/** Blocks of show interfaces, one port each. */
export function parseInterfaces(output: string): PortInfo[] {
  const ports: PortInfo[] = [];
  let port: PortInfo | null = null;
  for (const raw of output.split("\n")) {
    const head =
      /^(\S+) is (administratively down|up|down)[^,]*, line protocol is (up|down)/.exec(
        raw,
      );
    if (head) {
      port = {
        id: head[1],
        name: head[1],
        up: head[2] === "up" && head[3] === "up",
        adminUp: head[2] !== "administratively down",
      };
      ports.push(port);
      continue;
    }
    if (!port) continue;
    const line = raw.trim();
    let match: RegExpExecArray | null;
    if ((match = /address is ([0-9a-f.]+)/i.exec(line))) {
      port.mac = ciscoMac(match[1]) || undefined;
    } else if ((match = /^Description: (.+)$/.exec(line))) {
      port.description = match[1];
    } else if ((match = /BW (\d+) Kbit/.exec(line))) {
      port.speedMbps = Math.round(Number(match[1]) / 1000);
    } else if ((match = /packets input, (\d+) bytes/.exec(line))) {
      port.rxBytes = Number(match[1]);
    } else if ((match = /packets output, (\d+) bytes/.exec(line))) {
      port.txBytes = Number(match[1]);
    } else if ((match = /^(\d+) input errors/.exec(line))) {
      port.rxErrors = Number(match[1]);
    } else if ((match = /^(\d+) output errors/.exec(line))) {
      port.txErrors = Number(match[1]);
    }
  }
  return ports;
}

export function parseClients(macTable: string, arp: string): ClientInfo[] {
  const ipByMac = new Map<string, string>();
  for (const line of arp.split("\n")) {
    const match =
      /^Internet\s+(\S+)\s+\S+\s+([0-9a-f.]{14})\s+\S+\s*(\S*)/i.exec(
        line.trim(),
      );
    if (match) ipByMac.set(ciscoMac(match[2]), match[1]);
  }
  const out = new Map<string, ClientInfo>();
  for (const line of macTable.split("\n")) {
    const match =
      /^\*?\s*(\d+)\s+([0-9a-f.]{14})\s+(\S+)\s+(?:\S+\s+)*?(\S+)$/i.exec(
        line.trim(),
      );
    if (!match || /^(CPU|Router|Drop)$/i.test(match[4])) continue;
    const mac = ciscoMac(match[2]);
    if (!mac) continue;
    out.set(mac, {
      mac,
      ip: ipByMac.get(mac),
      port: match[4],
      vlan: Number(match[1]),
      kind: "table",
    });
  }
  for (const [mac, ip] of ipByMac) {
    if (!out.has(mac)) out.set(mac, { mac, ip, kind: "arp" });
  }
  return [...out.values()];
}

export function parseCdp(output: string): NeighborInfo[] {
  return output
    .split(/^-{5,}$/m)
    .map((block) => {
      const id = /Device ID:\s*(\S+)/.exec(block)?.[1];
      const ip = /IP(?:v4)? [Aa]ddress:\s*(\S+)/.exec(block)?.[1];
      const ports =
        /Interface:\s*([^,]+),\s*Port ID \(outgoing port\):\s*(\S+)/.exec(
          block,
        );
      if (!id || !ports) return null;
      return {
        localPort: ports[1].trim(),
        remoteName: id,
        remotePort: ports[2],
        remoteAddress: ip,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);
}

/** The running config without the lines that change on every read. */
export function cleanConfig(output: string): string {
  return output
    .split("\n")
    .filter(
      (line) =>
        !/^Building configuration/.test(line) &&
        !/^Current configuration :/.test(line) &&
        !/^! (Last configuration change|NVRAM config last updated)/.test(
          line,
        ) &&
        !/^ntp clock-period/.test(line),
    )
    .join("\n")
    .trim();
}

export const ciscoDriver: Driver = {
  info: {
    id: "cisco",
    defaultPort: 22,
    web: false,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
      { key: "enablePassword", type: "secret", required: false },
      {
        key: "hostKey",
        type: "text",
        required: false,
        placeholder: "SHA256:...",
      },
    ],
    features: {
      portControl: true,
      poe: false,
      reboot: false,
      clients: true,
      neighbors: true,
      configBackup: true,
    },
  },

  async probe(target, io) {
    const [version] = await run(target, io, ["show version"]);
    if (!/Cisco/i.test(version)) {
      throw new DriverError("This does not look like a Cisco IOS device");
    }
    return parseVersion(version, target.address);
  },

  async ports(target, io) {
    const [output] = await run(target, io, ["show interfaces"]);
    return parseInterfaces(output);
  },

  async clients(target, io) {
    const [table, arp] = await run(target, io, [
      "show mac address-table",
      "show ip arp",
    ]);
    return parseClients(table, arp);
  },

  async neighbors(target, io) {
    const [cdp] = await run(target, io, ["show cdp neighbors detail"]);
    return parseCdp(cdp);
  },

  async setPort(target, io, portId, up) {
    if (!INTERFACE.test(portId)) throw new DriverError("Unknown port");
    const transcript = await shellOf(io)(target, [
      ...(target.credentials.enablePassword
        ? ["enable", target.credentials.enablePassword]
        : []),
      "configure terminal",
      `interface ${portId}`,
      up ? "no shutdown" : "shutdown",
      "end",
      "exit",
    ]);
    if (/% Invalid input|% Authorization failed/.test(transcript)) {
      throw new DriverError("The device refused the change");
    }
  },

  async backupConfig(target, io) {
    const [config] = await run(target, io, ["show running-config"]);
    const content = cleanConfig(config);
    if (!/^(version|hostname|interface) /m.test(content)) {
      throw new DriverError(
        "The device did not show its configuration. The login may need enable",
      );
    }
    return { content, format: "text" };
  },
};
