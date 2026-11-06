import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  LIMITS,
  type Note,
  type NoteInput,
  type NoteQuery,
  type NoteSummary,
  type Scope,
} from "../shared/types.js";
import { NotesError, type Access } from "./access.js";
import { toNote, toSummary, type Row, type Store } from "./store.js";

const SCOPES: Scope[] = ["host", "folder", "global"];

/** Cleans tags: trimmed, lowercase, unique, capped. */
export function cleanTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new NotesError("Tags must be a list");
  const out: string[] = [];
  for (const tag of raw) {
    const value = String(tag).trim().toLowerCase().slice(0, LIMITS.tag);
    if (value && !out.includes(value)) out.push(value);
  }
  return out.slice(0, LIMITS.tags);
}

function cleanText(
  raw: unknown,
  max: number,
  label: string,
  required = false,
): string {
  if (raw === undefined || raw === null) raw = "";
  if (typeof raw !== "string") throw new NotesError(`${label} must be text`);
  if (raw.length > max) throw new NotesError(`${label} is too long`);
  if (required && !raw.trim()) throw new NotesError(`${label} is required`);
  return raw;
}

export function parseScope(raw: unknown): Scope {
  if (typeof raw === "string" && SCOPES.includes(raw as Scope)) {
    return raw as Scope;
  }
  throw new NotesError("The scope is not valid");
}

/** Reads a create body into a clean input. */
export function parseInput(body: Record<string, unknown>): NoteInput {
  const scope = parseScope(body.scope);
  const hostId = body.hostId === undefined ? null : Number(body.hostId);
  const folder =
    typeof body.folder === "string" ? body.folder.trim() || null : null;
  const title = cleanText(body.title, LIMITS.title, "The title").trim();
  return {
    scope,
    hostId: scope === "host" ? hostId : null,
    folder: scope === "folder" ? folder : null,
    title: title || "Untitled",
    body: cleanText(body.body, LIMITS.body, "The note"),
    tags: cleanTags(body.tags),
    pinned: body.pinned === true,
  };
}

function matches(row: Row, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    row.title.toLowerCase().includes(needle) ||
    row.body.toLowerCase().includes(needle) ||
    row.tags.some((tag) => tag.includes(needle))
  );
}

/** Pinned first, then newest. */
function order(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function createService(
  ctx: PluginContext,
  store: Store,
  access: Access,
) {
  async function summaries(rows: Row[], q?: string): Promise<NoteSummary[]> {
    const me = access.actor();
    const kept = q?.trim()
      ? rows.filter((row) => matches(row, q.trim()))
      : rows;
    const out: NoteSummary[] = [];
    for (const row of order(kept)) {
      out.push(toSummary(row, me, await access.canEdit(row)));
    }
    return out;
  }

  async function load(uid: string, level: "connect" | "edit"): Promise<Row> {
    const row = await store.byUid(uid);
    if (!row) throw new NotesError("Note not found", 404);
    await access.gateTarget(row, level, row.userId);
    return row;
  }

  function audit(action: string, row: Row, ok = true) {
    void ctx.audit.record({
      action: `notes.${action}`,
      resourceType: row.scope === "host" ? "host" : "note",
      resourceId: row.scope === "host" ? String(row.hostId) : row.uid,
      resourceName: row.title,
      success: ok,
    });
  }

  return {
    async list(query: NoteQuery): Promise<NoteSummary[]> {
      const scope = parseScope(query.scope);
      if (scope === "host") {
        await access.gateTarget(
          { scope, hostId: Number(query.hostId) },
          "connect",
        );
        return summaries(await store.forHost(Number(query.hostId)), query.q);
      }
      if (scope === "folder") {
        const folder = (query.folder ?? "").trim();
        await access.gateTarget({ scope, folder }, "connect");
        return summaries(await store.forFolder(folder), query.q);
      }
      return summaries(await store.forUser(access.actor()), query.q);
    },

    /** Search across every note the user can open. */
    async search(q: string, limit = 50): Promise<NoteSummary[]> {
      const { hostIds, folders } = await access.visible();
      const rows = await store.visible(access.actor(), hostIds, folders);
      return (await summaries(rows, q || undefined)).slice(0, limit);
    },

    async folders(): Promise<string[]> {
      return (await access.visible()).folders.sort();
    },

    async get(uid: string): Promise<Note> {
      const row = await load(uid, "connect");
      return toNote(row, access.actor(), await access.canEdit(row));
    },

    async create(input: NoteInput): Promise<Note> {
      await access.gateTarget(input, "edit");
      const row = await store.create(access.actor(), input);
      audit("create", row);
      return toNote(row, access.actor(), true);
    },

    async update(uid: string, body: Record<string, unknown>): Promise<Note> {
      const row = await load(uid, "edit");
      const patch: Parameters<Store["update"]>[1] = {};
      if (body.title !== undefined) {
        patch.title =
          cleanText(body.title, LIMITS.title, "The title").trim() || "Untitled";
      }
      if (body.body !== undefined) {
        patch.body = cleanText(body.body, LIMITS.body, "The note");
      }
      if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
      if (body.pinned !== undefined) patch.pinned = body.pinned === true;
      await store.update(uid, patch);
      audit("update", row);
      return this.get(uid);
    },

    async remove(uid: string): Promise<void> {
      const row = await load(uid, "edit");
      await store.remove(uid);
      audit("delete", row);
    },

    /** Adds text to the end of a note. */
    async append(uid: string, text: string): Promise<Note> {
      const row = await load(uid, "edit");
      const next = row.body
        ? `${row.body.replace(/\s+$/, "")}\n\n${text}`
        : text;
      return this.update(uid, { body: next });
    },
  };
}

export type Service = ReturnType<typeof createService>;
