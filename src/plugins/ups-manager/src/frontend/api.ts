import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Detect,
  HistoryPoint,
  HistoryRange,
  HostSummary,
  Reading,
  SourceInput,
  SourceView,
  UpsCommand,
  UpsEvent,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("UPS Manager is not ready");
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

export async function getSummary(): Promise<HostSummary[]> {
  return (await api().get<HostSummary[]>("/summary")).data;
}

export async function getDetect(host: number): Promise<Detect> {
  return (await api().get<Detect>(`/${host}/detect`)).data;
}

export interface SourceList {
  canEdit: boolean;
  sources: SourceView[];
}

export async function getSources(host: number): Promise<SourceList> {
  return (await api().get<SourceList>(`/${host}/sources`)).data;
}

export async function getStatus(host: number, id: number): Promise<SourceView> {
  return (await api().get<SourceView>(`/${host}/sources/${id}/status`)).data;
}

export async function addSource(
  host: number,
  input: SourceInput,
): Promise<SourceView> {
  return (await api().post<SourceView>(`/${host}/sources`, input)).data;
}

export async function saveSource(
  host: number,
  id: number,
  input: SourceInput & { clearSecrets?: boolean },
): Promise<SourceView> {
  return (await api().put<SourceView>(`/${host}/sources/${id}`, input)).data;
}

export async function removeSource(host: number, id: number): Promise<void> {
  await api().delete(`/${host}/sources/${id}`);
}

export async function testSource(
  host: number,
  input: SourceInput & { id?: number },
): Promise<Reading> {
  return (await api().post<{ reading: Reading }>(`/${host}/test-source`, input))
    .data.reading;
}

export async function getHistory(
  host: number,
  id: number,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  return (
    await api().get<{ points: HistoryPoint[] }>(
      `/${host}/sources/${id}/history`,
      { params: { range } },
    )
  ).data.points;
}

export async function getEvents(host: number, id: number): Promise<UpsEvent[]> {
  return (await api().get<UpsEvent[]>(`/${host}/sources/${id}/events`)).data;
}

export async function getCommands(
  host: number,
  id: number,
): Promise<UpsCommand[]> {
  return (await api().get<UpsCommand[]>(`/${host}/sources/${id}/commands`))
    .data;
}

export async function sendCommand(
  host: number,
  id: number,
  command: string,
): Promise<string> {
  return (
    await api().post<{ output: string }>(`/${host}/sources/${id}/commands`, {
      command,
    })
  ).data.output;
}
