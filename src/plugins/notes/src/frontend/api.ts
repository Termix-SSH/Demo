import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type { Note, NoteInput, NoteQuery, NoteSummary } from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Notes is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export async function listNotes(query: NoteQuery): Promise<NoteSummary[]> {
  const params: Record<string, string | number> = { scope: query.scope };
  if (query.hostId !== undefined) params.hostId = query.hostId;
  if (query.folder) params.folder = query.folder;
  if (query.q) params.q = query.q;
  return (await api().get<NoteSummary[]>("/notes", { params })).data;
}

export async function searchNotes(q: string): Promise<NoteSummary[]> {
  return (await api().get<NoteSummary[]>("/search", { params: { q } })).data;
}

export async function getNote(uid: string): Promise<Note> {
  return (await api().get<Note>(`/notes/${uid}`)).data;
}

export async function createNote(input: NoteInput): Promise<Note> {
  return (await api().post<Note>("/notes", input)).data;
}

export async function updateNote(
  uid: string,
  patch: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>,
): Promise<Note> {
  return (await api().put<Note>(`/notes/${uid}`, patch)).data;
}

export async function deleteNote(uid: string): Promise<void> {
  await api().delete(`/notes/${uid}`);
}
