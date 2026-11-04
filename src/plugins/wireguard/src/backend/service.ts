import type { WireguardStatus } from "../shared/types.js";
import { WireguardError } from "./errors.js";
import { parseKeys, type Remote } from "./remote.js";
import { ifaceName } from "./validate.js";

// Keep bash parameter expansions out of these strings: they sit inside
// template literals.

export const SERVICE_ACTIONS = [
  "start",
  "stop",
  "restart",
  "enable",
  "disable",
] as const;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];

/** Sets INIT to systemd when systemd runs, else other. */
export const DETECT = `
INIT=other
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then INIT=systemd; fi
`;

const STATUS_SCRIPT = `
echo "kernel=$(uname -s 2>/dev/null)"
if { [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; }; then echo root=1; else echo root=0; fi
. /etc/os-release 2>/dev/null
echo "os=$PRETTY_NAME"
pm=none
for c in apt-get dnf yum pacman apk zypper; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done
echo "pm=$pm"
if command -v wg >/dev/null 2>&1 && command -v wg-quick >/dev/null 2>&1; then
  echo installed=1
  echo "version=$(wg --version 2>/dev/null | head -n1 | awk '{print $1" "$2}')"
else
  echo installed=0
fi
${DETECT}
echo "init=$INIT"
if [ "$(cat /proc/sys/net/ipv4/ip_forward 2>/dev/null)" = 1 ]; then echo ipforward=1; else echo ipforward=0; fi
fw=none
if command -v ufw >/dev/null 2>&1; then fw=ufw
elif command -v firewall-cmd >/dev/null 2>&1; then fw=firewalld; fi
echo "firewall=$fw"
command -v iptables >/dev/null 2>&1 && echo iptables=1 || echo iptables=0
`;

const INSTALL_SCRIPT = `
set -e
pm=none
for c in apt-get dnf yum pacman apk zypper; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done
case "$pm" in
  apt-get) export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y wireguard wireguard-tools iptables ;;
  dnf) dnf install -y wireguard-tools iptables ;;
  yum) yum install -y wireguard-tools iptables ;;
  pacman) pacman -S --noconfirm --needed wireguard-tools iptables ;;
  apk) apk add wireguard-tools iptables ;;
  zypper) zypper --non-interactive install wireguard-tools iptables ;;
  *) echo "WG_ERR:No supported package manager found on this host"; exit 5 ;;
esac
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard
modprobe wireguard 2>/dev/null || true
if ! command -v wg-quick >/dev/null 2>&1; then
  echo "WG_ERR:wg-quick is still missing after the install"
  exit 6
fi
echo done
`;

export function serviceScript(iface: string, action: ServiceAction): string {
  const unit = `wg-quick@${iface}`;
  return `
set -e
${DETECT}
if [ "$INIT" = systemd ]; then
  systemctl ${action} ${unit}
else
  case "${action}" in
    start) wg-quick up ${iface} ;;
    stop) wg-quick down ${iface} ;;
    restart) wg-quick down ${iface} || true; wg-quick up ${iface} ;;
    *) echo "WG_ERR:Boot start needs systemd on this host"; exit 6 ;;
  esac
fi
echo done
`;
}

export interface WireguardService {
  status: (hostId: number) => Promise<WireguardStatus>;
  install: (hostId: number) => Promise<void>;
  act: (hostId: number, iface: string, action: ServiceAction) => Promise<void>;
  logs: (hostId: number, lines: number) => Promise<string>;
}

export function createService(remote: Remote): WireguardService {
  return {
    async status(hostId) {
      const k = parseKeys(await remote.plain(hostId, STATUS_SCRIPT));
      if (k.kernel && k.kernel !== "Linux") {
        throw new WireguardError(
          "WireGuard can only be managed on Linux hosts",
        );
      }
      return {
        root: k.root === "1",
        os: k.os ?? "",
        packageManager: k.pm ?? "none",
        installed: k.installed === "1",
        version: k.version ?? "",
        init: k.init ?? "other",
        ipForward: k.ipforward === "1",
        firewall: k.firewall ?? "none",
        iptables: k.iptables === "1",
      };
    },

    async install(hostId) {
      await remote.root(hostId, INSTALL_SCRIPT, 600_000);
    },

    async act(hostId, iface, action) {
      const name = ifaceName(iface);
      await remote.root(hostId, serviceScript(name, action), 90_000);
    },

    async logs(hostId, lines) {
      const n = Math.min(Math.max(Math.floor(lines) || 200, 20), 1000);
      return remote.root(
        hostId,
        `
if command -v journalctl >/dev/null 2>&1; then
  journalctl -u 'wg-quick@*' -n ${n} --no-pager 2>/dev/null || true
else
  dmesg 2>/dev/null | grep -i wireguard | tail -n ${n} || true
fi
`,
      );
    },
  };
}
