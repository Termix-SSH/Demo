import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import { operationsApi } from "@termix-ssh/plugin-sdk/ui";
import type {
  OperationField,
  SignalResult,
} from "@termix-ssh/plugin-sdk/operations";
import type {
  Baseline,
  BaselineResult,
  Batch,
  BatchTarget,
  Rule,
  TargetSpec,
} from "../shared/types";

let api: PluginApiClient | null = null;

export function initApi(client: PluginApiClient): void {
  api = client;
}

function plugin(): PluginApiClient {
  if (!api) throw new Error("Operations Center is not ready");
  return api;
}

export interface CatalogField extends OperationField {
  label: string;
  description?: string;
  placeholder?: string;
  optionLabels?: Record<string, string>;
}

export interface CatalogAction {
  id: string;
  pluginId: string;
  pluginName: string;
  official: boolean;
  title: string;
  description?: string;
  icon?: string;
  scope: "host" | "resource" | "server";
  resource?: string;
  risk: "read" | "change" | "destructive";
  hostAccess?: string;
  dryRun?: "native" | "describe";
  idempotent?: boolean;
  check?: string;
  undo?: string;
  inputs: CatalogField[];
  when?: { settings?: Record<string, unknown>; os?: string[] };
  surfaces?: Record<string, boolean>;
  available: boolean;
  /** Hosts a `when` action fits, worked out by core (26.11.1+). */
  hostIds?: number[];
}

export interface CatalogResource {
  id: string;
  pluginId: string;
  title: string;
  icon?: string;
  list: string;
  key: string;
  name: string;
  status?: string;
  url?: string;
  tab?: string;
  columns: { key: string; title: string; type?: string }[];
  filters?: string[];
}

export interface CatalogSignal {
  id: string;
  pluginId: string;
  title: string;
  read: string;
  scope: "host" | "server";
  kind: string;
  fix?: string;
}

export interface Catalog {
  actions: CatalogAction[];
  events: { id: string; pluginId: string; title: string }[];
  resources: CatalogResource[];
  signals: CatalogSignal[];
}

export interface Outcome {
  runId: string | null;
  status: string;
  summary?: string;
  changed?: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  approvalId?: string;
}

export interface Run {
  id: string;
  actionId: string;
  pluginId: string;
  username: string;
  origin: { kind: string; pluginId?: string; via?: string } | undefined;
  hostId: number | null;
  hostName: string | null;
  batchId: string | null;
  dryRun: boolean;
  risk: string;
  status: string;
  summary: string | null;
  input: unknown;
  output: unknown;
  undoAvailable: boolean;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Approval {
  id: string;
  runId: string;
  reason: string | null;
  allowSelf: boolean;
  requestedBy: string | null;
  expiresAt: string;
  createdAt: string;
  run: Run;
}

export interface HostRead<T> {
  hostId: number;
  state: "ok" | "loading" | "offline" | "error" | "no-access";
  value?: T;
  error?: string;
  fetchedAt?: string;
}

export interface ResourceRows {
  rows: { hostId: number; key: string; row: Record<string, unknown> }[];
  hosts: Omit<HostRead<unknown>, "value">[];
}

export interface SignalRead {
  id: string;
  hosts: HostRead<SignalResult>[];
  result?: SignalResult;
}

/** A readable message from an axios style error. */
export function errorText(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data;
  if (typeof data?.error === "string") return data.error;
  return error instanceof Error && error.message ? error.message : fallback;
}

export function errorCode(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data?.code;
  return typeof code === "string" ? code : undefined;
}

let cached: { lang: string; at: number; value: Promise<Catalog> } | null = null;

/** The catalog, kept for a minute so pages and the palette share it. */
export function getCatalog(lang: string, fresh = false): Promise<Catalog> {
  if (
    !fresh &&
    cached &&
    cached.lang === lang &&
    Date.now() - cached.at < 60_000
  ) {
    return cached.value;
  }
  const value = operationsApi
    .get<Catalog>("/catalog", { params: { lang } })
    .then((response) => response.data);
  value.catch(() => {
    cached = null;
  });
  cached = { lang, at: Date.now(), value };
  return value;
}

export async function runAction(
  actionId: string,
  body: {
    hostId?: number;
    resourceKey?: string;
    input?: Record<string, unknown>;
    dryRun?: boolean;
    confirmed?: boolean;
  },
): Promise<Outcome> {
  const { data } = await operationsApi.post<Outcome>(
    `/${encodeURIComponent(actionId)}/run`,
    body,
  );
  return data;
}

export async function listRuns(params: Record<string, unknown> = {}) {
  const { data } = await operationsApi.get<{ runs: Run[] }>("/runs", {
    params,
  });
  return data.runs;
}

export async function getRun(id: string): Promise<Run> {
  const { data } = await operationsApi.get<Run>(`/runs/${id}`);
  return data;
}

export async function cancelRun(id: string): Promise<boolean> {
  const { data } = await operationsApi.post<{ cancelled: boolean }>(
    `/runs/${id}/cancel`,
  );
  return data.cancelled;
}

export async function undoRun(id: string): Promise<Outcome> {
  const { data } = await operationsApi.post<Outcome>(`/runs/${id}/undo`, {
    confirmed: true,
  });
  return data;
}

export async function listApprovals(): Promise<Approval[]> {
  const { data } = await operationsApi.get<{ approvals: Approval[] }>(
    "/approvals",
  );
  return data.approvals;
}

export async function decideApproval(
  id: string,
  approve: boolean,
  comment?: string,
): Promise<Outcome> {
  const { data } = await operationsApi.post<Outcome>(`/approvals/${id}`, {
    approve,
    comment,
  });
  return data;
}

export async function getResources(
  id: string,
  options: { hostIds?: number[]; refresh?: boolean } = {},
): Promise<ResourceRows> {
  const { data } = await operationsApi.get<ResourceRows>(
    `/resources/${encodeURIComponent(id)}`,
    {
      params: {
        hostIds: options.hostIds?.join(","),
        refresh: options.refresh ? "true" : undefined,
      },
    },
  );
  return data;
}

export async function getSignals(hostIds?: number[]): Promise<SignalRead[]> {
  const { data } = await operationsApi.get<{ signals: SignalRead[] }>(
    "/signals",
    { params: { hostIds: hostIds?.join(",") } },
  );
  return data.signals;
}

export async function getTimeline(hostId?: number) {
  const { data } = await operationsApi.get<{
    events: {
      id: string;
      eventId: string;
      pluginId: string;
      hostId: number | null;
      severity: string | null;
      payload: unknown;
      createdAt: string;
    }[];
  }>("/timeline", { params: { hostId, limit: 30 } });
  return data.events;
}

export async function listRules(): Promise<Rule[]> {
  return (await plugin().get<{ rules: Rule[] }>("/rules")).data.rules;
}

export async function saveRule(rule: Partial<Rule>): Promise<Rule[]> {
  return (await plugin().post<{ rules: Rule[] }>("/rules", rule)).data.rules;
}

export async function deleteRule(id: number): Promise<Rule[]> {
  return (await plugin().delete<{ rules: Rule[] }>(`/rules/${id}`)).data.rules;
}

export async function listRollouts(): Promise<Batch[]> {
  return (await plugin().get<{ rollouts: Batch[] }>("/rollouts")).data.rollouts;
}

export async function getRollout(id: number) {
  return (
    await plugin().get<{ batch: Batch; targets: BatchTarget[] }>(
      `/rollouts/${id}`,
    )
  ).data;
}

export interface NewRollout {
  name: string;
  actionId: string;
  resourceKey?: string;
  input?: Record<string, unknown>;
  targets: TargetSpec;
  dryRun?: boolean;
  canary?: number;
  batchSize?: number;
  pauseSeconds?: number;
  stopAfterFailures?: number;
  start?: boolean;
}

export async function createRollout(spec: NewRollout): Promise<Batch> {
  return (await plugin().post<{ rollout: Batch }>("/rollouts", spec)).data
    .rollout;
}

export async function rolloutVerb(
  id: number,
  verb: "start" | "pause" | "stop" | "retry",
) {
  await plugin().post(`/rollouts/${id}/${verb}`);
}

export async function deleteRollout(id: number) {
  await plugin().delete(`/rollouts/${id}`);
}

export async function listBaselines(): Promise<Baseline[]> {
  return (await plugin().get<{ baselines: Baseline[] }>("/baselines")).data
    .baselines;
}

export async function saveBaseline(
  baseline: Record<string, unknown>,
): Promise<Baseline[]> {
  return (
    await plugin().post<{ baselines: Baseline[] }>("/baselines", baseline)
  ).data.baselines;
}

export async function deleteBaseline(id: number) {
  await plugin().delete(`/baselines/${id}`);
}

export async function runBaseline(id: number) {
  await plugin().post(`/baselines/${id}/run`);
}

export async function baselineResults(id: number): Promise<BaselineResult[]> {
  return (
    await plugin().get<{ results: BaselineResult[] }>(
      `/baselines/${id}/results`,
    )
  ).data.results;
}

export async function getAttention() {
  return (
    await plugin().get<{
      drifted: number;
      /** Older servers leave it out. */
      running?: number;
      rollouts: { id: number; name: string; reason: string | null }[];
    }>("/attention")
  ).data;
}
