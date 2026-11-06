import { createHash } from "node:crypto";
import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { CloudImage, NewVm } from "../../shared/types.js";
import { VmError } from "../errors.js";
import { domainXml } from "./domain-xml.js";
import { prelude } from "./read.js";

export const CLOUD_IMAGES: CloudImage[] = [
  {
    id: "debian-13",
    name: "Debian 13",
    url: "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2",
  },
  {
    id: "debian-12",
    name: "Debian 12",
    url: "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2",
  },
  {
    id: "ubuntu-2404",
    name: "Ubuntu 24.04",
    url: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
  },
  {
    id: "ubuntu-2204",
    name: "Ubuntu 22.04",
    url: "https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img",
  },
  {
    id: "alma-9",
    name: "AlmaLinux 9",
    url: "https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2",
  },
];

export function imageUrl(vm: NewVm): string {
  if (vm.source.type !== "cloud") return "";
  const wanted = vm.source.image;
  if (!wanted) return vm.source.url;
  const found = CLOUD_IMAGES.find((image) => image.id === wanted);
  if (!found) throw new VmError("That image is not in the list");
  return found.url;
}

/** Cloud images are kept in the pool under a name from their URL. */
export function imageFileName(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `termix-image-${hash}.img`;
}

function userData(vm: NewVm): string {
  if (vm.source.type !== "cloud") return "";
  const { username, password, sshKey } = vm.source;
  const lines = [
    "#cloud-config",
    `hostname: ${vm.name.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 63)}`,
    "users:",
    `  - name: ${username}`,
    "    shell: /bin/bash",
    "    sudo: ALL=(ALL) NOPASSWD:ALL",
    `    lock_passwd: ${password ? "false" : "true"}`,
  ];
  if (password) lines.push("    passwd: __TERMIX_HASH__");
  if (sshKey) {
    lines.push("    ssh_authorized_keys:", `      - ${JSON.stringify(sshKey)}`);
  }
  if (password) lines.push("ssh_pwauth: true");
  lines.push("packages:", "  - qemu-guest-agent");
  lines.push("runcmd:", "  - [systemctl, enable, --now, qemu-guest-agent]");
  return `${lines.join("\n")}\n`;
}

function b64File(path: string, text: string): string {
  return `printf '%s' ${q(toBase64(text))} | base64 -d > ${path}`;
}

/**
 * Runs before the job is detached, so the plain password only ever lives in
 * this one stdin script. The job folder holds the hash, readable by root.
 */
export function createSetup(vm: NewVm): string {
  if (vm.source.type !== "cloud") return "";
  const write = b64File("user-data", userData(vm));
  const meta = b64File(
    "meta-data",
    `instance-id: ${vm.name}-${Date.now()}\nlocal-hostname: ${vm.name.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 63)}\n`,
  );
  if (!vm.source.password) return `${write}\n${meta}\n`;
  return `${write}
${meta}
H=$(printf '%s' ${q(toBase64(vm.source.password))} | base64 -d | openssl passwd -6 -stdin)
c=$(cat user-data)
printf '%s\\n' "\${c//__TERMIX_HASH__/$H}" > user-data
`;
}

function poolDir(pool: string): string {
  return `P=$(V pool-dumpxml ${q(pool)} | sed -n 's:.*<path>\\(.*\\)</path>.*:\\1:p' | head -n 1)
[ -d "$P" ] || { echo "Storage pool ${pool.replace(/[^\w.-]/g, "")} has no folder"; exit 1; }
`;
}

const SEED_TOOL = `ISO=$(command -v genisoimage || command -v mkisofs || command -v xorrisofs || true)
[ -n "$ISO" ] || { echo "Install genisoimage on this host to use cloud images"; exit 1; }
`;

/** The job body that makes a VM. Runs detached in the job folder. */
export function createJob(uri: string, vm: NewVm, isoPath: string): string {
  const name = vm.name;
  const disk = `${name}.qcow2`;
  const seed = `${name}-seed.iso`;
  const url = imageUrl(vm);
  const lines = [prelude(uri), poolDir(vm.pool)];
  lines.push(
    `if V dominfo ${q(name)} >/dev/null 2>&1; then echo "A VM called ${name} already exists"; exit 1; fi`,
  );
  lines.push(
    `if [ -e "$P/"${q(disk)} ]; then echo "The disk ${disk} already exists in this pool"; exit 1; fi`,
  );
  if (vm.source.type === "cloud") {
    const image = imageFileName(url);
    lines.push(SEED_TOOL);
    lines.push(`B="$P/"${q(image)}
if [ ! -f "$B" ]; then
  echo "@@phase download"
  curl -fL --retry 3 --progress-bar -o "$B.part" ${q(url)}
  mv "$B.part" "$B"
fi
echo "@@phase disk"
F=$(qemu-img info "$B" | sed -n 's/^file format: //p')
[ -n "$F" ] || { echo "Could not read the image"; exit 1; }
qemu-img create -q -f qcow2 -F "$F" -b "$B" "$P/"${q(disk)}
qemu-img resize -q "$P/"${q(disk)} ${vm.diskGib}G
echo "@@phase seed"
"$ISO" -quiet -output "$P/"${q(seed)} -volid cidata -joliet -rock user-data meta-data
chmod 644 "$P/"${q(seed)}`);
  } else {
    lines.push(`echo "@@phase disk"
qemu-img create -q -f qcow2 "$P/"${q(disk)} ${vm.diskGib}G`);
  }
  lines.push(`chmod 660 "$P/"${q(disk)}`);
  const xml = domainXml(vm, {
    disk: `__POOL__/${disk}`,
    cdroms:
      vm.source.type === "cloud"
        ? [`__POOL__/${seed}`]
        : vm.source.type === "iso"
          ? [isoPath]
          : [],
  });
  lines.push(`echo "@@phase define"
c=$(printf '%s' ${q(toBase64(xml))} | base64 -d)
printf '%s\\n' "\${c//__POOL__/$P}" > domain.xml
V define domain.xml >/dev/null
V pool-refresh ${q(vm.pool)} >/dev/null || true`);
  if (vm.autostart) lines.push(`V autostart ${q(name)} >/dev/null`);
  if (vm.start)
    lines.push(`echo "@@phase start"\nV start ${q(name)} >/dev/null`);
  lines.push(`echo "@@vm ${name}"`);
  return `${lines.join("\n")}\n`;
}
