import type {
  ClientConfig,
  ClientView,
  ConfigView,
  CreateInterfaceBody,
  InterfaceView,
  UpdateInterfaceBody,
} from "../shared/types.js";
import {
  allocateIp,
  appendPeer,
  findPeer,
  interfaceInfo,
  maskSecrets,
  parseConf,
  parseLive,
  parseMeta,
  peerName,
  removePeer,
  renderClientConf,
  renderInterfaceConf,
  renderMeta,
  renderPeerBlock,
  restoreSecrets,
  setListenPort,
  setPeerDisabled,
  type Conf,
  type Live,
  type Meta,
} from "./config.js";
import { WireguardError } from "./errors.js";
import type { Remote } from "./remote.js";
import { DETECT } from "./service.js";
import {
  addressList,
  allowedList,
  b64,
  clientName,
  dnsList,
  endpoint,
  flag,
  ifaceName,
  keepalive,
  port,
} from "./validate.js";

const MAX_CONFIG_BYTES = 100_000;
const DIR = "/etc/wireguard";

/** One interface as read from the host. */
interface Loaded {
  name: string;
  active: boolean;
  enabled: boolean;
  raw: string;
  conf: Conf;
  meta: Meta;
  files: Set<string>;
  live: Live;
  publicKey: string;
}

// Lists every interface with its files, so one call reads the whole host.
function dumpScript(only: string): string {
  return `
ONLY='${only}'
for f in ${DIR}/*.conf; do
  [ -f "$f" ] || continue
  n=$(basename "$f" .conf)
  case "$n" in wgtx*) continue ;; esac
  if [ -n "$ONLY" ] && [ "$n" != "$ONLY" ]; then continue; fi
  echo "@@IF:$n"
  if ip link show "$n" >/dev/null 2>&1; then echo "@@ACTIVE:1"; else echo "@@ACTIVE:0"; fi
  if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled "wg-quick@$n" 2>/dev/null | grep -qx enabled; then echo "@@ENABLED:1"; else echo "@@ENABLED:0"; fi
  echo "@@CONF"
  cat "$f"
  echo
  echo "@@META"
  cat ${DIR}/termix/$n/meta 2>/dev/null || true
  echo "@@FILES"
  ls ${DIR}/termix/$n 2>/dev/null || true
  echo "@@PUB"
  sed -n 's/^PrivateKey *= *//p' "$f" | head -n 1 | wg pubkey 2>/dev/null || true
  echo "@@DUMP"
  wg show "$n" dump 2>/dev/null || true
  echo "@@END"
done
`;
}

function parseDump(output: string): Loaded[] {
  const out: Loaded[] = [];
  let cur: Record<string, string> | null = null;
  let section = "";
  const flush = () => {
    if (!cur) return;
    const raw = cur.CONF ?? "";
    const live = parseLive(cur.DUMP ?? "");
    out.push({
      name: cur.IF ?? "",
      active: cur.ACTIVE?.trim() === "1",
      enabled: cur.ENABLED?.trim() === "1",
      raw,
      conf: parseConf(raw),
      meta: parseMeta(cur.META ?? ""),
      files: new Set((cur.FILES ?? "").split("\n").filter(Boolean)),
      live,
      publicKey: live.publicKey || (cur.PUB ?? "").trim(),
    });
    cur = null;
  };
  for (const line of output.split("\n")) {
    const m = /^@@([A-Z]+)(?::(.*))?$/.exec(line);
    if (m) {
      if (m[1] === "IF") {
        flush();
        cur = { IF: m[2] ?? "" };
        section = "";
      } else if (m[1] === "END") {
        flush();
        section = "";
      } else if (cur) {
        section = m[1]!;
        cur[section] = m[2] !== undefined ? m[2] : "";
      }
      continue;
    }
    if (cur && section) cur[section] = `${cur[section] ?? ""}${line}\n`;
  }
  flush();
  return out;
}

/** Shell lines that make the new conf live without dropping clients. */
const SYNC = (iface: string) => `
if ip link show ${iface} >/dev/null 2>&1; then
  wg-quick strip ${iface} > "$D/live.conf"
  wg syncconf ${iface} "$D/live.conf"
fi
`;

const CHECK = `
if ! OUT=$(wg-quick strip "$T" 2>&1 >/dev/null); then
  echo "$OUT" | sed 's/^/WG_ERR:/'
  exit 3
fi
`;

interface Apply {
  iface: string;
  conf: string;
  meta?: Meta;
  /** Makes keys on the host and fills the __CPUB__, __PRIV__ tokens. */
  client?: { name: string; template: string };
  drop?: string;
}

function applyScript(o: Apply): string {
  const file = `${DIR}/${o.iface}.conf`;
  const dir = `${DIR}/termix/${o.iface}`;
  const write = o.client
    ? `
SPRIV=$(sed -n 's/^PrivateKey *= *//p' ${file} | head -n 1)
if [ -z "$SPRIV" ]; then echo "WG_ERR:The server private key was not found"; exit 4; fi
SPUB=$(echo "$SPRIV" | wg pubkey)
CPRIV=$(wg genkey)
CPUB=$(echo "$CPRIV" | wg pubkey)
PSK=$(wg genpsk)
echo '${b64(o.conf)}' | base64 -d | sed "s#__CPUB__#$CPUB#g; s#__PSK__#$PSK#g" > "$T"
echo '${b64(o.client.template)}' | base64 -d | sed "s#__PRIV__#$CPRIV#g; s#__SPUB__#$SPUB#g; s#__PSK__#$PSK#g" > "$D/client.conf"
`
    : `echo '${b64(o.conf)}' | base64 -d > "$T"\n`;
  return `
set -e
umask 077
mkdir -p ${dir}
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
T="$D/${o.iface}.conf"
${write}
${CHECK}
[ -f ${file} ] && cp -p ${file} ${file}.termix.bak
install -m 600 "$T" ${file}
${
  o.client
    ? `install -m 600 "$D/client.conf" ${dir}/${o.client.name}.conf
echo '@@CLIENT'
cat "$D/client.conf"`
    : ""
}
${o.drop ? `rm -f ${dir}/${o.drop}.conf` : ""}
${o.meta ? `echo '${b64(renderMeta(o.meta))}' | base64 -d > ${dir}/meta` : ""}
${SYNC(o.iface)}
echo done
`;
}

function createScript(
  body: {
    name: string;
    port: number;
    nat: boolean;
    forwarding: boolean;
    openFirewall: boolean;
    start: boolean;
    v6: boolean;
  },
  conf: string,
  meta: Meta,
): string {
  const file = `${DIR}/${body.name}.conf`;
  const dir = `${DIR}/termix/${body.name}`;
  return `
set -e
umask 077
${DETECT}
if [ -e ${file} ]; then echo "WG_ERR:That interface already exists"; exit 4; fi
mkdir -p ${dir}
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
T="$D/${body.name}.conf"
NIC=
${
  body.nat
    ? `if ! command -v iptables >/dev/null 2>&1; then echo "WG_ERR:NAT needs iptables on this host"; exit 5; fi
NIC=$(ip -o route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="dev") print $(i+1)}' | head -n 1)
if [ -z "$NIC" ]; then echo "WG_ERR:No outbound network interface was found for NAT"; exit 5; fi`
    : ""
}
PRIV=$(wg genkey)
echo '${b64(conf)}' | base64 -d | sed "s#__PRIV__#$PRIV#g; s#__NIC__#$NIC#g" > "$T"
${CHECK}
install -m 600 "$T" ${file}
echo '${b64(renderMeta(meta))}' | base64 -d > ${dir}/meta
${
  body.forwarding
    ? `{ echo net.ipv4.ip_forward=1; ${body.v6 ? "echo net.ipv6.conf.all.forwarding=1; " : ""}} > /etc/sysctl.d/99-termix-wireguard.conf
sysctl -p /etc/sysctl.d/99-termix-wireguard.conf >/dev/null 2>&1 || sysctl -w net.ipv4.ip_forward=1 >/dev/null`
    : ""
}
${
  body.openFirewall
    ? `if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then ufw allow ${body.port}/udp >/dev/null || true; fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port=${body.port}/udp >/dev/null || true
  firewall-cmd --reload >/dev/null || true
fi`
    : ""
}
${
  body.start
    ? `if [ "$INIT" = systemd ]; then systemctl enable --now wg-quick@${body.name}; else wg-quick up ${body.name}; fi`
    : ""
}
echo done
`;
}

export interface InterfaceManager {
  list: (hostId: number) => Promise<InterfaceView[]>;
  create: (hostId: number, body: CreateInterfaceBody) => Promise<void>;
  update: (
    hostId: number,
    iface: string,
    body: UpdateInterfaceBody,
  ) => Promise<void>;
  remove: (hostId: number, iface: string) => Promise<void>;
  clients: (hostId: number, iface: string) => Promise<ClientView[]>;
  addClient: (
    hostId: number,
    iface: string,
    body: { name: string; allowedIps?: string },
  ) => Promise<ClientConfig>;
  rotateClient: (
    hostId: number,
    iface: string,
    name: string,
  ) => Promise<ClientConfig>;
  setClientEnabled: (
    hostId: number,
    iface: string,
    name: string,
    enabled: boolean,
  ) => Promise<void>;
  removeClient: (hostId: number, iface: string, name: string) => Promise<void>;
  clientConfig: (
    hostId: number,
    iface: string,
    name: string,
  ) => Promise<ClientConfig>;
  readConfig: (hostId: number, iface: string) => Promise<ConfigView>;
  writeConfig: (hostId: number, iface: string, text: string) => Promise<void>;
}

export function createInterfaces(remote: Remote): InterfaceManager {
  async function loadAll(hostId: number): Promise<Loaded[]> {
    return parseDump(await remote.root(hostId, dumpScript("")));
  }

  async function loadOne(hostId: number, iface: string): Promise<Loaded> {
    const name = ifaceName(iface);
    const found = parseDump(await remote.root(hostId, dumpScript(name)))[0];
    if (!found) throw new WireguardError("Interface not found", 404);
    return found;
  }

  function view(l: Loaded): InterfaceView {
    const info = interfaceInfo(l.conf);
    return {
      name: l.name,
      active: l.active,
      enabled: l.enabled,
      address: info.address,
      listenPort: info.listenPort,
      publicKey: l.publicKey,
      endpoint: l.meta.endpoint,
      dns: l.meta.dns,
      allowedIps: l.meta.allowed,
      keepalive: l.meta.keepalive,
      nat: info.nat,
      clients: l.conf.peers.length,
    };
  }

  function clientTemplate(l: Loaded, ip: string, allowed?: string): string {
    if (!l.meta.endpoint) {
      throw new WireguardError(
        "Set the server endpoint on the interface first",
        400,
        { code: "endpoint" },
      );
    }
    return renderClientConf({
      ip,
      dns: l.meta.dns,
      endpoint: l.meta.endpoint,
      allowed: allowed ?? l.meta.allowed,
      keepalive: l.meta.keepalive,
    });
  }

  async function makeClient(
    hostId: number,
    l: Loaded,
    text: string,
    name: string,
    template: string,
  ): Promise<ClientConfig> {
    const out = await remote.root(
      hostId,
      applyScript({
        iface: l.name,
        conf: text,
        client: { name, template },
      }),
      120_000,
    );
    const at = out.indexOf("@@CLIENT\n");
    if (at < 0) throw new WireguardError("The client config was not made");
    const config = out
      .slice(at + "@@CLIENT\n".length)
      .replace(/\ndone\s*$/, "\n");
    return { name, config };
  }

  return {
    async list(hostId) {
      return (await loadAll(hostId)).map(view);
    },

    async create(hostId, raw) {
      const name = ifaceName(raw.name);
      const address = addressList(raw.address);
      const listenPort = port(raw.listenPort);
      const meta: Meta = {
        endpoint: endpoint(raw.endpoint),
        dns: dnsList(raw.dns),
        allowed: allowedList(raw.allowedIps),
        keepalive: keepalive(raw.keepalive),
      };
      const nat = flag(raw.nat);
      const existing = await loadAll(hostId);
      if (existing.some((l) => l.name === name)) {
        throw new WireguardError("That interface already exists");
      }
      if (
        existing.some((l) => interfaceInfo(l.conf).listenPort === listenPort)
      ) {
        throw new WireguardError("Another interface already uses that port");
      }
      const conf = renderInterfaceConf({ address, port: listenPort, nat });
      await remote.root(
        hostId,
        createScript(
          {
            name,
            port: listenPort,
            nat,
            forwarding: flag(raw.forwarding),
            openFirewall: flag(raw.openFirewall),
            start: flag(raw.start, true),
            v6: address.some((a) => a.includes(":")),
          },
          conf,
          meta,
        ),
        120_000,
      );
    },

    async update(hostId, iface, raw) {
      const l = await loadOne(hostId, iface);
      const listenPort = port(raw.listenPort);
      const meta: Meta = {
        endpoint: endpoint(raw.endpoint),
        dns: dnsList(raw.dns),
        allowed: allowedList(raw.allowedIps),
        keepalive: keepalive(raw.keepalive),
      };
      if (listenPort !== interfaceInfo(l.conf).listenPort) {
        const others = await loadAll(hostId);
        if (
          others.some(
            (o) =>
              o.name !== l.name &&
              interfaceInfo(o.conf).listenPort === listenPort,
          )
        ) {
          throw new WireguardError("Another interface already uses that port");
        }
      }
      await remote.root(
        hostId,
        applyScript({
          iface: l.name,
          conf: setListenPort(l.raw, listenPort),
          meta,
        }),
        90_000,
      );
    },

    async remove(hostId, iface) {
      const name = ifaceName(iface);
      await remote.root(
        hostId,
        `
set -e
${DETECT}
if [ ! -f ${DIR}/${name}.conf ]; then echo "WG_ERR:Interface not found"; exit 4; fi
if [ "$INIT" = systemd ]; then
  systemctl disable --now wg-quick@${name} >/dev/null 2>&1 || true
fi
if ip link show ${name} >/dev/null 2>&1; then wg-quick down ${name} || ip link delete ${name} || true; fi
rm -f ${DIR}/${name}.conf ${DIR}/${name}.conf.termix.bak
rm -rf ${DIR}/termix/${name}
echo done
`,
        90_000,
      );
    },

    async clients(hostId, iface) {
      const l = await loadOne(hostId, iface);
      return l.conf.peers.map((p) => {
        const live = l.live.peers.get(p.publicKey);
        const name = peerName(p);
        return {
          name,
          publicKey: p.publicKey,
          allowedIps: p.allowedIps,
          enabled: !p.disabled,
          managed: !!p.name,
          hasConfig: l.files.has(`${name}.conf`),
          endpoint: live?.endpoint ?? "",
          latestHandshake: live?.handshake ?? 0,
          rx: live?.rx ?? 0,
          tx: live?.tx ?? 0,
        };
      });
    },

    async addClient(hostId, iface, body) {
      const name = clientName(body.name);
      const l = await loadOne(hostId, iface);
      if (l.conf.peers.some((p) => peerName(p) === name)) {
        throw new WireguardError("A client with that name already exists");
      }
      const ip = allocateIp(l.conf);
      const allowed = body.allowedIps
        ? allowedList(body.allowedIps)
        : undefined;
      const template = clientTemplate(l, ip, allowed);
      const text = appendPeer(l.raw, renderPeerBlock(name, ip));
      return makeClient(hostId, l, text, name, template);
    },

    async rotateClient(hostId, iface, name) {
      const l = await loadOne(hostId, iface);
      const peer = findPeer(l.conf, clientName(name));
      if (!peer.name) {
        throw new WireguardError("Only clients made here can get new keys");
      }
      const ip = peer.allowedIps
        .map((a) => /^(\d+\.\d+\.\d+\.\d+)\/32$/.exec(a)?.[1])
        .find(Boolean);
      if (!ip) throw new WireguardError("The client has no IPv4 address");
      const template = clientTemplate(l, ip);
      const text = appendPeer(
        removePeer(l.raw, peer.name),
        renderPeerBlock(peer.name, ip),
      );
      return makeClient(hostId, l, text, peer.name, template);
    },

    async setClientEnabled(hostId, iface, name, enabled) {
      const l = await loadOne(hostId, iface);
      const text = setPeerDisabled(l.raw, clientName(name), !enabled);
      await remote.root(
        hostId,
        applyScript({ iface: l.name, conf: text }),
        90_000,
      );
    },

    async removeClient(hostId, iface, name) {
      const l = await loadOne(hostId, iface);
      const n = clientName(name);
      await remote.root(
        hostId,
        applyScript({
          iface: l.name,
          conf: removePeer(l.raw, n),
          drop: n,
        }),
        90_000,
      );
    },

    async clientConfig(hostId, iface, name) {
      const n = clientName(name);
      const l = await loadOne(hostId, iface);
      if (!l.files.has(`${n}.conf`)) {
        throw new WireguardError("No saved config for this client", 404);
      }
      const config = await remote.root(
        hostId,
        `cat ${DIR}/termix/${l.name}/${n}.conf`,
      );
      return { name: n, config };
    },

    async readConfig(hostId, iface) {
      const l = await loadOne(hostId, iface);
      return { text: maskSecrets(l.raw) };
    },

    async writeConfig(hostId, iface, text) {
      if (
        typeof text !== "string" ||
        Buffer.byteLength(text) > MAX_CONFIG_BYTES ||
        text.includes("\0")
      ) {
        throw new WireguardError("The config is too large or not valid");
      }
      const l = await loadOne(hostId, iface);
      const full = restoreSecrets(text.replace(/\r/g, ""), l.raw);
      await remote.root(
        hostId,
        applyScript({ iface: l.name, conf: full }),
        90_000,
      );
    },
  };
}
