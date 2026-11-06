import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  DatabaseLoginOption,
  DockerInventory,
  HostStatus,
  JobInput,
  JobView,
  RepositoryInput,
  RepositoryView,
  RestoreTarget,
  RunDetail,
  RunPage,
  RunView,
  SnapshotEntry,
  SnapshotView,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Backups is not ready");
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
const get = async <T>(url: string) => (await api().get<T>(url)).data;

export const getStatus = (hostId: number) =>
  get<HostStatus>(`/hosts/${hostId}/status`);

export async function installRestic(hostId: number): Promise<string> {
  return (await api().post<{ version: string }>(`/hosts/${hostId}/install`))
    .data.version;
}

export async function installRclone(hostId: number): Promise<string> {
  return (
    await api().post<{ version: string }>(`/hosts/${hostId}/install-rclone`)
  ).data.version;
}

export const getDocker = (hostId: number) =>
  get<DockerInventory>(`/hosts/${hostId}/docker`);

export const getDatabaseLogins = (hostId: number) =>
  get<{ available: boolean; logins: DatabaseLoginOption[] }>(
    `/hosts/${hostId}/database-logins`,
  );

export const listJobs = (hostId?: number) =>
  get<JobView[]>(hostId ? `/hosts/${hostId}/jobs` : "/jobs");

export const getJob = (jobId: number) => get<JobView>(`/jobs/${jobId}`);

export async function createJob(
  hostId: number,
  input: JobInput,
): Promise<JobView> {
  return (await api().post<JobView>(`/hosts/${hostId}/jobs`, input)).data;
}

export async function updateJob(
  jobId: number,
  input: JobInput,
): Promise<JobView> {
  return (await api().put<JobView>(`/jobs/${jobId}`, input)).data;
}

export async function deleteJob(jobId: number): Promise<void> {
  await api().delete(`/jobs/${jobId}`);
}

export async function runJob(jobId: number): Promise<RunView> {
  return (await api().post<RunView>(`/jobs/${jobId}/run`)).data;
}

export const listSnapshots = (jobId: number) =>
  get<SnapshotView[]>(`/jobs/${jobId}/snapshots`);

export const listFiles = (jobId: number, snapshot: string, path: string) =>
  get<SnapshotEntry[]>(
    `/jobs/${jobId}/snapshots/${snapshot}/files?path=${enc(path)}`,
  );

export async function deleteSnapshot(
  jobId: number,
  snapshot: string,
): Promise<void> {
  await api().delete(`/jobs/${jobId}/snapshots/${snapshot}`);
}

export async function restoreSnapshot(
  jobId: number,
  snapshot: string,
  body: RestoreTarget & { hostId: number },
): Promise<RunView> {
  return (
    await api().post<RunView>(
      `/jobs/${jobId}/snapshots/${snapshot}/restore`,
      body,
    )
  ).data;
}

/** Downloads a file, or a folder as zip, and saves it in the browser. */
export async function downloadEntry(
  jobId: number,
  snapshot: string,
  entry: SnapshotEntry,
): Promise<void> {
  const folder = entry.type === "dir";
  let blob: Blob;
  try {
    blob = (
      await api().get<Blob>(
        `/jobs/${jobId}/snapshots/${snapshot}/download?path=${enc(entry.path)}${folder ? "&folder=1" : ""}`,
        { responseType: "blob", timeout: 0 },
      )
    ).data;
  } catch (error) {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    // A failed blob request carries its JSON error as a blob too.
    if (data instanceof Blob) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(await data.text());
      } catch {
        parsed = null;
      }
      if (parsed) throw { response: { data: parsed } };
    }
    throw error;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = folder ? `${entry.name}.zip` : entry.name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export function listRuns(filter: {
  jobId?: number;
  hostId?: number;
  before?: number | null;
  limit?: number;
}): Promise<RunPage> {
  const query = new URLSearchParams();
  if (filter.jobId) query.set("jobId", String(filter.jobId));
  if (filter.hostId) query.set("hostId", String(filter.hostId));
  if (filter.before) query.set("before", String(filter.before));
  query.set("limit", String(filter.limit ?? 25));
  return get<RunPage>(`/runs?${query.toString()}`);
}

export const getRun = (runId: number) => get<RunDetail>(`/runs/${runId}`);

export async function cancelRun(runId: number): Promise<void> {
  await api().post(`/runs/${runId}/cancel`);
}

export const listRepositories = () => get<RepositoryView[]>("/repositories");

export async function createRepository(
  input: RepositoryInput,
): Promise<RepositoryView> {
  return (await api().post<RepositoryView>("/repositories", input)).data;
}

export async function updateRepository(
  id: number,
  input: RepositoryInput,
): Promise<RepositoryView> {
  return (await api().put<RepositoryView>(`/repositories/${id}`, input)).data;
}

export async function deleteRepository(id: number): Promise<void> {
  await api().delete(`/repositories/${id}`);
}

export async function revealPassword(id: number): Promise<string> {
  return (
    await api().post<{ password: string }>(`/repositories/${id}/password`)
  ).data.password;
}

export async function testRepository(
  id: number,
  hostId: number,
  init: boolean,
): Promise<{ ok: boolean; created: boolean; error: string | null }> {
  return (
    await api().post<{ ok: boolean; created: boolean; error: string | null }>(
      `/repositories/${id}/test`,
      { hostId, init },
    )
  ).data;
}
