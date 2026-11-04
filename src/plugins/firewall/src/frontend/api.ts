import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ApplyResult,
  ChangeResult,
  Defaults,
  DriftResult,
  Fail2banStatus,
  FirewallStatus,
  HostSummary,
  PendingChange,
  RuleSet,
  RuleSpec,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Firewall is not ready");
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

export function errorReason(error: unknown): string {
  const reason = (error as { response?: { data?: { reason?: unknown } } })
    ?.response?.data?.reason;
  return typeof reason === "string" ? reason : "";
}

const enc = encodeURIComponent;

export interface Force {
  force?: boolean;
}

export async function getStatus(host: number): Promise<FirewallStatus> {
  return (await api().get<FirewallStatus>(`/${host}/status`)).data;
}

export async function getRaw(host: number): Promise<string> {
  return (await api().get<{ output: string }>(`/${host}/raw`)).data.output;
}

export async function addRule(
  host: number,
  spec: RuleSpec & { zone?: string } & Force,
): Promise<ChangeResult> {
  return (await api().post<ChangeResult>(`/${host}/rules`, spec)).data;
}

export async function updateRule(
  host: number,
  id: string,
  spec: RuleSpec & Force,
): Promise<ChangeResult> {
  return (await api().put<ChangeResult>(`/${host}/rules/${enc(id)}`, spec))
    .data;
}

export async function deleteRule(
  host: number,
  id: string,
  force = false,
): Promise<ChangeResult> {
  return (
    await api().delete<ChangeResult>(
      `/${host}/rules/${enc(id)}${force ? "?force=1" : ""}`,
    )
  ).data;
}

export async function setDefaults(
  host: number,
  defaults: Partial<Defaults> & Force,
): Promise<ChangeResult> {
  return (await api().post<ChangeResult>(`/${host}/defaults`, defaults)).data;
}

export async function enable(
  host: number,
  body: { allowSsh: boolean } & Force,
): Promise<ChangeResult> {
  return (await api().post<ChangeResult>(`/${host}/enable`, body)).data;
}

export async function disable(host: number): Promise<ChangeResult> {
  return (await api().post<ChangeResult>(`/${host}/disable`, {})).data;
}

export async function install(host: number, what: string): Promise<void> {
  await api().post(`/${host}/install`, { what });
}

export async function setZoneTarget(
  host: number,
  zone: string,
  target: string,
  force = false,
): Promise<ChangeResult> {
  return (
    await api().post<ChangeResult>(`/${host}/zones/${enc(zone)}/target`, {
      target,
      force,
    })
  ).data;
}

export async function setDefaultZone(
  host: number,
  zone: string,
  force = false,
): Promise<ChangeResult> {
  return (
    await api().post<ChangeResult>(`/${host}/default-zone`, { zone, force })
  ).data;
}

export async function getPending(host: number): Promise<PendingChange | null> {
  return (
    await api().get<{ pending: PendingChange | null }>(`/${host}/pending`)
  ).data.pending;
}

export async function keepPending(host: number): Promise<void> {
  await api().post(`/${host}/pending/keep`, {});
}

export async function undoPending(host: number): Promise<void> {
  await api().post(`/${host}/pending/undo`, {});
}

export async function getFail2ban(host: number): Promise<Fail2banStatus> {
  return (await api().get<Fail2banStatus>(`/${host}/fail2ban`)).data;
}

export async function ban(
  host: number,
  jail: string,
  ip: string,
  force = false,
): Promise<void> {
  await api().post(`/${host}/fail2ban/ban`, { jail, ip, force });
}

export async function unban(
  host: number,
  jail: string,
  ip: string,
): Promise<void> {
  await api().post(`/${host}/fail2ban/unban`, { jail, ip });
}

export async function startFail2ban(host: number): Promise<void> {
  await api().post(`/${host}/fail2ban/start`, {});
}

export async function getWatch(host: number): Promise<boolean> {
  return (await api().get<{ on: boolean }>(`/${host}/watch`)).data.on;
}

export async function setWatch(host: number, on: boolean): Promise<void> {
  await api().put(`/${host}/watch`, { on });
}

export async function getSummary(refresh = false): Promise<HostSummary[]> {
  return (
    await api().get<HostSummary[]>(`/summary${refresh ? "?refresh=1" : ""}`)
  ).data;
}

export async function listRuleSets(): Promise<RuleSet[]> {
  return (await api().get<RuleSet[]>("/rulesets")).data;
}

export interface RuleSetInput {
  name: string;
  description: string;
  rules: RuleSpec[];
  hosts: number[];
}

export async function createRuleSet(input: RuleSetInput): Promise<RuleSet> {
  return (await api().post<RuleSet>("/rulesets", input)).data;
}

export async function updateRuleSet(
  id: number,
  input: RuleSetInput,
): Promise<RuleSet> {
  return (await api().put<RuleSet>(`/rulesets/${id}`, input)).data;
}

export async function deleteRuleSet(id: number): Promise<void> {
  await api().delete(`/rulesets/${id}`);
}

export async function driftOf(id: number): Promise<DriftResult[]> {
  return (await api().get<DriftResult[]>(`/rulesets/${id}/drift`)).data;
}

export async function applyRuleSet(
  id: number,
  body: { hostIds?: number[]; fleetId?: number } & Force,
): Promise<ApplyResult[]> {
  return (await api().post<ApplyResult[]>(`/rulesets/${id}/apply`, body)).data;
}

export async function listFleets(): Promise<
  Array<{ id: number; name: string }>
> {
  return (await api().get<Array<{ id: number; name: string }>>("/fleets")).data;
}
