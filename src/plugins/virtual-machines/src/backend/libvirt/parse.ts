import { XMLParser } from "fast-xml-parser";
import type {
  NodeInfo,
  PoolRow,
  VmDetail,
  VmDisk,
  VmGraphics,
  VmNic,
  VmRow,
  VmState,
} from "../../shared/types.js";

/** Splits a script's output on its `@@name` lines. */
export function sections(stdout: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("@@")) {
      current = [];
      out.set(line.slice(2).trim(), current);
    } else {
      current?.push(line.replace(/\r$/, ""));
    }
  }
  return out;
}

const STATES: VmState[] = [
  "unknown",
  "running",
  "blocked",
  "paused",
  "shutdown",
  "shutoff",
  "crashed",
  "pmsuspended",
];

const SHUTOFF_CRASHED = 3;
const SHUTOFF_FAILED = 6;

export function stateOf(state: number, reason: number): VmState {
  if (
    state === 5 &&
    (reason === SHUTOFF_CRASHED || reason === SHUTOFF_FAILED)
  ) {
    return "crashed";
  }
  return STATES[state] ?? "unknown";
}

export function parseDomstats(
  lines: string[],
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const line of lines) {
    const domain = /^Domain: '(.*)'$/.exec(line.trim());
    if (domain) {
      current = new Map();
      out.set(domain[1], current);
      continue;
    }
    const at = line.indexOf("=");
    if (current && at > 0) {
      current.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  return out;
}

function count(stats: Map<string, string>, key: string): number {
  const value = Number(stats.get(key) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function vmFromStats(
  uuid: string,
  name: string,
  stats: Map<string, string>,
  autostart: boolean,
  ips: string[],
): VmRow {
  const reason = count(stats, "state.reason");
  const usable = stats.get("balloon.usable");
  const available = stats.get("balloon.available");
  const usedKib =
    usable !== undefined && available !== undefined
      ? Math.max(0, Number(available) - Number(usable))
      : stats.has("balloon.rss")
        ? count(stats, "balloon.rss")
        : null;
  const disks: VmRow["disks"] = [];
  for (let i = 0; i < count(stats, "block.count"); i++) {
    disks.push({
      target: stats.get(`block.${i}.name`) ?? "",
      path: stats.get(`block.${i}.path`) ?? "",
      capacity: count(stats, `block.${i}.capacity`),
      allocation: count(stats, `block.${i}.allocation`),
      readBytes: count(stats, `block.${i}.rd.bytes`),
      writeBytes: count(stats, `block.${i}.wr.bytes`),
    });
  }
  const nics: VmRow["nics"] = [];
  for (let i = 0; i < count(stats, "net.count"); i++) {
    nics.push({
      name: stats.get(`net.${i}.name`) ?? "",
      rxBytes: count(stats, `net.${i}.rx.bytes`),
      txBytes: count(stats, `net.${i}.tx.bytes`),
    });
  }
  return {
    uuid,
    name,
    state: stateOf(count(stats, "state.state"), reason),
    reason,
    vcpus: count(stats, "vcpu.current"),
    memoryKib: count(stats, "balloon.current"),
    maxMemoryKib: count(stats, "balloon.maximum"),
    usedKib,
    autostart,
    cpuTimeNs: count(stats, "cpu.time"),
    disks,
    nics,
    ips,
  };
}

/** `uuid name` lines from `virsh list --uuid --name`. */
export function parseList(lines: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of lines) {
    const match = /^\s*([0-9a-fA-F-]{36})\s+(.+?)\s*$/.exec(line);
    if (match) out.push([match[1], match[2]]);
  }
  return out;
}

/** Addresses from `virsh -q domifaddr`, without loopback. */
export function parseAddresses(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const address = parts[parts.length - 1]?.split("/")[0] ?? "";
    if (parts.length < 2 || !/[.:]/.test(address)) continue;
    if (
      address.startsWith("127.") ||
      address === "::1" ||
      address.startsWith("fe80:")
    ) {
      continue;
    }
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

const UNITS: Record<string, number> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  PiB: 1024 ** 5,
};

/** "98.22 GiB" to bytes. "-" and anything else is 0. */
export function parseSize(text: string): number {
  const match = /^([\d.]+)\s*(\w+)$/.exec(text.trim());
  if (!match) return 0;
  return Math.round(Number(match[1]) * (UNITS[match[2]] ?? 0));
}

/** A virsh table row. Columns sit two or more spaces apart. */
export function columns(line: string): string[] {
  return line.trim().split(/\s{2,}/);
}

export function parsePools(lines: string[]): PoolRow[] {
  const out: PoolRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = columns(line);
    if (c.length < 7) continue;
    out.push({
      name: c[0],
      state: c[1],
      autostart: c[2] === "yes",
      capacity: parseSize(c[4]),
      allocation: parseSize(c[5]),
      available: parseSize(c[6]),
    });
  }
  return out;
}

export function parseNode(lines: string[]): NodeInfo {
  const field = (name: string) =>
    lines
      .find((line) => line.startsWith(name))
      ?.split(":")[1]
      ?.trim() ?? "";
  const kib = (name: string) => Number.parseInt(field(name), 10) || 0;
  const free = kib("free") + kib("buffers") + kib("cached");
  return {
    cpus: Number.parseInt(field("CPU(s)"), 10) || 0,
    memoryKib: kib("Memory size") || kib("total"),
    freeKib: free,
  };
}

const LISTS = new Set([
  "disk",
  "interface",
  "graphics",
  "serial",
  "console",
  "channel",
  "listen",
  "ip",
  "range",
  "domainsnapshot",
  "host",
]);

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (name) => LISTS.has(name),
});

// Parsed XML is whatever the host sent.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

export function parseXml(text: string): Node {
  return xml.parse(text);
}

function textOf(node: Node): string {
  if (typeof node === "string") return node;
  return typeof node?.["#text"] === "string" ? node["#text"] : "";
}

function parseDisk(disk: Node): VmDisk {
  const source = disk.source ?? {};
  const remote =
    source["@name"] ??
    (source["@pool"] ? `${source["@pool"]}/${source["@volume"]}` : "");
  return {
    device: disk["@device"] ?? "disk",
    target: disk.target?.["@dev"] ?? "",
    bus: disk.target?.["@bus"] ?? "",
    source: source["@file"] ?? source["@dev"] ?? remote ?? "",
    format: disk.driver?.["@type"] ?? "",
    readOnly: disk.readonly !== undefined || disk["@device"] === "cdrom",
  };
}

function parseNic(nic: Node): VmNic {
  const source = nic.source ?? {};
  return {
    type: nic["@type"] ?? "",
    source: source["@network"] ?? source["@bridge"] ?? source["@dev"] ?? "",
    model: nic.model?.["@type"] ?? "",
    mac: nic.mac?.["@address"] ?? "",
  };
}

function parseGraphics(graphics: Node): VmGraphics {
  const listen = graphics.listen?.[0];
  const address = listen?.["@address"] ?? graphics["@listen"] ?? "127.0.0.1";
  return {
    type: graphics["@type"] ?? "",
    port: Number(graphics["@port"] ?? -1),
    address: listen?.["@type"] === "socket" ? "" : address,
    hasPassword: graphics["@passwd"] !== undefined,
  };
}

export interface DomainFacts {
  description: string;
  machine: string;
  arch: string;
  firmware: "bios" | "uefi";
  cpuMode: string;
  diskDevices: VmDisk[];
  nicDevices: VmNic[];
  graphics: VmGraphics[];
  hasSerial: boolean;
  guestAgent: boolean;
  /** UEFI variables in a raw file, which blocks live internal snapshots. */
  rawNvram: boolean;
  /** The VNC password, only when dumped with --security-info. */
  vncPassword: string;
}

export function parseDomain(text: string): DomainFacts {
  const domain = parseXml(text).domain ?? {};
  const devices = domain.devices ?? {};
  const os = domain.os ?? {};
  const graphics: Node[] = devices.graphics ?? [];
  const channels: Node[] = devices.channel ?? [];
  const vnc = graphics.find((g) => g["@type"] === "vnc");
  return {
    description: textOf(domain.description),
    machine: os.type?.["@machine"] ?? "",
    arch: os.type?.["@arch"] ?? "",
    firmware:
      os["@firmware"] === "efi" || os.loader !== undefined ? "uefi" : "bios",
    cpuMode: domain.cpu?.["@mode"] ?? "",
    diskDevices: (devices.disk ?? []).map(parseDisk),
    nicDevices: (devices.interface ?? []).map(parseNic),
    graphics: graphics.map(parseGraphics),
    hasSerial: (devices.serial ?? []).length > 0 || !!devices.console?.length,
    guestAgent: channels.some(
      (c) =>
        c.target?.["@name"] === "org.qemu.guest_agent.0" &&
        c.target?.["@state"] === "connected",
    ),
    rawNvram:
      (os["@firmware"] === "efi" || os.loader !== undefined) &&
      os.nvram?.["@format"] !== "qcow2",
    vncPassword: vnc?.["@passwd"] ?? "",
  };
}

/** Why an internal snapshot won't work right now, or "" when it will. */
export function snapshotBlock(
  disks: VmDisk[],
  rawNvram = false,
  running = false,
): string {
  const bad = disks.filter(
    (d) => d.device === "disk" && !d.readOnly && d.format !== "qcow2",
  );
  if (bad.length) {
    return `Snapshots need qcow2 disks. ${bad.map((d) => d.target).join(", ")} is ${bad[0].format || "not qcow2"}.`;
  }
  return rawNvram && running
    ? "Shut this UEFI VM down to take a snapshot. Libvirt can't snapshot it while it runs."
    : "";
}

export function detailOf(
  row: VmRow,
  facts: DomainFacts,
  persistent: boolean,
  watched: boolean,
): VmDetail {
  const block = snapshotBlock(
    facts.diskDevices,
    facts.rawNvram,
    row.state !== "shutoff" && row.state !== "crashed",
  );
  const { vncPassword: _secret, rawNvram: _nvram, ...shown } = facts;
  return {
    ...row,
    ...shown,
    persistent,
    canSnapshot: !block,
    snapshotBlock: block,
    watched,
  };
}
