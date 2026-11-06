import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { VmDisk } from "../../shared/types.js";
import { VmError } from "../errors.js";
import { BACKUP_DIR } from "./lifecycle.js";
import { parseXml } from "./parse.js";
import { prelude } from "./read.js";

function liveFlag(running: boolean): string {
  return running ? " --live" : "";
}

/** CPU and memory for the next boot. Limits move first when they grow. */
export function hardwareScript(
  uri: string,
  uuid: string,
  change: { vcpus?: number; memoryMib?: number },
): string {
  const u = q(uuid);
  const lines = [prelude(uri)];
  if (change.vcpus !== undefined) {
    const n = change.vcpus;
    lines.push(`m=$(V vcpucount ${u} --maximum --config)
if [ ${n} -gt "$m" ]; then V setvcpus ${u} ${n} --maximum --config; fi
V setvcpus ${u} ${n} --config
if [ ${n} -lt "$m" ]; then V setvcpus ${u} ${n} --maximum --config; fi`);
  }
  if (change.memoryMib !== undefined) {
    const kib = change.memoryMib * 1024;
    lines.push(`m=$(V dumpxml ${u} --inactive | sed -n 's:.*<memory[^>]*>\\([0-9]*\\)</memory>.*:\\1:p')
if [ ${kib} -gt "$m" ]; then V setmaxmem ${u} ${kib} --config; fi
V setmem ${u} ${kib} --config
if [ ${kib} -lt "$m" ]; then V setmaxmem ${u} ${kib} --config; fi`);
  }
  return `${lines.join("\n")}\n`;
}

/** The next free name on a bus, such as vdb. */
export function nextTarget(disks: VmDisk[], prefix: "vd" | "sd"): string {
  const used = new Set(disks.map((disk) => disk.target));
  for (let i = 0; i < 26; i++) {
    const name = `${prefix}${String.fromCharCode(97 + i)}`;
    if (!used.has(name)) return name;
  }
  throw new VmError("This VM has no free disk slots");
}

export function addDiskScript(
  uri: string,
  uuid: string,
  pool: string,
  volume: string,
  gib: number,
  target: string,
  running: boolean,
): string {
  const p = q(pool);
  const v = q(volume);
  return `${prelude(uri)}V vol-create-as ${p} ${v} ${gib}G --format qcow2 >/dev/null
path=$(V vol-path ${v} --pool ${p})
V attach-disk ${q(uuid)} "$path" ${q(target)} --driver qemu --subdriver qcow2 --targetbus virtio --config${liveFlag(running)}
`;
}

export function removeDiskScript(
  uri: string,
  uuid: string,
  target: string,
  running: boolean,
): string {
  return `${prelude(uri)}V detach-disk ${q(uuid)} ${q(target)} --config${liveFlag(running)}
`;
}

/** Puts an ISO in the VM's CD drive, adding a drive when it has none. */
export function mediaScript(
  uri: string,
  uuid: string,
  target: string,
  path: string,
  hasDrive: boolean,
): string {
  const u = q(uuid);
  const t = q(target);
  if (!path) {
    return `${prelude(uri)}V change-media ${u} ${t} --eject --config
`;
  }
  return hasDrive
    ? `${prelude(uri)}V change-media ${u} ${t} ${q(path)} --insert --config --force
`
    : `${prelude(uri)}V attach-disk ${u} ${q(path)} ${t} --type cdrom --targetbus sata --mode readonly --config
`;
}

export function addNicScript(
  uri: string,
  uuid: string,
  type: "network" | "bridge",
  source: string,
  running: boolean,
): string {
  return `${prelude(uri)}V attach-interface ${q(uuid)} ${type} ${q(source)} --model virtio --config${liveFlag(running)}
`;
}

export function removeNicScript(
  uri: string,
  uuid: string,
  type: string,
  mac: string,
  running: boolean,
): string {
  return `${prelude(uri)}V detach-interface ${q(uuid)} ${q(type)} --mac ${q(mac)} --config${liveFlag(running)}
`;
}

export function inactiveXmlScript(uri: string, uuid: string): string {
  return `${prelude(uri)}V dumpxml ${q(uuid)} --inactive --security-info
`;
}

/** Name and UUID of a domain XML, used to keep an edit on the same VM. */
export function domainIdentity(text: string): { name: string; uuid: string } {
  let domain;
  try {
    domain = parseXml(text).domain;
  } catch {
    throw new VmError("That XML can't be read");
  }
  if (!domain) throw new VmError("That XML has no domain in it");
  return {
    name: String(domain.name ?? "").trim(),
    uuid: String(domain.uuid ?? "")
      .trim()
      .toLowerCase(),
  };
}

/** Saves a backup of the old config, then defines the new one. */
export function defineXmlScript(
  uri: string,
  uuid: string,
  text: string,
): string {
  const backup = `${BACKUP_DIR}/${uuid}-$(date +%Y%m%d%H%M%S).xml`;
  return `${prelude(uri)}umask 077
mkdir -p ${BACKUP_DIR}
V dumpxml ${q(uuid)} --inactive --security-info > "${backup}"
t=$(mktemp)
trap 'rm -f "$t"' EXIT
printf '%s' ${q(toBase64(text))} | base64 -d > "$t"
V define "$t" --validate >/dev/null
`;
}
