import type { NewVm } from "../../shared/types.js";
import type { parseCidr } from "../validate.js";

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DomainDisks {
  disk: string;
  /** Read only images on SATA, the installer ISO or the cloud-init seed. */
  cdroms: string[];
}

/** Domain XML for a new VM: q35, virtio, serial console, VNC on loopback. */
export function domainXml(vm: NewVm, disks: DomainDisks): string {
  const firmware = vm.firmware === "uefi" ? " firmware='efi'" : "";
  const nic =
    vm.network.type === "bridge"
      ? `<interface type='bridge'><source bridge='${esc(vm.network.source)}'/><model type='virtio'/></interface>`
      : `<interface type='network'><source network='${esc(vm.network.source)}'/><model type='virtio'/></interface>`;
  const cdroms = disks.cdroms.map(
    (path, index) =>
      `<disk type='file' device='cdrom'><driver name='qemu' type='raw'/><source file='${esc(path)}'/><target dev='sd${String.fromCharCode(97 + index)}' bus='sata'/><readonly/></disk>`,
  );
  const boot =
    vm.source.type === "iso"
      ? "<boot dev='hd'/><boot dev='cdrom'/>"
      : "<boot dev='hd'/>";
  return `<domain type='kvm'>
  <name>${esc(vm.name)}</name>
  <memory unit='MiB'>${vm.memoryMib}</memory>
  <vcpu>${vm.vcpus}</vcpu>
  <os${firmware}><type arch='x86_64' machine='q35'>hvm</type>${boot}</os>
  <features><acpi/><apic/></features>
  <cpu mode='host-passthrough'/>
  <clock offset='utc'/>
  <on_crash>restart</on_crash>
  <devices>
    <disk type='file' device='disk'><driver name='qemu' type='qcow2' discard='unmap'/><source file='${esc(disks.disk)}'/><target dev='vda' bus='virtio'/></disk>
    ${cdroms.join("\n    ")}
    ${nic}
    <serial type='pty'/>
    <console type='pty'/>
    <channel type='unix'><target type='virtio' name='org.qemu.guest_agent.0'/></channel>
    <graphics type='vnc' autoport='yes' listen='127.0.0.1'/>
    <video><model type='virtio'/></video>
    <input type='tablet' bus='usb'/>
    <rng model='virtio'><backend model='random'>/dev/urandom</backend></rng>
  </devices>
</domain>
`;
}

export function dirPoolXml(name: string, path: string): string {
  return `<pool type='dir'>
  <name>${esc(name)}</name>
  <target><path>${esc(path)}</path></target>
</pool>
`;
}

export type NetworkKind =
  | { type: "nat" | "isolated"; ip: ReturnType<typeof parseCidr> }
  | { type: "bridge"; bridge: string };

export function networkXml(name: string, kind: NetworkKind): string {
  if (kind.type === "bridge") {
    return `<network>
  <name>${esc(name)}</name>
  <forward mode='bridge'/>
  <bridge name='${esc(kind.bridge)}'/>
</network>
`;
  }
  const forward = kind.type === "nat" ? "\n  <forward mode='nat'/>" : "";
  return `<network>
  <name>${esc(name)}</name>${forward}
  <ip address='${kind.ip.address}' netmask='${kind.ip.netmask}'>
    <dhcp><range start='${kind.ip.dhcpStart}' end='${kind.ip.dhcpEnd}'/></dhcp>
  </ip>
</network>
`;
}

/** A copy of inactive domain XML with a new name, disks and no fixed ids. */
export function cloneXml(
  source: string,
  name: string,
  disks: Map<string, string>,
): string {
  let out = source
    .replace(/<name>[^<]*<\/name>/, `<name>${esc(name)}</name>`)
    .replace(/\s*<uuid>[^<]*<\/uuid>/, "")
    .replace(/\s*<mac address=(['"])[^'"]*\1\s*\/>/g, "")
    .replace(/\s*<nvram[^>]*>[^<]*<\/nvram>/, "")
    .replace(/\s*<nvram[^>]*\/>/, "");
  for (const [from, to] of disks) {
    out = out.split(`file='${esc(from)}'`).join(`file='${esc(to)}'`);
    out = out.split(`file="${esc(from)}"`).join(`file='${esc(to)}'`);
  }
  return out;
}

/** Swaps a SPICE display for VNC and drops the devices that need SPICE. */
export function spiceToVnc(source: string): string {
  return source
    .replace(
      /<graphics\b[^>]*type=(['"])spice\1[^>]*?(\/>|>[\s\S]*?<\/graphics>)/g,
      "<graphics type='vnc' autoport='yes' listen='127.0.0.1'/>",
    )
    .replace(/\s*<channel\b[^>]*type=(['"])spicevmc\1[\s\S]*?<\/channel>/g, "")
    .replace(
      /\s*<redirdev\b[^>]*type=(['"])spicevmc\1[\s\S]*?<\/redirdev>/g,
      "",
    )
    .replace(/\s*<audio\b[^>]*type=(['"])spice\1[^>]*\/>/g, "");
}
