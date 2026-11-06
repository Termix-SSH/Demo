import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  AnsibleStatus,
  FactsHost,
  FileView,
  FilesView,
  RunBody,
  RunDetail,
  RunSummary,
  Target,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Ansible is not ready");
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

export async function getStatus(host: number): Promise<AnsibleStatus> {
  return (await api().get<AnsibleStatus>(`/${host}/status`)).data;
}

export async function getFiles(host: number): Promise<FilesView> {
  return (await api().get<FilesView>(`/${host}/files`)).data;
}

export async function getFile(host: number, path: string): Promise<FileView> {
  return (await api().get<FileView>(`/${host}/file?path=${enc(path)}`)).data;
}

export async function saveFile(
  host: number,
  path: string,
  text: string,
): Promise<void> {
  await api().put(`/${host}/file`, { path, text });
}

export async function deleteFile(host: number, path: string): Promise<void> {
  await api().delete(`/${host}/file?path=${enc(path)}`);
}

export async function getTargets(host: number): Promise<Target[]> {
  return (await api().get<{ targets: Target[] }>(`/${host}/targets`)).data
    .targets;
}

export async function getRuns(host: number): Promise<RunSummary[]> {
  return (await api().get<{ runs: RunSummary[] }>(`/${host}/runs`)).data.runs;
}

export async function startRun(
  host: number,
  body: RunBody,
): Promise<RunSummary> {
  return (await api().post<RunSummary>(`/${host}/runs`, body)).data;
}

export async function getRun(host: number, id: string): Promise<RunDetail> {
  return (await api().get<RunDetail>(`/${host}/runs/${enc(id)}`)).data;
}

export async function getFacts(host: number, id: string): Promise<FactsHost[]> {
  return (
    await api().get<{ hosts: FactsHost[] }>(`/${host}/runs/${enc(id)}/facts`)
  ).data.hosts;
}

export async function cancelRun(host: number, id: string): Promise<void> {
  await api().post(`/${host}/runs/${enc(id)}/cancel`, {});
}

export async function deleteRun(host: number, id: string): Promise<void> {
  await api().delete(`/${host}/runs/${enc(id)}`);
}
