import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  SavedSearch,
  SavedSearchInput,
  SearchRequest,
  SearchResponse,
  SearchableHost,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Log Search is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export async function listHosts(): Promise<SearchableHost[]> {
  return (await api().get<{ hosts: SearchableHost[] }>("/hosts")).data.hosts;
}

export async function search(
  body: SearchRequest,
  run?: { runId: string; signal: AbortSignal },
): Promise<SearchResponse> {
  return (
    await api().post<SearchResponse>(
      "/search",
      run ? { ...body, runId: run.runId } : body,
      run ? { signal: run.signal } : undefined,
    )
  ).data;
}

/** Stops a search started with this run id on the server. */
export async function cancelSearch(runId: string): Promise<void> {
  await api().post("/search/cancel", { runId });
}

/** An id for one search run, so it can be stopped later. */
export function newRunId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listSaved(): Promise<SavedSearch[]> {
  return (
    (await api().get<{ saved?: SavedSearch[] }>("/saved")).data.saved ?? []
  );
}

export async function createSaved(
  body: SavedSearchInput,
): Promise<SavedSearch> {
  return (await api().post<SavedSearch>("/saved", body)).data;
}

export async function updateSaved(
  id: number,
  body: SavedSearchInput,
): Promise<SavedSearch> {
  return (await api().put<SavedSearch>(`/saved/${id}`, body)).data;
}

export async function deleteSaved(id: number): Promise<void> {
  await api().delete(`/saved/${id}`);
}

export async function listChannels(): Promise<
  Array<{ id: number; name: string }>
> {
  return (
    await api().get<{ channels: Array<{ id: number; name: string }> }>(
      "/channels",
    )
  ).data.channels;
}
