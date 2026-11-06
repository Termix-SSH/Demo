import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  CheckResult,
  HistoryPoint,
  HistoryRange,
  IncidentView,
  MaintenanceInput,
  MaintenanceView,
  MonitorInput,
  MonitorView,
  NoteLevel,
  ShareGrant,
  StatusNoteView,
  StatusPageInput,
  StatusPageView,
  UptimeSummary,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Uptime is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export interface Permissions {
  manage: boolean;
  privateTargets: boolean;
  runCommands: boolean;
  publish: boolean;
  publicPages: boolean;
  minIntervalSec: number;
  defaultIntervalSec: number;
}

export interface ShareTargets {
  users: Array<{ id: string; username: string }>;
  roles: Array<{ id: number; name: string; displayName: string | null }>;
}

export async function getPermissions(): Promise<Permissions> {
  return (await api().get<Permissions>("/permissions")).data;
}

export async function getSummary(): Promise<UptimeSummary> {
  return (await api().get<UptimeSummary>("/summary")).data;
}

export async function listMonitors(): Promise<MonitorView[]> {
  return (await api().get<{ monitors: MonitorView[] }>("/monitors")).data
    .monitors;
}

export async function hostMonitors(hostId: number): Promise<MonitorView[]> {
  const { data } = await api().get<{ monitors: MonitorView[] }>(
    `/hosts/${hostId}/monitors`,
  );
  return data.monitors;
}

export async function getMonitor(id: number): Promise<MonitorView> {
  return (await api().get<MonitorView>(`/monitors/${id}`)).data;
}

export async function createMonitor(input: MonitorInput): Promise<MonitorView> {
  return (await api().post<MonitorView>("/monitors", input)).data;
}

export async function updateMonitor(
  id: number,
  input: MonitorInput,
): Promise<MonitorView> {
  return (await api().put<MonitorView>(`/monitors/${id}`, input)).data;
}

export async function deleteMonitor(id: number): Promise<void> {
  await api().delete(`/monitors/${id}`);
}

export async function testMonitor(
  input: MonitorInput & { monitorId?: number },
): Promise<CheckResult> {
  return (await api().post<CheckResult>("/monitors/test", input)).data;
}

export async function runMonitor(id: number): Promise<MonitorView> {
  return (await api().post<MonitorView>(`/monitors/${id}/run`)).data;
}

export async function pauseMonitor(
  id: number,
  paused: boolean,
): Promise<MonitorView> {
  const { data } = await api().post<MonitorView>(`/monitors/${id}/pause`, {
    paused,
  });
  return data;
}

export async function setWatching(id: number, on: boolean): Promise<void> {
  await api().post(`/monitors/${id}/watch`, { on });
}

export async function newPushUrl(id: number): Promise<string> {
  const { data } = await api().post<{ pushUrl: string }>(
    `/monitors/${id}/push-url`,
  );
  return data.pushUrl;
}

export async function addHosts(hostIds: number[]): Promise<number> {
  const { data } = await api().post<{ added: number }>("/monitors/hosts", {
    hostIds,
  });
  return data.added;
}

export async function getHistory(
  id: number,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  const { data } = await api().get<{ points: HistoryPoint[] }>(
    `/monitors/${id}/history`,
    { params: { range } },
  );
  return data.points;
}

export async function getShares(id: number): Promise<ShareGrant[]> {
  const { data } = await api().get<{ shares: ShareGrant[] }>(
    `/monitors/${id}/shares`,
  );
  return data.shares;
}

export async function saveShares(
  id: number,
  shares: ShareGrant[],
): Promise<void> {
  await api().put(`/monitors/${id}/shares`, { shares });
}

export async function getShareTargets(): Promise<ShareTargets> {
  return (await api().get<ShareTargets>("/share-targets")).data;
}

export async function listIncidents(params: {
  monitorId?: number;
  before?: number;
  limit?: number;
}): Promise<IncidentView[]> {
  const { data } = await api().get<{ incidents: IncidentView[] }>(
    "/incidents",
    { params },
  );
  return data.incidents;
}

export async function ackIncident(id: number, note: string): Promise<void> {
  await api().post(`/incidents/${id}/ack`, { note });
}

export async function listMaintenance(): Promise<MaintenanceView[]> {
  const { data } = await api().get<{ windows: MaintenanceView[] }>(
    "/maintenance",
  );
  return data.windows;
}

export async function saveMaintenance(
  input: MaintenanceInput,
  id?: number,
): Promise<void> {
  if (id) await api().put(`/maintenance/${id}`, input);
  else await api().post("/maintenance", input);
}

export async function deleteMaintenance(id: number): Promise<void> {
  await api().delete(`/maintenance/${id}`);
}

export async function listPages(): Promise<StatusPageView[]> {
  const { data } = await api().get<{ pages: StatusPageView[] }>("/pages");
  return data.pages;
}

export async function savePage(
  input: StatusPageInput,
  id?: number,
): Promise<void> {
  if (id) await api().put(`/pages/${id}`, input);
  else await api().post("/pages", input);
}

export async function deletePage(id: number): Promise<void> {
  await api().delete(`/pages/${id}`);
}

export async function listNotes(pageId: number): Promise<StatusNoteView[]> {
  const { data } = await api().get<{ notes: StatusNoteView[] }>(
    `/pages/${pageId}/notes`,
  );
  return data.notes;
}

export async function addNote(
  pageId: number,
  note: { title: string; body: string; level: NoteLevel },
): Promise<void> {
  await api().post(`/pages/${pageId}/notes`, note);
}

export async function resolveNote(
  pageId: number,
  noteId: number,
): Promise<void> {
  await api().post(`/pages/${pageId}/notes/${noteId}`);
}

export async function deleteNote(
  pageId: number,
  noteId: number,
): Promise<void> {
  await api().delete(`/pages/${pageId}/notes/${noteId}`);
}
