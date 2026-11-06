export type Health = "ok" | "warn" | "fail" | "unknown";

export type DeviceKind = "hdd" | "ssd" | "nvme" | "unknown";

export interface Device {
  /** Kernel name, like sda or nvme0n1. */
  id: string;
  model: string;
  serial: string;
  kind: DeviceKind;
  sizeBytes: number | null;
  health: Health;
  /** SMART overall result, null when the drive gives none. */
  passed: boolean | null;
  tempC: number | null;
  powerOnHours: number | null;
  /** Percent of rated life used, NVMe or SSD. */
  wearPct: number | null;
  reallocated: number | null;
  pending: number | null;
  uncorrectable: number | null;
  mediaErrors: number | null;
  spareLowPct: number | null;
  criticalWarning: number | null;
  selfTest: string;
  selfTestRunning: boolean;
  /** Why there is no SMART data, when that is the case. */
  note: string;
  attributes: Array<{ id: number; name: string; value: number; raw: number }>;
}

export interface PoolMember {
  name: string;
  state: string;
  read: number;
  write: number;
  cksum: number;
  depth: number;
}

export interface Pool {
  id: string;
  name: string;
  state: string;
  health: Health;
  sizeBytes: number | null;
  usedPct: number | null;
  errors: number;
  scan: string;
  scrubbing: boolean;
  members: PoolMember[];
}

export interface Raid {
  id: string;
  name: string;
  level: string;
  state: string;
  health: Health;
  total: number;
  active: number;
  failed: string[];
  syncAction: string;
  syncPct: number | null;
  syncEta: string;
}

export interface BtrfsFs {
  id: string;
  mount: string;
  label: string;
  errors: number;
  scrub: string;
  scrubbing: boolean;
  health: Health;
  counters: Array<{ device: string; counter: string; value: number }>;
}

export interface ThinPool {
  name: string;
  dataPct: number | null;
  metaPct: number | null;
}

export interface VolumeGroup {
  id: string;
  name: string;
  sizeBytes: number | null;
  freeBytes: number | null;
  thin: ThinPool[];
  health: Health;
}

export interface Reading {
  devices: Device[];
  pools: Pool[];
  arrays: Raid[];
  btrfs: BtrfsFs[];
  groups: VolumeGroup[];
  /** Tools found on the host. */
  tools: string[];
  /** The checks ran as root. */
  root: boolean;
  warnings: string[];
}

export type HistoryRange = "24h" | "7d" | "30d";

/** t seconds, p temperature, w wear, h power on hours, r reallocated plus pending. */
export interface HistoryPoint {
  t: number;
  p: number | null;
  w: number | null;
  h: number | null;
  r: number | null;
}

export interface StorageEvent {
  id: number;
  hostId: number;
  at: number;
  type: string;
  text: string;
}

export interface HostSummary {
  hostId: number;
  status: Health;
  label: string;
  drives: number;
  problems: number;
  hottestC: number | null;
  error: string;
}

export interface HostConfig {
  hostId: number;
  alerts: boolean;
  intervalMin: number;
  tempWarnC: number;
  tempCritC: number;
  wearWarnPct: number;
  thinWarnPct: number;
}
