import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Health,
  HistoryPoint,
  HistoryRange,
  HostConfig,
  HostSummary,
  Reading,
  StorageEvent,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Storage Health is not ready");
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

export interface HostView {
  hostId: number;
  canEdit: boolean;
  useSudo: boolean;
  config: HostConfig;
  status: Health;
  reading: Reading | null;
  error: string;
  readAt: number | null;
  active: string[];
}

export async function getSummary(): Promise<HostSummary[]> {
  return (await api().get<HostSummary[]>("/summary")).data;
}

export async function getHost(host: number): Promise<HostView> {
  return (await api().get<HostView>(`/${host}`)).data;
}

export async function refreshHost(host: number): Promise<HostView> {
  return (await api().post<HostView>(`/${host}/refresh`, {})).data;
}

export async function saveConfig(
  host: number,
  config: Omit<HostConfig, "hostId">,
): Promise<void> {
  await api().put(`/${host}/config`, config);
}

export async function getHistory(
  host: number,
  device: string,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  return (
    await api().get<{ points: HistoryPoint[] }>(`/${host}/history`, {
      params: { device, range },
    })
  ).data.points;
}

export async function getEvents(host: number): Promise<StorageEvent[]> {
  return (await api().get<StorageEvent[]>(`/${host}/events`)).data;
}

export async function selfTest(
  host: number,
  device: string,
  action: "short" | "long" | "abort",
): Promise<string> {
  return (
    await api().post<{ message: string }>(`/${host}/selftest`, {
      device,
      action,
    })
  ).data.message;
}

export async function scrub(
  host: number,
  target: string,
  stop: boolean,
): Promise<string> {
  return (
    await api().post<{ message: string }>(`/${host}/scrub`, { target, stop })
  ).data.message;
}
