import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ActionResult,
  LogTarget,
  LogsView,
  ManagersView,
  ProcessDetail,
  ProcessList,
  SignalName,
  StatusView,
  WatchBody,
  WatchView,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Process Manager is not ready");
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

type Watches = { watches: WatchView[]; max: number };

export async function getStatus(host: number): Promise<StatusView> {
  return (await api().get<StatusView>(`/${host}/status`)).data;
}

export async function getProcesses(host: number): Promise<ProcessList> {
  return (await api().get<ProcessList>(`/${host}/processes`)).data;
}

export async function getProcess(
  host: number,
  pid: number,
): Promise<ProcessDetail> {
  return (await api().get<ProcessDetail>(`/${host}/processes/${pid}`)).data;
}

export async function signalProcess(
  host: number,
  pid: number,
  signal: SignalName,
  command: string,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(`/${host}/processes/${pid}/signal`, {
      signal,
      command,
    })
  ).data;
}

export async function reniceProcess(
  host: number,
  pid: number,
  nice: number,
  command: string,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(`/${host}/processes/${pid}/renice`, {
      nice,
      command,
    })
  ).data;
}

export async function getApps(host: number): Promise<ManagersView> {
  return (await api().get<ManagersView>(`/${host}/apps`)).data;
}

export async function appAction(
  host: number,
  manager: string,
  key: string,
  action: string,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(
      `/${host}/apps/${enc(manager)}/${enc(key)}/${enc(action)}`,
      {},
    )
  ).data;
}

export async function supervisorRefresh(host: number): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/supervisor-refresh`, {}))
    .data;
}

export async function getLogs(
  host: number,
  target: LogTarget,
  lines: number,
  grep: string,
): Promise<LogsView> {
  return (await api().post<LogsView>(`/${host}/logs`, { target, lines, grep }))
    .data;
}

export async function listWatches(host: number): Promise<Watches> {
  return (await api().get<Watches>(`/${host}/watches`)).data;
}

export async function addWatch(
  host: number,
  body: WatchBody,
): Promise<Watches> {
  return (await api().post<Watches>(`/${host}/watches`, body)).data;
}

export async function removeWatch(host: number, id: number): Promise<Watches> {
  return (await api().delete<Watches>(`/${host}/watches/${id}`)).data;
}

export async function listAllWatches(): Promise<WatchView[]> {
  return (await api().get<{ watches: WatchView[] }>(`/watches`)).data.watches;
}
