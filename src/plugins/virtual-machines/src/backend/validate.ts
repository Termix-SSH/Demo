import type { NewVm, VmSource } from "../shared/types.js";
import { VmError } from "./errors.js";

const UUID_RE = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const NEW_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const TARGET_RE = /^[a-z]{2,3}[a-z0-9]{1,6}$/;
const SSH_KEY_RE =
  /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-\S+|sk-\S+) [A-Za-z0-9+/=]+( [^\r\n]*)?$/;
const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;
const PATH_RE = /^\/[^\0\r\n]{0,4000}$/;
const IFACE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,14}$/;

export function requireUuid(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!UUID_RE.test(text)) throw new VmError("That VM id is not valid");
  return text;
}

/** A name for something new. Strict, since it ends up in file names. */
export function requireNewName(value: unknown, what = "name"): string {
  const text = String(value ?? "").trim();
  if (!NEW_NAME_RE.test(text)) {
    throw new VmError(
      `The ${what} can use letters, numbers, dots, dashes and underscores`,
    );
  }
  return text;
}

/** A name that already exists on the host. It may have spaces, and is quoted. */
export function requireName(value: unknown, what = "name"): string {
  const text = String(value ?? "");
  if (
    !text ||
    text.length > 128 ||
    text.startsWith("-") ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f/]/.test(text)
  ) {
    throw new VmError(`That ${what} is not valid`);
  }
  return text;
}

export function requireMac(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!MAC_RE.test(text)) throw new VmError("That MAC address is not valid");
  return text.toLowerCase();
}

export function requireTarget(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!TARGET_RE.test(text)) throw new VmError("That disk is not valid");
  return text;
}

export function requirePath(value: unknown): string {
  const text = String(value ?? "");
  if (!PATH_RE.test(text) || text.split("/").includes("..")) {
    throw new VmError("That path is not valid");
  }
  return text;
}

export function requireInterface(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!IFACE_RE.test(text)) throw new VmError("That interface is not valid");
  return text;
}

export function requireInt(
  value: unknown,
  min: number,
  max: number,
  what: string,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new VmError(`${what} must be from ${min} to ${max}`);
  }
  return number;
}

export function requireUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new VmError("That URL is not valid");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new VmError("The URL must start with http or https");
  }
  return text;
}

/** An IPv4 network for a new libvirt network, such as 192.168.50.1/24. */
export function parseCidr(value: unknown): {
  address: string;
  netmask: string;
  dhcpStart: string;
  dhcpEnd: string;
} {
  const match = CIDR_RE.exec(String(value ?? "").trim());
  if (!match) throw new VmError("Use an address like 192.168.50.1/24");
  const parts = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (parts.some((part) => part > 255) || prefix < 8 || prefix > 30) {
    throw new VmError("Use an address like 192.168.50.1/24");
  }
  const toNumber = (p: number[]) =>
    ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  const toText = (n: number) =>
    [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  const address = toNumber(parts);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if (address === network || address === broadcast) {
    throw new VmError("Use the bridge's own address, like 192.168.50.1/24");
  }
  let dhcpStart = address + 1;
  const dhcpEnd = broadcast - 1;
  if (dhcpStart > dhcpEnd) dhcpStart = network + 1;
  return {
    address: toText(address),
    netmask: toText(mask),
    dhcpStart: toText(dhcpStart),
    dhcpEnd: toText(dhcpEnd),
  };
}

function parseSource(value: unknown): VmSource {
  const source = (value ?? {}) as Record<string, unknown>;
  if (source.type === "iso") {
    return { type: "iso", volume: requireName(source.volume, "ISO") };
  }
  if (source.type === "blank") return { type: "blank" };
  if (source.type !== "cloud") throw new VmError("Pick how to install the VM");
  const username = String(source.username ?? "").trim();
  if (!USER_RE.test(username)) {
    throw new VmError("The login name can use lowercase letters and numbers");
  }
  const password = String(source.password ?? "");
  if (/[\r\n\0]/.test(password)) {
    throw new VmError("The password can't contain a line break");
  }
  const sshKey = String(source.sshKey ?? "").trim();
  if (sshKey && !SSH_KEY_RE.test(sshKey)) {
    throw new VmError("That SSH key is not valid");
  }
  if (!password && !sshKey) {
    throw new VmError("Give the login a password or an SSH key");
  }
  const image = String(source.image ?? "");
  return {
    type: "cloud",
    image,
    url: image ? "" : requireUrl(source.url),
    username,
    password,
    sshKey,
  };
}

export function parseNewVm(body: Record<string, unknown>): NewVm {
  const network = (body.network ?? {}) as Record<string, unknown>;
  if (network.type !== "network" && network.type !== "bridge") {
    throw new VmError("Pick a network");
  }
  return {
    name: requireNewName(body.name, "VM name"),
    vcpus: requireInt(body.vcpus, 1, 256, "CPUs"),
    memoryMib: requireInt(body.memoryMib, 64, 4_194_304, "Memory"),
    diskGib: requireInt(body.diskGib, 1, 65_536, "Disk size"),
    pool: requireName(body.pool, "storage pool"),
    firmware: body.firmware === "uefi" ? "uefi" : "bios",
    network: {
      type: network.type,
      source:
        network.type === "bridge"
          ? requireInterface(network.source)
          : requireName(network.source, "network"),
    },
    source: parseSource(body.source),
    autostart: body.autostart === true,
    start: body.start !== false,
  };
}
