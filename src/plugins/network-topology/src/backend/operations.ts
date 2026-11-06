import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { GraphRepository } from "./repository.js";

interface GraphNode {
  data?: { id?: string; name?: string; label?: string; [key: string]: unknown };
}

/** The saved graph as a read action, for the assistant and the CLI. */
export function registerOperations(
  ctx: PluginContext,
  repo: GraphRepository,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("network-topology.get-graph", {
    run: async () => {
      const userId = ctx.currentActor();
      const record = userId ? await repo.findByUserId(userId) : null;
      let topology: { nodes?: GraphNode[]; edges?: unknown[] } | null = null;
      try {
        topology = record?.topology ? JSON.parse(record.topology) : null;
      } catch {
        topology = null;
      }
      const nodes = topology?.nodes ?? [];
      const edges = topology?.edges ?? [];
      return {
        summary: `${nodes.length} nodes, ${edges.length} links`,
        data: {
          nodes: nodes.map((node) => ({
            id: node.data?.id ?? "",
            name: node.data?.name ?? node.data?.label ?? node.data?.id ?? "",
          })),
          edges,
        },
      };
    },
  });
}
