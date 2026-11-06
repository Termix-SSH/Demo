import { VmError } from "../errors.js";

const PACKAGES: Record<string, string> = {
  "apt-get":
    "DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends qemu-system-x86 qemu-utils libvirt-daemon-system libvirt-clients ovmf genisoimage dnsmasq-base iptables curl openssl",
  dnf: "dnf install -y -q qemu-kvm qemu-img libvirt libvirt-client edk2-ovmf genisoimage dnsmasq curl openssl",
  yum: "yum install -y -q qemu-kvm qemu-img libvirt libvirt-client edk2-ovmf genisoimage dnsmasq curl openssl",
  pacman:
    "pacman -Sy --noconfirm --needed qemu-base libvirt edk2-ovmf cdrtools dnsmasq iptables-nft curl openssl",
  zypper:
    "zypper --non-interactive install qemu-kvm qemu-tools libvirt libvirt-client qemu-ovmf-x86_64 mkisofs dnsmasq curl openssl",
};

export function installScript(packageManager: string): string {
  const command = PACKAGES[packageManager];
  if (!command) {
    throw new VmError(
      "This host's package manager is not supported. Install libvirt by hand.",
    );
  }
  return `set -e
${command}
systemctl enable --now libvirtd 2>/dev/null || systemctl enable --now virtqemud.socket virtnetworkd.socket virtstoraged.socket
for i in 1 2 3 4 5 6 7 8 9 10; do
  virsh -q -c qemu:///system version --daemon >/dev/null 2>&1 && break
  sleep 1
done
virsh -q -c qemu:///system net-start default >/dev/null 2>&1 || true
virsh -q -c qemu:///system net-autostart default >/dev/null 2>&1 || true
if ! virsh -q -c qemu:///system pool-info default >/dev/null 2>&1; then
  mkdir -p /var/lib/libvirt/images
  virsh -q -c qemu:///system pool-define-as default dir --target /var/lib/libvirt/images >/dev/null
  virsh -q -c qemu:///system pool-start default >/dev/null
  virsh -q -c qemu:///system pool-autostart default >/dev/null
fi
`;
}
