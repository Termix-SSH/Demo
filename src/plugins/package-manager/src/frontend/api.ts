import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ActionResult,
  ExtraManager,
  HistoryItem,
  InstalledItem,
  PackageAction,
  PackagesStatus,
  RepoItem,
  SearchItem,
  UpdateItem,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Packages is not ready");
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

/** The package manager output a failed action sent back, if any. */
export function errorOutput(error: unknown): string {
  const output = (error as { response?: { data?: { output?: unknown } } })
    ?.response?.data?.output;
  return typeof output === "string" ? output : "";
}

/** "?manager=snap" for an extra, nothing for the system manager. */
function pick(manager?: ExtraManager | null, joiner = "?"): string {
  return manager ? `${joiner}manager=${manager}` : "";
}

export async function getStatus(host: number): Promise<PackagesStatus> {
  return (await api().get<PackagesStatus>(`/${host}/status`)).data;
}

export async function getUpdates(
  host: number,
  manager?: ExtraManager | null,
): Promise<UpdateItem[]> {
  return (await api().get<UpdateItem[]>(`/${host}/updates${pick(manager)}`))
    .data;
}

export async function getInstalled(
  host: number,
  manager?: ExtraManager | null,
): Promise<InstalledItem[]> {
  return (
    await api().get<InstalledItem[]>(`/${host}/installed${pick(manager)}`)
  ).data;
}

export async function searchPackages(
  host: number,
  query: string,
  manager?: ExtraManager | null,
): Promise<SearchItem[]> {
  return (
    await api().get<SearchItem[]>(
      `/${host}/search?q=${encodeURIComponent(query)}${pick(manager, "&")}`,
    )
  ).data;
}

export async function getHistory(
  host: number,
  manager?: ExtraManager | null,
): Promise<HistoryItem[]> {
  return (await api().get<HistoryItem[]>(`/${host}/history${pick(manager)}`))
    .data;
}

export async function getRepos(
  host: number,
  manager?: ExtraManager | null,
): Promise<RepoItem[]> {
  return (await api().get<RepoItem[]>(`/${host}/repos${pick(manager)}`)).data;
}

export async function runAction(
  host: number,
  action: PackageAction,
  packages: string[] = [],
  manager?: ExtraManager | null,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(`/${host}/action`, {
      action,
      packages: packages.length ? packages : undefined,
      ...(manager ? { manager } : {}),
    })
  ).data;
}
