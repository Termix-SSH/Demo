import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
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

export async function search(body: SearchRequest): Promise<SearchResponse> {
  return (await api().post<SearchResponse>("/search", body)).data;
}
