import { WireguardError } from "./errors.js";

const MARK = /^#\s*termix:client\s+(\S+)(\s+disabled)?\s*$/;
const OFF = "#- ";
const KEEP = "__KEEP__";

export interface Peer {
  /** From the termix:client marker. Empty for peers made by hand. */
  name: string;
  disabled: boolean;
  lines: string[];
  publicKey: string;
  presharedKey: string;
  allowedIps: string[];
  keepalive: number;
}

export interface Conf {
  head: string[];
  peers: Peer[];
}

export interface Meta {
  endpoint: string;
  dns: string;
  allowed: string;
  keepalive: number;
}

export interface Live {
  publicKey: string;
  peers: Map<
    string,
    { endpoint: string; handshake: number; rx: number; tx: number }
  >;
}

/** Reads key = value from a line, also from a turned off (#- ) line. */
function field(line: string): [string, string] | null {
  const body = line.startsWith(OFF) ? line.slice(OFF.length) : line;
  if (body.trimStart().startsWith("#")) return null;
  const m = /^\s*(\w+)\s*=\s*(.*?)\s*$/.exec(body);
  return m ? [m[1]!.toLowerCase(), m[2] ?? ""] : null;
}

function readPeer(name: string, disabled: boolean, lines: string[]): Peer {
  const peer: Peer = {
    name,
    disabled,
    lines,
    publicKey: "",
    presharedKey: "",
    allowedIps: [],
    keepalive: 0,
  };
  for (const line of lines) {
    const f = field(line);
    if (!f) continue;
    if (f[0] === "publickey") peer.publicKey = f[1];
    else if (f[0] === "presharedkey") peer.presharedKey = f[1];
    else if (f[0] === "allowedips") {
      peer.allowedIps.push(...f[1].split(/[\s,]+/).filter(Boolean));
    } else if (f[0] === "persistentkeepalive") {
      peer.keepalive = Number(f[1]) || 0;
    }
  }
  return peer;
}

interface Block {
  name: string;
  disabled: boolean;
  lines: string[];
  waiting: boolean;
}

export function parseConf(text: string): Conf {
  const head: string[] = [];
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const mark = MARK.exec(line);
    if (mark) {
      cur = {
        name: mark[1]!,
        disabled: !!mark[2],
        lines: [line],
        waiting: true,
      };
      blocks.push(cur);
      continue;
    }
    const body = line.startsWith(OFF) ? line.slice(OFF.length) : line;
    if (/^\[peer\]\s*$/i.test(body.trim())) {
      if (!cur || !cur.waiting) {
        cur = {
          name: "",
          disabled: line.startsWith(OFF),
          lines: [],
          waiting: false,
        };
        blocks.push(cur);
      }
      cur.waiting = false;
      cur.lines.push(line);
      continue;
    }
    if (cur) cur.lines.push(line);
    else head.push(line);
  }
  return {
    head,
    peers: blocks.map((b) => readPeer(b.name, b.disabled, b.lines)),
  };
}

export function renderConf(conf: Conf): string {
  return [...conf.head, ...conf.peers.flatMap((p) => p.lines)].join("\n");
}

export function peerName(peer: Peer): string {
  if (peer.name) return peer.name;
  return `peer-${peer.publicKey.replace(/[^A-Za-z0-9]/g, "x").slice(0, 8)}`;
}

export interface InterfaceInfo {
  address: string[];
  listenPort: number;
  dns: string;
  privateKey: string;
  nat: boolean;
}

export function interfaceInfo(conf: Conf): InterfaceInfo {
  const info: InterfaceInfo = {
    address: [],
    listenPort: 0,
    dns: "",
    privateKey: "",
    nat: false,
  };
  for (const line of conf.head) {
    const f = field(line);
    if (!f) continue;
    if (f[0] === "address") {
      info.address.push(...f[1].split(/[\s,]+/).filter(Boolean));
    } else if (f[0] === "listenport") info.listenPort = Number(f[1]) || 0;
    else if (f[0] === "dns") info.dns = f[1];
    else if (f[0] === "privatekey") info.privateKey = f[1];
    else if (f[0] === "postup" && /MASQUERADE/.test(f[1])) info.nat = true;
  }
  return info;
}

/** Sets or adds ListenPort in the interface section. */
export function setListenPort(text: string, port: number): string {
  const conf = parseConf(text);
  let done = false;
  conf.head = conf.head.map((line) => {
    const f = field(line);
    if (f && f[0] === "listenport") {
      done = true;
      return `ListenPort = ${port}`;
    }
    return line;
  });
  if (!done) {
    const at = conf.head.findIndex((l) => /^\[interface\]/i.test(l.trim()));
    conf.head.splice(at + 1, 0, `ListenPort = ${port}`);
  }
  return renderConf(conf);
}

export function findPeer(conf: Conf, name: string): Peer {
  const peer = conf.peers.find((p) => peerName(p) === name);
  if (!peer) throw new WireguardError("Client not found", 404);
  return peer;
}

export function removePeer(text: string, name: string): string {
  const conf = parseConf(text);
  const peer = findPeer(conf, name);
  conf.peers = conf.peers.filter((p) => p !== peer);
  return renderConf(conf);
}

/** Comments a peer block out, or brings it back. */
export function setPeerDisabled(
  text: string,
  name: string,
  disabled: boolean,
): string {
  const conf = parseConf(text);
  const peer = findPeer(conf, name);
  const lines = peer.lines.filter((l) => !MARK.test(l));
  const next = lines.map((line) => {
    if (!line.trim()) return line;
    if (disabled) {
      return line.startsWith("#") ? line : `${OFF}${line}`;
    }
    return line.startsWith(OFF) ? line.slice(OFF.length) : line;
  });
  const marker = `# termix:client ${name}${disabled ? " disabled" : ""}`;
  peer.lines = [marker, ...next];
  return renderConf(conf);
}

export function appendPeer(text: string, block: string): string {
  return `${text.replace(/\s+$/, "")}\n\n${block.replace(/\s+$/, "")}\n`;
}

/** Hides keys so the raw editor never shows them. */
export function maskSecrets(text: string): string {
  return text.replace(
    /^((?:#- )?(?:PrivateKey|PresharedKey)\s*=\s*)\S.*$/gim,
    `$1${KEEP}`,
  );
}

/** Puts the real keys back where the editor still has the placeholder. */
export function restoreSecrets(text: string, old: string): string {
  if (!text.includes(KEEP)) return text;
  const before = parseConf(old);
  const conf = parseConf(text);
  const fill = (lines: string[], value: string): string[] =>
    lines.map((line) => {
      if (!line.includes(KEEP)) return line;
      if (!value) {
        throw new WireguardError(
          "A hidden key has nothing to keep. Paste the real key instead.",
        );
      }
      return line.replace(KEEP, value);
    });
  conf.head = fill(conf.head, interfaceInfo(before).privateKey);
  conf.peers = conf.peers.map((p) => {
    if (!p.lines.some((l) => l.includes(KEEP))) return p;
    const match = before.peers.find((o) => o.publicKey === p.publicKey);
    return readPeer(
      p.name,
      p.disabled,
      fill(p.lines, match?.presharedKey ?? ""),
    );
  });
  return renderConf(conf);
}

function ipToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");
}

/** The lowest free client address in the interface's IPv4 subnet. */
export function allocateIp(conf: Conf): string {
  const info = interfaceInfo(conf);
  const cidr = info.address.find((a) => /^\d+\.\d+\.\d+\.\d+\//.test(a));
  if (!cidr) throw new WireguardError("The interface has no IPv4 address");
  const [ip = "", bitsText = "24"] = cidr.split("/");
  const size = 2 ** (32 - Number(bitsText));
  const base = Math.floor(ipToInt(ip) / size) * size;
  const used = new Set<number>([ipToInt(ip)]);
  for (const peer of conf.peers) {
    for (const allowed of peer.allowedIps) {
      const m = /^(\d+\.\d+\.\d+\.\d+)\/32$/.exec(allowed);
      if (m) used.add(ipToInt(m[1]!));
    }
  }
  for (let n = base + 1; n < base + size - 1; n++) {
    if (!used.has(n)) return intToIp(n);
  }
  throw new WireguardError("The subnet has no free addresses left");
}

/** The server config with tokens the create script fills in on the host. */
export function renderInterfaceConf(o: {
  address: string[];
  port: number;
  nat: boolean;
}): string {
  const lines = [
    "[Interface]",
    `Address = ${o.address.join(", ")}`,
    `ListenPort = ${o.port}`,
    "PrivateKey = __PRIV__",
  ];
  if (o.nat) {
    const v6 = o.address.some((a) => a.includes(":"));
    const rules = (flag: "-A" | "-D") =>
      ["iptables", ...(v6 ? ["ip6tables"] : [])]
        .map(
          (bin) =>
            `${bin} ${flag} FORWARD -i %i -j ACCEPT; ${bin} ${flag} FORWARD -o %i -j ACCEPT; ${bin} -t nat ${flag} POSTROUTING -o __NIC__ -j MASQUERADE`,
        )
        .join("; ");
    lines.push(`PostUp = ${rules("-A")}`, `PostDown = ${rules("-D")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderPeerBlock(name: string, ip: string): string {
  return [
    `# termix:client ${name}`,
    "[Peer]",
    "PublicKey = __CPUB__",
    "PresharedKey = __PSK__",
    `AllowedIPs = ${ip}/32`,
  ].join("\n");
}

export function renderClientConf(o: {
  ip: string;
  dns: string;
  endpoint: string;
  allowed: string;
  keepalive: number;
}): string {
  const lines = [
    "[Interface]",
    "PrivateKey = __PRIV__",
    `Address = ${o.ip}/32`,
  ];
  if (o.dns) lines.push(`DNS = ${o.dns}`);
  lines.push(
    "",
    "[Peer]",
    "PublicKey = __SPUB__",
    "PresharedKey = __PSK__",
    `Endpoint = ${o.endpoint}`,
    `AllowedIPs = ${o.allowed}`,
  );
  if (o.keepalive > 0) lines.push(`PersistentKeepalive = ${o.keepalive}`);
  return `${lines.join("\n")}\n`;
}

export function parseMeta(text: string): Meta {
  const meta: Meta = {
    endpoint: "",
    dns: "",
    allowed: "0.0.0.0/0, ::/0",
    keepalive: 25,
  };
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "endpoint") meta.endpoint = value;
    else if (key === "dns") meta.dns = value;
    else if (key === "allowed") meta.allowed = value || meta.allowed;
    else if (key === "keepalive") meta.keepalive = Number(value) || 0;
  }
  return meta;
}

export function renderMeta(meta: Meta): string {
  return [
    `endpoint=${meta.endpoint}`,
    `dns=${meta.dns}`,
    `allowed=${meta.allowed}`,
    `keepalive=${meta.keepalive}`,
    "",
  ].join("\n");
}

/** Reads `wg show <if> dump`. */
export function parseLive(dump: string): Live {
  const live: Live = { publicKey: "", peers: new Map() };
  const rows = dump.split("\n").filter((l) => l.trim());
  rows.forEach((row, index) => {
    const c = row.split("\t");
    if (index === 0) {
      live.publicKey = c[1] ?? "";
      return;
    }
    live.peers.set(c[0] ?? "", {
      endpoint: c[2] && c[2] !== "(none)" ? c[2] : "",
      handshake: Number(c[4]) || 0,
      rx: Number(c[5]) || 0,
      tx: Number(c[6]) || 0,
    });
  });
  return live;
}
