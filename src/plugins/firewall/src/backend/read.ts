import type { Backend } from "../shared/types.js";
import type { HostState, Sections } from "./backends/types.js";
import { parseFirewalld } from "./backends/firewalld.js";
import { parseManaged } from "./backends/managed.js";
import { parseUfw } from "./backends/ufw.js";

import { PENDING_DIR, STATE_DIR } from "./paths.js";

// Bash for every read. Kept free of ${...} since it sits in a template literal.
export const READ_SCRIPT = `
has() { command -v "$1" >/dev/null 2>&1; }
sec() { echo "@@$1@@"; }
sec detect
echo "uid=$(id -u)"
OS=$( (. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") )
[ -n "$OS" ] || OS=$(uname -s)
echo "os=$OS"
PM=none
for p in apt-get dnf yum zypper pacman apk; do if has $p; then PM=$p; break; fi; done
echo "pm=$PM"
SD=0; if has systemctl && [ -d /run/systemd/system ]; then SD=1; fi
echo "systemd=$SD"
CLIENT=$(echo "$SSH_CLIENT" | awk '{print $1}')
P=$$
i=0
while [ -z "$CLIENT" ] && [ $i -lt 8 ]; do
  P=$(awk '{print $4}' /proc/$P/stat 2>/dev/null)
  if [ -z "$P" ] || [ "$P" = 0 ]; then break; fi
  CLIENT=$(tr '\\0' '\\n' < /proc/$P/environ 2>/dev/null | sed -n 's/^SSH_CLIENT=//p' | awk '{print $1}')
  i=$((i+1))
done
echo "client=$CLIENT"
echo "sshports=$(ss -tlnpH 2>/dev/null | grep '"sshd' | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\\n' ' ')"
UFW=0; UFW_ON=0
if has ufw; then UFW=1; if ufw status 2>/dev/null | head -n 1 | grep -q 'Status: active'; then UFW_ON=1; fi; fi
FWD=0; FWD_ON=0
if has firewall-cmd; then FWD=1; if [ "$(firewall-cmd --state 2>/dev/null)" = running ]; then FWD_ON=1; fi; fi
NFT=0; has nft && NFT=1
IPT=0; IPT_LEGACY=0
if has iptables; then IPT=1; iptables -V 2>/dev/null | grep -q legacy && IPT_LEGACY=1; fi
TXB=$(sed -n 's/^BACKEND=//p' ${STATE_DIR}/state.env 2>/dev/null)
echo "ufw=$UFW"; echo "ufw_on=$UFW_ON"; echo "firewalld=$FWD"; echo "firewalld_on=$FWD_ON"
echo "nft=$NFT"; echo "iptables=$IPT"; echo "termix=$TXB"
F2B=0; F2B_ON=0
if has fail2ban-client; then F2B=1; if fail2ban-client ping 2>/dev/null | grep -q pong; then F2B_ON=1; fi; fi
echo "fail2ban=$F2B"; echo "fail2ban_on=$F2B_ON"
if [ $UFW_ON = 1 ]; then B=ufw
elif [ $FWD_ON = 1 ]; then B=firewalld
elif [ -n "$TXB" ]; then B=$TXB
elif [ $UFW = 1 ]; then B=ufw
elif [ $FWD = 1 ]; then B=firewalld
elif [ $IPT_LEGACY = 1 ]; then B=iptables
elif [ $NFT = 1 ]; then B=nftables
elif [ $IPT = 1 ]; then B=iptables
else B=none
fi
echo "backend=$B"
sec pending
ls ${PENDING_DIR} 2>/dev/null
case "$B" in
ufw)
  sec ufw-version; ufw version 2>/dev/null | head -n 1
  sec ufw-status; ufw status verbose 2>&1 | head -n 8
  sec ufw-defaults; grep -E '^DEFAULT_(INPUT|OUTPUT|FORWARD)_POLICY=' /etc/default/ufw 2>/dev/null
  sec ufw-rules; grep '^### tuple' /etc/ufw/user.rules 2>/dev/null
  sec ufw-rules6; grep '^### tuple' /etc/ufw/user6.rules 2>/dev/null
  ;;
firewalld)
  if [ $FWD_ON = 1 ]; then C=firewall-cmd; else C=firewall-offline-cmd; fi
  if has $C; then
    sec fwd-version; firewall-cmd --version 2>/dev/null
    sec fwd-default; $C --get-default-zone 2>/dev/null
    sec fwd-zones; $C --list-all-zones 2>/dev/null
    sec fwd-services
    for s in $($C --list-all-zones 2>/dev/null | sed -n 's/^  services: //p' | tr ' ' '\\n' | sort -u); do
      echo "$s=$($C --info-service="$s" 2>/dev/null | sed -n 's/^  ports: //p')"
    done
  fi
  ;;
nftables|iptables)
  sec tx-state; cat ${STATE_DIR}/state.env 2>/dev/null
  sec tx-rules; cat ${STATE_DIR}/rules.json 2>/dev/null
  sec tx-service; [ $SD = 1 ] && systemctl is-enabled termix-firewall 2>/dev/null
  sec tx-live
  if [ "$B" = nftables ]; then
    nft list table inet termix >/dev/null 2>&1 && echo loaded
    sec tx-version; nft --version 2>/dev/null
    sec tx-other
    nft list ruleset 2>/dev/null | awk '/^table /{skip=($2" "$3=="inet termix")} /^\\t\\t[a-z]/ && !/^\\t\\t(type|policy|flags|elements|counter) / && !skip {n++} END{print n+0}'
  else
    iptables -S TERMIX-IN >/dev/null 2>&1 && echo loaded
    sec tx-version; iptables --version 2>/dev/null
    sec tx-other
    iptables-save -t filter 2>/dev/null | grep '^-A' | grep -vc 'TERMIX-'
  fi
  sec tx-docker
  iptables -S DOCKER >/dev/null 2>&1 && echo 1
  ;;
esac
exit 0
`;

/** Splits read output on `@@name@@` lines. */
export function splitSections(output: string): Sections {
  const out: Sections = {};
  let name = "";
  let lines: string[] = [];
  const flush = () => {
    if (name) out[name] = lines.join("\n").replace(/\n+$/, "");
  };
  for (const line of output.split("\n")) {
    const match = /^@@([a-z0-9-]+)@@$/.exec(line.trim());
    if (match) {
      flush();
      name = match[1];
      lines = [];
    } else {
      lines.push(line);
    }
  }
  flush();
  return out;
}

export function parseKeys(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const BACKEND_NAMES = new Set(["ufw", "firewalld", "nftables", "iptables"]);

/** Turns read output into the host's firewall state. */
export function parseState(output: string, hostPort: number): HostState {
  const sections = splitSections(output);
  const keys = parseKeys(sections.detect ?? "");
  const installed: Backend[] = [];
  if (keys.ufw === "1") installed.push("ufw");
  if (keys.firewalld === "1") installed.push("firewalld");
  if (keys.nft === "1") installed.push("nftables");
  if (keys.iptables === "1") installed.push("iptables");
  const backend = BACKEND_NAMES.has(keys.backend)
    ? (keys.backend as Backend)
    : null;
  const ports = new Set<number>();
  if (hostPort > 0) ports.add(hostPort);
  for (const part of (keys.sshports ?? "").split(/\s+/)) {
    const n = Number(part);
    if (Number.isInteger(n) && n > 0 && n < 65536) ports.add(n);
  }
  const state: HostState = {
    backend,
    installed,
    active: false,
    version: "",
    defaults: null,
    rules: [],
    zones: [],
    defaultZone: "",
    otherRules: 0,
    persistent: true,
    warnings: [],
    ssh: { ports: [...ports].sort((a, b) => a - b), client: keys.client ?? "" },
    packageManager: keys.pm && keys.pm !== "none" ? keys.pm : "",
    os: keys.os ?? "",
    root: keys.uid === "0",
    fail2ban: {
      installed: keys.fail2ban === "1",
      running: keys.fail2ban_on === "1",
    },
    pendingTokens: (sections.pending ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => /^[a-f0-9]{12,32}$/.test(s)),
    hasSystemd: keys.systemd === "1",
  };
  if (keys.ufw_on === "1" && keys.firewalld_on === "1") {
    state.warnings.push(
      "UFW and firewalld are both running. Turn one of them off.",
    );
  }
  if (backend === "ufw") parseUfw(sections, state);
  else if (backend === "firewalld")
    parseFirewalld(sections, state, keys.firewalld_on === "1");
  else if (backend === "nftables" || backend === "iptables") {
    parseManaged(sections, state, backend);
    if (keys.ufw === "1" || keys.firewalld === "1") {
      state.warnings.push(
        "UFW or firewalld is installed but off. Termix keeps its own rules here.",
      );
    }
  }
  return state;
}
