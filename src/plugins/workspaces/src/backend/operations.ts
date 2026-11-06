import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { WorkspaceRepository } from "./repository.js";

/** The saved workspaces as a read action. Applying one happens in the browser. */
export function registerOperations(
  ctx: PluginContext,
  repo: WorkspaceRepository,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("workspaces.list-workspaces", {
    run: async () => {
      const userId = ctx.currentActor();
      const list = userId ? await repo.listByUser(userId) : [];
      const rows = list
        .filter((row) => row.kind === "manual")
        .map((row) => ({
          id: String(row.id),
          name: row.name,
          default: row.isDefault,
          lastUsed: row.lastUsedAt ?? "",
        }));
      return { summary: `${rows.length} workspaces`, data: { rows } };
    },
  });
}
