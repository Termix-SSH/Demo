import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  CloudImage,
  HostSummary,
  HypervisorStatus,
  Inventory,
  JobRow,
  LeaseRow,
  NetworkRow,
  NewVm,
  PowerAction,
  SnapshotRow,
  VmDetail,
  VmRow,
  VolumeRow,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Virtual Machines is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export function errorCode(error: unknown): string {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data?.code;
  return typeof code === "string" ? code : "";
}

const enc = encodeURIComponent;
const base = (host: number) => `/hosts/${host}`;
const vm = (host: number, uuid: string) => `${base(host)}/vms/${enc(uuid)}`;

async function get<T>(path: string): Promise<T> {
  return (await api().get<T>(path)).data;
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  return (await api().post<T>(path, body ?? {})).data;
}

async function del<T = unknown>(path: string): Promise<T> {
  return (await api().delete<T>(path)).data;
}

export const getSummary = (refresh = false) =>
  get<HostSummary[]>(`/summary${refresh ? "?refresh=1" : ""}`);
export const getImages = () => get<CloudImage[]>("/images");
export const getStatus = (host: number) =>
  get<HypervisorStatus>(`${base(host)}/status`);
export const install = (host: number) => post(`${base(host)}/install`);
export const getInventory = (host: number, fresh = false) =>
  get<Inventory>(`${base(host)}/inventory${fresh ? "?fresh=1" : ""}`);
export const getVm = (host: number, uuid: string) =>
  get<VmDetail>(vm(host, uuid));
export const getStats = (host: number, uuid: string) =>
  get<VmRow>(`${vm(host, uuid)}/stats`);
export const createVm = (host: number, input: NewVm) =>
  post<JobRow>(`${base(host)}/vms`, input);
export const power = (host: number, uuid: string, action: PowerAction) =>
  post(`${vm(host, uuid)}/power/${action}`);
export const setAutostart = (host: number, uuid: string, enabled: boolean) =>
  post(`${vm(host, uuid)}/autostart`, { enabled });
export const cloneVm = (host: number, uuid: string, name: string) =>
  post(`${vm(host, uuid)}/clone`, { name });
export const deleteVm = (host: number, uuid: string, deleteDisks: boolean) =>
  del<{ removed: string[]; kept: string[] }>(
    `${vm(host, uuid)}${deleteDisks ? "?deleteDisks=1" : ""}`,
  );
export const setHardware = async (
  host: number,
  uuid: string,
  change: { vcpus?: number; memoryMib?: number },
) => (await api().patch(`${vm(host, uuid)}/hardware`, change)).data;
export const addDisk = (
  host: number,
  uuid: string,
  pool: string,
  gib: number,
) => post(`${vm(host, uuid)}/disks`, { pool, gib });
export const removeDisk = (host: number, uuid: string, target: string) =>
  del(`${vm(host, uuid)}/disks/${enc(target)}`);
export const setMedia = (
  host: number,
  uuid: string,
  pool: string,
  volume: string,
) => post(`${vm(host, uuid)}/media`, { pool, volume });
export const addNic = (
  host: number,
  uuid: string,
  type: "network" | "bridge",
  source: string,
) => post(`${vm(host, uuid)}/nics`, { type, source });
export const removeNic = (host: number, uuid: string, mac: string) =>
  del(`${vm(host, uuid)}/nics/${enc(mac)}`);
export const getXml = async (host: number, uuid: string) =>
  (await get<{ xml: string }>(`${vm(host, uuid)}/xml`)).xml;
export const putXml = async (host: number, uuid: string, xml: string) =>
  (await api().put(`${vm(host, uuid)}/xml`, { xml })).data;
export const switchToVnc = (host: number, uuid: string) =>
  post(`${vm(host, uuid)}/use-vnc`);
export const openConsole = (host: number, uuid: string) =>
  post<{ token: string }>(`${vm(host, uuid)}/console`);
export const setWatch = async (
  host: number,
  uuid: string,
  name: string,
  on: boolean,
) => (await api().put(`${vm(host, uuid)}/watch`, { name, on })).data;

export const getSnapshots = (host: number, uuid: string) =>
  get<SnapshotRow[]>(`${vm(host, uuid)}/snapshots`);
export const takeSnapshot = (
  host: number,
  uuid: string,
  name: string,
  description: string,
) => post(`${vm(host, uuid)}/snapshots`, { name, description });
export const revertSnapshot = (host: number, uuid: string, name: string) =>
  post(`${vm(host, uuid)}/snapshots/${enc(name)}/revert`);
export const deleteSnapshot = (host: number, uuid: string, name: string) =>
  del(`${vm(host, uuid)}/snapshots/${enc(name)}`);

export const createPool = (host: number, name: string, path: string) =>
  post(`${base(host)}/pools`, { name, path });
export const poolAction = (host: number, name: string, action: string) =>
  post(`${base(host)}/pools/${enc(name)}/${action}`);
export const deletePool = (host: number, name: string) =>
  del(`${base(host)}/pools/${enc(name)}`);
export const getVolumes = (host: number, pool: string) =>
  get<VolumeRow[]>(`${base(host)}/pools/${enc(pool)}/volumes`);
export const createVolume = (
  host: number,
  pool: string,
  name: string,
  gib: number,
) => post(`${base(host)}/pools/${enc(pool)}/volumes`, { name, gib });
export const deleteVolume = (host: number, pool: string, name: string) =>
  del(`${base(host)}/pools/${enc(pool)}/volumes/${enc(name)}`);
export const downloadVolume = (
  host: number,
  pool: string,
  name: string,
  url: string,
) => post<JobRow>(`${base(host)}/pools/${enc(pool)}/download`, { name, url });

export const getNetworks = (host: number) =>
  get<NetworkRow[]>(`${base(host)}/networks`);
export const createNetwork = (
  host: number,
  input: { name: string; type: string; subnet: string; bridge: string },
) => post(`${base(host)}/networks`, input);
export const networkAction = (host: number, name: string, action: string) =>
  post(`${base(host)}/networks/${enc(name)}/${action}`);
export const deleteNetwork = (host: number, name: string) =>
  del(`${base(host)}/networks/${enc(name)}`);
export const getLeases = (host: number, name: string) =>
  get<LeaseRow[]>(`${base(host)}/networks/${enc(name)}/leases`);

export const getJobs = (host: number) => get<JobRow[]>(`${base(host)}/jobs`);
export const cancelJob = (host: number, id: number) =>
  post(`${base(host)}/jobs/${id}/cancel`);
