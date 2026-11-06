import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Row } from "./store.js";

export class NotesError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const FOLDER_SCAN = 40;

type Level = "connect" | "edit";

interface Target {
  scope: string;
  hostId?: number | null;
  folder?: string | null;
}

/** Who may read or change a note: host access, folder hosts or the owner. */
export function createAccess(ctx: PluginContext) {
  const actor = () => ctx.currentActor() as string;

  async function hostAllows(hostId: number, level: Level): Promise<boolean> {
    if (!Number.isInteger(hostId) || hostId < 1) return false;
    return (await ctx.hosts.checkAccess(hostId, level)).hasAccess;
  }

  async function folderAllows(folder: string, level: Level): Promise<boolean> {
    const hosts = (await ctx.hosts.list())
      .filter((host) => (host.folder ?? "") === folder)
      .slice(0, FOLDER_SCAN);
    if (level === "connect") return hosts.length > 0;
    for (const host of hosts) {
      if (await hostAllows(host.id, "edit")) return true;
    }
    return false;
  }

  /** Throws 404 when the user cannot see the target at all. */
  async function gateTarget(
    target: Target,
    level: Level,
    ownerId?: string,
  ): Promise<void> {
    const me = actor();
    if (target.scope === "global") {
      if (ownerId && ownerId !== me)
        throw new NotesError("Note not found", 404);
      return;
    }
    if (target.scope === "host") {
      const hostId = Number(target.hostId);
      if (!Number.isInteger(hostId) || hostId < 1) {
        throw new NotesError("The host id is not valid");
      }
      if (await hostAllows(hostId, level)) return;
      if (level === "edit" && (await hostAllows(hostId, "connect"))) {
        throw new NotesError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new NotesError("Host not found", 404);
    }
    if (target.scope === "folder") {
      const folder = (target.folder ?? "").trim();
      if (!folder) throw new NotesError("The folder is not valid");
      if (await folderAllows(folder, level)) return;
      if (level === "edit") {
        if (ownerId === me && (await folderAllows(folder, "connect"))) return;
        if (await folderAllows(folder, "connect")) {
          throw new NotesError(
            "You need edit access to a host in this folder",
            403,
            { code: "HOST_EDIT_REQUIRED" },
          );
        }
      }
      throw new NotesError("Folder not found", 404);
    }
    throw new NotesError("The scope is not valid");
  }

  async function canEdit(row: Row): Promise<boolean> {
    try {
      await gateTarget(row, "edit", row.userId);
      return true;
    } catch {
      return false;
    }
  }

  /** Host ids and folder names the user can open. */
  async function visible(): Promise<{ hostIds: number[]; folders: string[] }> {
    const hosts = await ctx.hosts.list();
    const folders = new Set<string>();
    for (const host of hosts) {
      if (host.folder) folders.add(host.folder);
    }
    return { hostIds: hosts.map((host) => host.id), folders: [...folders] };
  }

  return { actor, gateTarget, canEdit, visible };
}

export type Access = ReturnType<typeof createAccess>;
