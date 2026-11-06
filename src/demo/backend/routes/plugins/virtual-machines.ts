import { del, get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/virtual-machines";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const GIB = 1_073_741_824;
const MIB_KIB = 1024;

type State = "running" | "shutoff" | "paused" | "crashed";

interface Vm {
  uuid: string;
  name: string;
  state: State;
  vcpus: number;
  memoryMib: number;
  autostart: boolean;
  ips: string[];
  firmware: "bios" | "uefi";
  diskGib: number;
}

const vms = value<Vm[]>("vm-list", () => [
  {
    uuid: "5c1f2a40-8d11-4a3e-9c3b-1a2b3c4d5e01",
    name: "debian-web",
    state: "running",
    vcpus: 2,
    memoryMib: 2048,
    autostart: true,
    ips: ["192.168.122.41"],
    firmware: "uefi",
    diskGib: 20,
  },
  {
    uuid: "5c1f2a40-8d11-4a3e-9c3b-1a2b3c4d5e02",
    name: "win11-test",
    state: "shutoff",
    vcpus: 4,
    memoryMib: 8192,
    autostart: false,
    ips: [],
    firmware: "uefi",
    diskGib: 80,
  },
  {
    uuid: "5c1f2a40-8d11-4a3e-9c3b-1a2b3c4d5e03",
    name: "build-runner",
    state: "running",
    vcpus: 4,
    memoryMib: 4096,
    autostart: true,
    ips: ["192.168.122.57"],
    firmware: "bios",
    diskGib: 40,
  },
]);

const row = (v: Vm) => {
  const on = v.state === "running";
  return {
    uuid: v.uuid,
    name: v.name,
    state: v.state,
    reason: 1,
    vcpus: v.vcpus,
    memoryKib: v.memoryMib * MIB_KIB,
    maxMemoryKib: v.memoryMib * MIB_KIB,
    usedKib: on ? Math.round(v.memoryMib * MIB_KIB * 0.42) : null,
    autostart: v.autostart,
    cpuTimeNs: on ? 41_000_000_000_000 : 0,
    disks: [
      {
        target: "vda",
        path: `/var/lib/libvirt/images/${v.name}.qcow2`,
        capacity: v.diskGib * GIB,
        allocation: Math.round(v.diskGib * GIB * 0.35),
        readBytes: 3 * GIB,
        writeBytes: 5 * GIB,
      },
    ],
    nics: [{ name: "vnet0", rxBytes: 2 * GIB, txBytes: GIB }],
    ips: v.ips,
  };
};

const pools = [
  {
    name: "default",
    state: "running",
    autostart: true,
    capacity: 500 * GIB,
    allocation: 142 * GIB,
    available: 358 * GIB,
  },
  {
    name: "isos",
    state: "running",
    autostart: true,
    capacity: 200 * GIB,
    allocation: 12 * GIB,
    available: 188 * GIB,
  },
];

const inventory = () => ({
  vms: vms.get().map(row),
  node: { cpus: 16, memoryKib: (64 * GIB) / 1024, freeKib: (38 * GIB) / 1024 },
  pools,
  checkedAt: ago(0),
});

get(`${P}/summary`, () => {
  const list = vms.get();
  return [
    {
      hostId: 7,
      hostName: "proxmox",
      total: list.length,
      running: list.filter((v) => v.state === "running").length,
      stopped: list.filter((v) => v.state === "shutoff").length,
      crashed: list.filter((v) => v.state === "crashed").length,
      vms: list.map(row),
      pools,
      error: "",
      checkedAt: ago(0),
    },
  ];
});
get(`${P}/images`, () => [
  {
    id: "debian-13",
    name: "Debian 13 (cloud)",
    url: "https://cloud.debian.org/images/cloud/trixie/latest/debian-13-genericcloud-amd64.qcow2",
  },
  {
    id: "ubuntu-24",
    name: "Ubuntu 24.04 (cloud)",
    url: "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
  },
]);

const base = `${P}/hosts/:host`;
get(`${base}/status`, () => ({
  installed: true,
  connected: true,
  kvm: true,
  serviceActive: true,
  version: "libvirt 11.3.0",
  packageManager: "apt",
  missingTools: [],
  uefi: true,
  error: "",
}));
post(`${base}/install`, () => ({ ok: true }));
get(`${base}/inventory`, () => inventory());
post(`${base}/vms`, (req) => {
  const b = req.body as {
    name: string;
    vcpus: number;
    memoryMib: number;
    diskGib: number;
    firmware: "bios" | "uefi";
  };
  vms.update((l) => [
    ...l,
    {
      uuid: `5c1f2a40-8d11-4a3e-9c3b-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
      name: b.name,
      state: "running",
      vcpus: b.vcpus,
      memoryMib: b.memoryMib,
      autostart: false,
      ips: [],
      firmware: b.firmware,
      diskGib: b.diskGib,
    },
  ]);
  return job("create", `Create ${b.name}`, b.name);
});

const find = (uuid: string) =>
  vms.get().find((v) => v.uuid === decodeURIComponent(uuid));
const detail = (v: Vm) => ({
  ...row(v),
  persistent: true,
  machine: "pc-q35-9.2",
  arch: "x86_64",
  firmware: v.firmware,
  cpuMode: "host-passthrough",
  description: "",
  diskDevices: [
    {
      device: "disk",
      target: "vda",
      bus: "virtio",
      source: `/var/lib/libvirt/images/${v.name}.qcow2`,
      format: "qcow2",
      readOnly: false,
    },
  ],
  nicDevices: [
    {
      type: "network",
      source: "default",
      model: "virtio",
      mac: "52:54:00:6b:3c:86",
    },
  ],
  graphics: [
    { type: "vnc", port: 5900, address: "127.0.0.1", hasPassword: false },
  ],
  hasSerial: true,
  guestAgent: v.state === "running",
  canSnapshot: true,
  snapshotBlock: "",
  watched: false,
});
const vmBase = `${base}/vms/:uuid`;
get(vmBase, (req) => {
  const v = find(req.params.uuid);
  return v ? detail(v) : { error: "VM not found" };
});
get(`${vmBase}/stats`, (req) => {
  const v = find(req.params.uuid);
  return v ? row(v) : { error: "VM not found" };
});
post(`${vmBase}/power/:action`, (req) => {
  const map: Record<string, State> = {
    start: "running",
    resume: "running",
    reboot: "running",
    shutdown: "shutoff",
    stop: "shutoff",
    suspend: "paused",
  };
  const uuid = decodeURIComponent(req.params.uuid);
  vms.update((l) =>
    l.map((v) =>
      v.uuid === uuid ? { ...v, state: map[req.params.action] ?? v.state } : v,
    ),
  );
  return { ok: true };
});
post(`${vmBase}/autostart`, (req) => {
  const uuid = decodeURIComponent(req.params.uuid);
  const enabled = !!(req.body as { enabled?: boolean }).enabled;
  vms.update((l) =>
    l.map((v) => (v.uuid === uuid ? { ...v, autostart: enabled } : v)),
  );
  return { ok: true };
});
post(`${vmBase}/clone`, (req) =>
  job("clone", "Clone", (req.body as { name: string }).name),
);
del(vmBase, (req) => {
  const uuid = decodeURIComponent(req.params.uuid);
  vms.update((l) => l.filter((v) => v.uuid !== uuid));
  return { removed: [], kept: [] };
});
const ok = () => ({ ok: true });
post(`${vmBase}/disks`, ok);
post(`${vmBase}/media`, ok);
post(`${vmBase}/nics`, ok);
post(`${vmBase}/use-vnc`, ok);
del(`${vmBase}/disks/:target`, ok);
del(`${vmBase}/nics/:mac`, ok);
get(`${vmBase}/xml`, (req) => ({
  xml: `<domain type="kvm">\n  <name>${find(req.params.uuid)?.name ?? ""}</name>\n  <memory unit="MiB">2048</memory>\n  <vcpu>2</vcpu>\n</domain>\n`,
}));
put(`${vmBase}/xml`, ok);
post(`${vmBase}/console`, () => ({ token: "demo" }));
put(`${vmBase}/watch`, ok);
get(`${vmBase}/snapshots`, () => [
  {
    name: "clean-install",
    createdAt: ago(60 * 24 * 6),
    state: "shutoff",
    parent: "",
    current: false,
    description: "Fresh install",
  },
  {
    name: "before-upgrade",
    createdAt: ago(60 * 30),
    state: "running",
    parent: "clean-install",
    current: true,
    description: "",
  },
]);
post(`${vmBase}/snapshots`, ok);
post(`${vmBase}/snapshots/:name/revert`, ok);
del(`${vmBase}/snapshots/:name`, ok);

post(`${base}/pools`, ok);
post(`${base}/pools/:pool/:action`, ok);
del(`${base}/pools/:pool`, ok);
get(`${base}/pools/:pool/volumes`, () => [
  {
    name: "debian-13.1-netinst.iso",
    path: "/var/lib/libvirt/isos/debian-13.1-netinst.iso",
    type: "file",
    capacity: 754_000_000,
    allocation: 754_000_000,
  },
  {
    name: "debian-web.qcow2",
    path: "/var/lib/libvirt/images/debian-web.qcow2",
    type: "file",
    capacity: 20 * GIB,
    allocation: 7 * GIB,
  },
]);
post(`${base}/pools/:pool/volumes`, ok);
del(`${base}/pools/:pool/volumes/:name`, ok);
post(`${base}/pools/:pool/download`, (req) =>
  job("download", "Download image", (req.body as { name: string }).name),
);
get(`${base}/networks`, () => [
  {
    name: "default",
    active: true,
    autostart: true,
    persistent: true,
    mode: "nat",
    bridge: "virbr0",
    subnet: "192.168.122.0/24",
    dhcp: true,
  },
]);
post(`${base}/networks`, ok);
post(`${base}/networks/:name/:action`, ok);
del(`${base}/networks/:name`, ok);
get(`${base}/networks/:name/leases`, () => [
  {
    expires: ago(-90),
    mac: "52:54:00:6b:3c:86",
    ip: "192.168.122.41",
    hostname: "debian-web",
  },
  {
    expires: ago(-60),
    mac: "52:54:00:aa:10:07",
    ip: "192.168.122.57",
    hostname: "build-runner",
  },
]);
get(`${base}/jobs`, () => []);
post(`${base}/jobs/:id/cancel`, ok);

function job(kind: string, label: string, vmName: string) {
  return {
    id: Date.now() % 100000,
    hostId: 7,
    kind,
    label,
    status: "success",
    phase: "Done",
    percent: 100,
    log: "",
    error: "",
    vmName,
    startedAt: ago(1),
    finishedAt: ago(0),
  };
}
