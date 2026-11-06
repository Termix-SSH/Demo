import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class BlockedTargetError extends Error {
  readonly code = "private_target";
  constructor(target: string) {
    super(`${target} is a private address, which you are not allowed to check`);
  }
}

export interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

export type Lookup = (
  host: string,
) => Promise<Array<{ address: string; family: number }>>;

const lookupAll: Lookup = (host) => dnsLookup(host, { all: true });

function v4Number(ip: string): number {
  return ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);
}

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function privateV4(ip: string): boolean {
  const value = v4Number(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4Number(base);
    return value >= start && value < start + size;
  });
}

/** Expands an IPv6 address to its 16 bytes. */
function v6Bytes(ip: string): number[] {
  let text = ip.split("%")[0].toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const value = v4Number(dotted[1]);
    const high = Math.floor(value / 65536).toString(16);
    const low = (value % 65536).toString(16);
    text = text.slice(0, dotted.index) + `${high}:${low}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = text.includes("::") ? 8 - left.length - right.length : 0;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  return groups.flatMap((group) => {
    const value = parseInt(group, 16) || 0;
    return [value >> 8, value & 255];
  });
}

/** True for anything that isn't a plain public address. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip.split("%")[0]);
  if (kind === 4) return privateV4(ip);
  if (kind !== 6) return true;
  const bytes = v6Bytes(ip);
  const zeros = bytes.slice(0, 15).every((value) => value === 0);
  if (zeros && (bytes[15] === 0 || bytes[15] === 1)) return true;
  // fc00::/7, fe80::/10, ff00::/8
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  if (bytes[0] === 0xff) return true;
  // ::ffff:a.b.c.d, ::a.b.c.d and 64:ff9b::a.b.c.d carry an IPv4 address.
  const mapped =
    bytes.slice(0, 10).every((value) => value === 0) &&
    ((bytes[10] === 0xff && bytes[11] === 0xff) ||
      (bytes[10] === 0 && bytes[11] === 0));
  const nat64 =
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b;
  if (mapped || nat64) return privateV4(bytes.slice(12).join("."));
  return false;
}

/**
 * Picks the address a socket should connect to. Every answer is checked, so a
 * name with one public and one private address is refused. The caller connects
 * to the address it gets back, so the name can't change between check and use.
 */
export async function resolveTarget(
  host: string,
  allowPrivate: boolean,
  lookup: Lookup = lookupAll,
): Promise<ResolvedTarget> {
  const bare = host.replace(/^\[|\]$/g, "");
  const literal = isIP(bare);
  const answers = literal
    ? [{ address: bare, family: literal }]
    : await lookup(bare);
  if (answers.length === 0) throw new Error(`${host} did not resolve`);
  if (!allowPrivate && answers.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedTargetError(host);
  }
  const chosen = answers[0];
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}
