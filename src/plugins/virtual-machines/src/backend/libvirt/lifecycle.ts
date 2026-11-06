import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { PowerAction, VmDisk } from "../../shared/types.js";
import { cloneXml } from "./domain-xml.js";
import { prelude } from "./read.js";

export const BACKUP_DIR = "/var/lib/termix-vms/backups";

const POWER_VERBS: Record<PowerAction, string> = {
  start: "start",
  shutdown: "shutdown",
  reboot: "reboot",
  stop: "destroy",
  suspend: "suspend",
  resume: "resume",
};

export function powerScript(
  uri: string,
  uuid: string,
  action: PowerAction,
): string {
  return `${prelude(uri)}V ${POWER_VERBS[action]} ${q(uuid)}
`;
}

export function autostartScript(
  uri: string,
  uuid: string,
  on: boolean,
): string {
  return `${prelude(uri)}V autostart ${q(uuid)}${on ? "" : " --disable"}
`;
}

/**
 * Removes a VM. Disks go by exact path and only when no other VM still
 * points at them, so a shared base image or ISO is safe. Files that libvirt
 * does not know as volumes are left alone.
 */
export function deleteScript(
  uri: string,
  uuid: string,
  name: string,
  paths: string[],
): string {
  const u = q(uuid);
  return `${prelude(uri)}if [ "$(V domstate ${u})" != "shut off" ]; then V destroy ${u} >/dev/null 2>&1 || true; fi
for s in $(V snapshot-list ${u} --name 2>/dev/null); do V snapshot-delete ${u} "$s" >/dev/null; done
V undefine ${u} --nvram --managed-save >/dev/null 2>&1 || V undefine ${u} >/dev/null
for p in ${paths.map(q).join(" ")}; do
  used=0
  for d in $(V list --all --uuid); do
    if V dumpxml "$d" | grep -qF "$p"; then used=1; fi
  done
  if [ "$used" = 1 ]; then echo "kept=$p"; continue; fi
  V vol-delete "$p" >/dev/null 2>&1 && echo "removed=$p" || echo "kept=$p"
done
echo ${q(`deleted=${name}`)}
`;
}

/** Disks removed with the VM: its own, plus the seed ISO Termix made for it. */
export function ownedPaths(disks: VmDisk[], name: string): string[] {
  return disks
    .filter(
      (disk) =>
        disk.source.startsWith("/") &&
        (disk.device === "disk" || disk.source.endsWith(`/${name}-seed.iso`)),
    )
    .map((disk) => disk.source);
}

function clonePath(path: string, name: string, target: string): string {
  const dir = path.slice(0, path.lastIndexOf("/"));
  return `${dir}/${name}-${target}.qcow2`;
}

/** The job body for a clone. Copies each disk flat, then defines the copy. */
export function cloneJob(
  uri: string,
  uuid: string,
  name: string,
  inactiveXml: string,
  disks: VmDisk[],
): string {
  const copies = disks.filter(
    (disk) => disk.device === "disk" && disk.source.startsWith("/"),
  );
  const map = new Map(
    copies.map((disk) => [
      disk.source,
      clonePath(disk.source, name, disk.target),
    ]),
  );
  const steps = copies.map((disk, index) => {
    const to = map.get(disk.source) as string;
    return `echo "@@phase clone"
echo "disk ${index + 1} of ${copies.length}"
[ ! -e ${q(to)} ] || { echo "${to} already exists"; exit 1; }
qemu-img convert -p -O qcow2 ${q(disk.source)} ${q(to)}
chmod 660 ${q(to)}`;
  });
  const xml = cloneXml(inactiveXml, name, map);
  return `${prelude(uri)}if [ "$(V domstate ${q(uuid)})" != "shut off" ]; then echo "Shut the VM down before you clone it"; exit 1; fi
if V dominfo ${q(name)} >/dev/null 2>&1; then echo "A VM called ${name} already exists"; exit 1; fi
${steps.join("\n")}
echo "@@phase define"
printf '%s' ${q(toBase64(xml))} | base64 -d > domain.xml
V define domain.xml >/dev/null
for p in $(V pool-list --name); do V pool-refresh "$p" >/dev/null 2>&1 || true; done
echo "@@vm ${name}"
`;
}
