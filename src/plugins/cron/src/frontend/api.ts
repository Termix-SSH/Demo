import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  CronStatus,
  CrontabView,
  JobBody,
  LogsView,
  RunResult,
  SystemView,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Cron is not ready");
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
const userQuery = (user: string) => (user ? `?user=${enc(user)}` : "");

export async function getStatus(host: number): Promise<CronStatus> {
  return (await api().get<CronStatus>(`/${host}/status`)).data;
}

export async function getJobs(
  host: number,
  user: string,
): Promise<CrontabView> {
  return (await api().get<CrontabView>(`/${host}/jobs${userQuery(user)}`)).data;
}

export async function addJob(
  host: number,
  body: JobBody,
): Promise<CrontabView> {
  return (await api().post<CrontabView>(`/${host}/jobs`, body)).data;
}

export async function updateJob(
  host: number,
  id: string,
  body: JobBody,
): Promise<CrontabView> {
  return (await api().put<CrontabView>(`/${host}/jobs/${enc(id)}`, body)).data;
}

export async function setJobEnabled(
  host: number,
  user: string,
  id: string,
  enabled: boolean,
): Promise<CrontabView> {
  return (
    await api().post<CrontabView>(`/${host}/jobs/${enc(id)}/state`, {
      user: user || undefined,
      enabled,
    })
  ).data;
}

export async function deleteJob(
  host: number,
  user: string,
  id: string,
): Promise<CrontabView> {
  return (
    await api().delete<CrontabView>(
      `/${host}/jobs/${enc(id)}${userQuery(user)}`,
    )
  ).data;
}

export async function runJob(
  host: number,
  user: string,
  id: string,
): Promise<RunResult> {
  return (
    await api().post<RunResult>(`/${host}/jobs/${enc(id)}/run`, {
      user: user || undefined,
    })
  ).data;
}

export async function saveCrontab(
  host: number,
  user: string,
  text: string,
): Promise<CrontabView> {
  return (
    await api().put<CrontabView>(`/${host}/crontab`, {
      user: user || undefined,
      text,
    })
  ).data;
}

export async function getSystem(host: number): Promise<SystemView> {
  return (await api().get<SystemView>(`/${host}/system`)).data;
}

export async function saveSystemFile(
  host: number,
  name: string,
  text: string,
): Promise<void> {
  await api().put(`/${host}/system/${enc(name)}`, { text });
}

export async function deleteSystemFile(
  host: number,
  name: string,
): Promise<void> {
  await api().delete(`/${host}/system/${enc(name)}`);
}

export async function getLogs(host: number, lines: number): Promise<LogsView> {
  return (await api().get<LogsView>(`/${host}/logs?lines=${lines}`)).data;
}
