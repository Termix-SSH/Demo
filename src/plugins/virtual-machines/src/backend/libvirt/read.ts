import { shellQuote as q } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  HypervisorStatus,
  Inventory,
  LeaseRow,
  NetworkRow,
  SnapshotRow,
  VmRow,
  VolumeRow,
} from "../../shared/types.js";
import {
  columns,
  parseAddresses,
  parseDomstats,
  parseList,
  parseNode,
  parsePools,
  parseSize,
  parseXml,
  sections,
  vmFromStats,
} from "./parse.js";

/** Starts every script. `V` is virsh on the host's connection. */
export function prelude(uri: string): string {
  return `set -e
export LC_ALL=C
V() { virsh -q -c ${q(uri)} "$@"; }
`;
}

const STAT_GROUPS = "--state --cpu-total --balloon --vcpu --interface --block";
// Per vcpu lines are most of the output and nothing here reads them.
const NO_VCPU_LINES = `grep -v '^ *vcpu\\.[0-9]' || true`;

export function statsScript(uri: string, uuid: string): string {
  return `${prelude(uri)}echo @@stats
V domstats ${STAT_GROUPS} --domain ${q(uuid)} --raw 2>/dev/null | ${NO_VCPU_LINES}
`;
}

export function inventoryScript(uri: string): string {
  return `${prelude(uri)}echo @@list
V list --all --uuid --name
echo @@auto
V list --all --autostart --name
echo @@stats
V domstats ${STAT_GROUPS} --raw | ${NO_VCPU_LINES}
echo @@node
V nodeinfo
V nodememstats
echo @@pools
V pool-list --all --details || true
for u in $(V list --uuid); do
  echo "@@ip $u"
  a=$(V domifaddr "$u" --source lease 2>/dev/null || true)
  [ -n "$(echo "$a" | tr -d '[:space:]')" ] || a=$(V domifaddr "$u" --source agent 2>/dev/null || true)
  [ -n "$(echo "$a" | tr -d '[:space:]')" ] || a=$(V domifaddr "$u" --source arp 2>/dev/null || true)
  echo "$a"
done
`;
}

export function parseInventory(stdout: string): Inventory {
  const parts = sections(stdout);
  const autostart = new Set(
    (parts.get("auto") ?? []).map((line) => line.trim()),
  );
  const stats = parseDomstats(parts.get("stats") ?? []);
  const vms: VmRow[] = parseList(parts.get("list") ?? []).map(([uuid, name]) =>
    vmFromStats(
      uuid,
      name,
      stats.get(name) ?? new Map(),
      autostart.has(name),
      parseAddresses(parts.get(`ip ${uuid}`) ?? []),
    ),
  );
  vms.sort((a, b) => a.name.localeCompare(b.name));
  return {
    vms,
    node: parseNode(parts.get("node") ?? []),
    pools: parsePools(parts.get("pools") ?? []),
    checkedAt: new Date().toISOString(),
  };
}

export function statusScript(uri: string): string {
  return `export LC_ALL=C
echo @@status
command -v virsh >/dev/null 2>&1 && echo installed=1 || echo installed=0
[ -e /dev/kvm ] && echo kvm=1 || echo kvm=0
for s in libvirtd virtqemud; do
  if systemctl is-active --quiet "$s" 2>/dev/null; then echo service=1; fi
done
pgrep -x libvirtd >/dev/null 2>&1 && echo service=1
for p in apt-get dnf yum pacman zypper apk; do
  if command -v "$p" >/dev/null 2>&1; then echo "pm=$p"; break; fi
done
for t in qemu-img genisoimage curl; do
  if ! command -v "$t" >/dev/null 2>&1; then
    if [ "$t" = genisoimage ] && { command -v mkisofs >/dev/null 2>&1 || command -v xorrisofs >/dev/null 2>&1; }; then continue; fi
    echo "missing=$t"
  fi
done
for f in /usr/share/OVMF/OVMF_CODE*.fd /usr/share/edk2/ovmf/OVMF_CODE*.fd /usr/share/edk2/x64/OVMF_CODE*.fd /usr/share/qemu/ovmf-x86_64*.bin; do
  if [ -e "$f" ]; then echo uefi=1; break; fi
done
if command -v virsh >/dev/null 2>&1; then
  if o=$(virsh -q -c ${q(uri)} version --daemon 2>&1); then
    echo connected=1
    echo @@version
    echo "$o"
  else
    echo connected=0
    echo @@error
    echo "$o"
  fi
fi
`;
}

export function parseStatus(stdout: string): HypervisorStatus {
  const parts = sections(stdout);
  const lines = parts.get("status") ?? [];
  const has = (key: string) => lines.includes(`${key}=1`);
  const version =
    /(?:daemon|library):?\s*libvirt\s+(\S+)/i.exec(
      (parts.get("version") ?? []).join("\n"),
    )?.[1] ?? "";
  return {
    installed: has("installed"),
    connected: has("connected"),
    kvm: has("kvm"),
    serviceActive: has("service"),
    version,
    packageManager:
      lines.find((line) => line.startsWith("pm="))?.slice(3) ?? "",
    missingTools: lines
      .filter((line) => line.startsWith("missing="))
      .map((line) => line.slice(8)),
    uefi: has("uefi"),
    error: (parts.get("error") ?? []).join(" ").trim(),
  };
}

export function detailScript(uri: string, uuid: string): string {
  const u = q(uuid);
  return `${prelude(uri)}echo @@stats
V domstats ${STAT_GROUPS} --domain ${u} --raw | ${NO_VCPU_LINES}
echo @@info
V dominfo ${u}
echo @@xml
V dumpxml ${u}
if [ "$(V domstate ${u})" = running ]; then
  echo @@ip
  V domifaddr ${u} --source lease 2>/dev/null || true
  V domifaddr ${u} --source agent 2>/dev/null || true
fi
`;
}

export function parseInfo(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const at = line.indexOf(":");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

export function snapshotsScript(uri: string, uuid: string): string {
  const u = q(uuid);
  return `${prelude(uri)}echo @@current
V snapshot-current ${u} --name 2>/dev/null || true
echo
echo @@list
V snapshot-list ${u} --parent
V snapshot-list ${u} --name | while IFS= read -r n; do
  [ -n "$n" ] || continue
  echo "@@about $n"
  V snapshot-dumpxml ${u} "$n" | sed -n -e '/<domain /q' -e 's:^ *<description>\\(.*\\)</description>.*:\\1:p'
done
`;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseSnapshots(stdout: string): SnapshotRow[] {
  const parts = sections(stdout);
  const current = (parts.get("current") ?? []).join("").trim();
  const rows: SnapshotRow[] = [];
  for (const line of parts.get("list") ?? []) {
    if (!line.trim()) continue;
    const [name = "", created = "", state = "", parent = ""] = columns(line);
    const match = /^(\S+) (\S+) ([+-]\d{2})(\d{2})$/.exec(created);
    const date = match
      ? new Date(`${match[1]}T${match[2]}${match[3]}:${match[4]}`)
      : null;
    rows.push({
      name,
      parent,
      current: name === current,
      state,
      description: unescapeXml(
        (parts.get(`about ${name}`) ?? []).join(" ").trim(),
      ),
      createdAt: date ? date.toISOString() : "",
    });
  }
  return rows.reverse();
}

export function volumesScript(uri: string, pool: string): string {
  return `${prelude(uri)}V pool-refresh ${q(pool)} >/dev/null 2>&1 || true
V vol-list ${q(pool)} --details
`;
}

export function parseVolumes(stdout: string): VolumeRow[] {
  const rows: VolumeRow[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const c = columns(line);
    if (c.length < 5) continue;
    rows.push({
      name: c[0],
      path: c[1],
      type: c[2],
      capacity: parseSize(c[3]),
      allocation: parseSize(c[4]),
    });
  }
  return rows;
}

export function networksScript(uri: string): string {
  return `${prelude(uri)}V net-list --all --name | while IFS= read -r n; do
  [ -n "$n" ] || continue
  echo "@@net $n"
  V net-dumpxml "$n"
  echo "@@flags $n"
  V net-info "$n"
done
`;
}

export function parseNetworks(stdout: string): NetworkRow[] {
  const parts = sections(stdout);
  const rows: NetworkRow[] = [];
  for (const [key, lines] of parts) {
    if (!key.startsWith("net ")) continue;
    const name = key.slice(4);
    const flags = (parts.get(`flags ${name}`) ?? []).map((line) =>
      line.split(/:\s+/),
    );
    const flag = (label: string) =>
      flags.find(([k]) => k === label)?.[1]?.trim() === "yes";
    const network = parseXml(lines.join("\n")).network ?? {};
    const ip = network.ip?.[0];
    const prefix = ip?.["@prefix"] ? `/${ip["@prefix"]}` : "";
    rows.push({
      name,
      active: flag("Active"),
      autostart: flag("Autostart"),
      persistent: flag("Persistent"),
      mode: network.forward?.["@mode"] ?? "isolated",
      bridge: network.bridge?.["@name"] ?? "",
      subnet: ip ? `${ip["@address"]}${prefix}` : "",
      dhcp: ip?.dhcp !== undefined,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function leasesScript(uri: string, network: string): string {
  return `${prelude(uri)}V net-dhcp-leases ${q(network)}
`;
}

export function parseLeases(stdout: string): LeaseRow[] {
  const rows: LeaseRow[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const c = columns(line);
    if (c.length < 5) continue;
    rows.push({
      expires: c[0],
      mac: c[1],
      ip: c[3],
      hostname: c[4] === "-" ? "" : c[4],
    });
  }
  return rows;
}
