export type VmState =
  | "running"
  | "blocked"
  | "paused"
  | "shutdown"
  | "shutoff"
  | "crashed"
  | "pmsuspended"
  | "unknown";

export type PowerAction =
  "start" | "shutdown" | "reboot" | "stop" | "suspend" | "resume";

export interface VmDiskStat {
  target: string;
  path: string;
  capacity: number;
  allocation: number;
  readBytes: number;
  writeBytes: number;
}

export interface VmNicStat {
  name: string;
  rxBytes: number;
  txBytes: number;
}

export interface VmRow {
  uuid: string;
  name: string;
  state: VmState;
  /** Libvirt's reason code for the state. */
  reason: number;
  vcpus: number;
  memoryKib: number;
  maxMemoryKib: number;
  /** Memory the guest uses, when the balloon driver reports it. */
  usedKib: number | null;
  autostart: boolean;
  cpuTimeNs: number;
  disks: VmDiskStat[];
  nics: VmNicStat[];
  ips: string[];
}

export interface NodeInfo {
  cpus: number;
  memoryKib: number;
  freeKib: number;
}

export interface PoolRow {
  name: string;
  state: string;
  autostart: boolean;
  capacity: number;
  allocation: number;
  available: number;
}

export interface Inventory {
  vms: VmRow[];
  node: NodeInfo;
  pools: PoolRow[];
  checkedAt: string;
}

export interface HypervisorStatus {
  /** virsh is on the host. */
  installed: boolean;
  /** virsh could talk to libvirt with this host's settings. */
  connected: boolean;
  kvm: boolean;
  serviceActive: boolean;
  version: string;
  packageManager: string;
  /** Tools a new VM from a cloud image needs. */
  missingTools: string[];
  uefi: boolean;
  error: string;
}

export interface VmDisk {
  device: string;
  target: string;
  bus: string;
  source: string;
  format: string;
  readOnly: boolean;
}

export interface VmNic {
  type: string;
  source: string;
  model: string;
  mac: string;
}

export interface VmGraphics {
  type: string;
  port: number;
  address: string;
  hasPassword: boolean;
}

export interface VmDetail extends VmRow {
  persistent: boolean;
  machine: string;
  arch: string;
  firmware: "bios" | "uefi";
  cpuMode: string;
  description: string;
  diskDevices: VmDisk[];
  nicDevices: VmNic[];
  graphics: VmGraphics[];
  hasSerial: boolean;
  guestAgent: boolean;
  /** Every writable disk is qcow2, so internal snapshots work. */
  canSnapshot: boolean;
  snapshotBlock: string;
  watched: boolean;
}

export interface SnapshotRow {
  name: string;
  createdAt: string;
  state: string;
  parent: string;
  current: boolean;
  description: string;
}

export interface VolumeRow {
  name: string;
  path: string;
  type: string;
  capacity: number;
  allocation: number;
}

export interface NetworkRow {
  name: string;
  active: boolean;
  autostart: boolean;
  persistent: boolean;
  mode: string;
  bridge: string;
  subnet: string;
  dhcp: boolean;
}

export interface LeaseRow {
  expires: string;
  mac: string;
  ip: string;
  hostname: string;
}

export type JobKind = "create" | "clone" | "download" | "snapshot";
export type JobStatus = "running" | "success" | "failed" | "cancelled";

export interface JobRow {
  id: number;
  hostId: number;
  kind: JobKind;
  label: string;
  status: JobStatus;
  phase: string;
  percent: number | null;
  log: string;
  error: string;
  /** The VM the job made or works on, when known. */
  vmName: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface CloudImage {
  id: string;
  name: string;
  url: string;
}

export type VmSource =
  | { type: "iso"; volume: string }
  | { type: "blank" }
  | {
      type: "cloud";
      /** A built-in image id, or empty with `url`. */
      image: string;
      url: string;
      username: string;
      password: string;
      sshKey: string;
    };

export interface NewVm {
  name: string;
  vcpus: number;
  memoryMib: number;
  diskGib: number;
  pool: string;
  firmware: "bios" | "uefi";
  network: { type: "network" | "bridge"; source: string };
  source: VmSource;
  autostart: boolean;
  start: boolean;
}

export interface HostSummary {
  hostId: number;
  hostName: string;
  total: number;
  running: number;
  stopped: number;
  crashed: number;
  vms: VmRow[];
  pools: PoolRow[];
  error: string;
  checkedAt: string;
}
