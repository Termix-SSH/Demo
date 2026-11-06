import type {
  HypervisorStatus,
  Inventory,
  LeaseRow,
  NetworkRow,
  NewVm,
  PowerAction,
  SnapshotRow,
  VmDetail,
  VmRow,
  VolumeRow,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import type { NetworkKind } from "./libvirt/domain-xml.js";
import type { NetworkAction, PoolAction } from "./libvirt/storage.js";

export interface Target {
  hostId: number;
  settings: HostSettings;
}

/** A display to tunnel to, on the hypervisor's own network. */
export interface VmDisplay {
  address: string;
  port: number;
  password: string;
}

/** What a job runs on the host, detached. See jobs.ts. */
export interface JobPlan {
  /** Runs in the job folder before it detaches. May hold secrets. */
  setup: string;
  body: string;
  label: string;
  vmName: string;
}

/**
 * What the rest of the plugin needs from a hypervisor. Routes and operations
 * only talk to this, so another hypervisor can sit beside libvirt.
 */
export interface VmProvider {
  status: (target: Target) => Promise<HypervisorStatus>;
  install: (target: Target) => Promise<void>;

  inventory: (target: Target) => Promise<Inventory>;
  detail: (target: Target, uuid: string) => Promise<VmDetail>;
  stats: (target: Target, uuid: string) => Promise<VmRow>;

  power: (target: Target, uuid: string, action: PowerAction) => Promise<void>;
  autostart: (target: Target, uuid: string, on: boolean) => Promise<void>;
  remove: (
    target: Target,
    uuid: string,
    withDisks: boolean,
  ) => Promise<{ removed: string[]; kept: string[] }>;

  planCreate: (target: Target, vm: NewVm) => Promise<JobPlan>;
  planClone: (target: Target, uuid: string, name: string) => Promise<JobPlan>;
  planDownload: (
    target: Target,
    pool: string,
    name: string,
    url: string,
  ) => JobPlan;
  planSnapshot: (
    target: Target,
    uuid: string,
    name: string,
    description: string,
  ) => Promise<JobPlan>;

  setHardware: (
    target: Target,
    uuid: string,
    change: { vcpus?: number; memoryMib?: number },
  ) => Promise<void>;
  addDisk: (
    target: Target,
    uuid: string,
    pool: string,
    gib: number,
  ) => Promise<string>;
  removeDisk: (target: Target, uuid: string, disk: string) => Promise<void>;
  setMedia: (
    target: Target,
    uuid: string,
    pool: string,
    volume: string,
  ) => Promise<void>;
  addNic: (
    target: Target,
    uuid: string,
    type: "network" | "bridge",
    source: string,
  ) => Promise<void>;
  removeNic: (target: Target, uuid: string, mac: string) => Promise<void>;
  readConfig: (target: Target, uuid: string) => Promise<string>;
  writeConfig: (target: Target, uuid: string, text: string) => Promise<void>;
  useVnc: (target: Target, uuid: string) => Promise<void>;
  display: (target: Target, uuid: string) => Promise<VmDisplay>;
  /** The host command for a text console. */
  serialCommand: (target: Target, uuid: string) => string;

  snapshots: (target: Target, uuid: string) => Promise<SnapshotRow[]>;
  revertSnapshot: (target: Target, uuid: string, name: string) => Promise<void>;
  deleteSnapshot: (target: Target, uuid: string, name: string) => Promise<void>;

  volumes: (target: Target, pool: string) => Promise<VolumeRow[]>;
  createPool: (target: Target, name: string, path: string) => Promise<void>;
  poolAction: (
    target: Target,
    name: string,
    action: PoolAction,
  ) => Promise<void>;
  deletePool: (target: Target, name: string) => Promise<void>;
  createVolume: (
    target: Target,
    pool: string,
    name: string,
    gib: number,
  ) => Promise<void>;
  deleteVolume: (target: Target, pool: string, name: string) => Promise<void>;

  networks: (target: Target) => Promise<NetworkRow[]>;
  leases: (target: Target, network: string) => Promise<LeaseRow[]>;
  createNetwork: (
    target: Target,
    name: string,
    kind: NetworkKind,
  ) => Promise<void>;
  networkAction: (
    target: Target,
    name: string,
    action: NetworkAction,
  ) => Promise<void>;
  deleteNetwork: (target: Target, name: string) => Promise<void>;
}
