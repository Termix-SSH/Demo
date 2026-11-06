import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Finding,
  Health,
  HostConfig,
  HostSummary,
  Reading,
  SecurityEvent,
  VulnScan,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Security Center is not ready");
  return client;
}

/** The message the server sent for a failed call, or the fallback. */
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

export interface ScanSummary {
  at: number;
  ecosystem: string;
  packages: number;
  pending: number;
  unsupported: string;
  error: string;
  kevChecked: boolean;
  total: number;
  critical: number;
  kev: number;
}

export interface HostView {
  hostId: number;
  canEdit: boolean;
  canManage: boolean;
  useSudo: boolean;
  scanEnabled: boolean;
  config: HostConfig;
  status: Health;
  score: number | null;
  reading: Reading | null;
  findings: Finding[];
  error: string;
  readAt: number | null;
  active: string[];
  seenOn: Record<string, number>;
  scan: ScanSummary | null;
  scanning: boolean;
}

export interface VulnView {
  scan: VulnScan | null;
  scanning: boolean;
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

export async function getVulns(host: number): Promise<VulnView> {
  return (await api().get<VulnView>(`/${host}/vulns`)).data;
}

export async function scanHost(host: number): Promise<VulnView> {
  return (await api().post<VulnView>(`/${host}/scan`, {})).data;
}

export async function ignoreAdvisory(
  host: number,
  advisory: string,
  note: string,
): Promise<void> {
  await api().post(`/${host}/ignore`, { advisory, note });
}

export async function unignoreAdvisory(
  host: number,
  advisory: string,
): Promise<void> {
  await api().delete(`/${host}/ignore/${encodeURIComponent(advisory)}`);
}

export async function getEvents(host: number): Promise<SecurityEvent[]> {
  return (await api().get<SecurityEvent[]>(`/${host}/events`)).data;
}

export async function rotateLoginKey(host: number): Promise<string> {
  return (
    await api().post<{ message: string }>(`/${host}/rotate-login-key`, {})
  ).data.message;
}

export async function revokeKey(
  host: number,
  path: string,
  fingerprint: string,
): Promise<string> {
  return (
    await api().post<{ message: string }>(`/${host}/revoke`, {
      path,
      fingerprint,
    })
  ).data.message;
}

export async function rotateHostKeys(host: number): Promise<string> {
  return (
    await api().post<{ message: string }>(`/${host}/rotate-host-keys`, {})
  ).data.message;
}
