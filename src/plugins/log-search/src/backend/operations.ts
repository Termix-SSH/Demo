import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { isSource, parseSearch, rangeMs } from "./query.js";
import type { SearchService } from "./search.js";

const MAX_TEXT = 60_000;

/** The search as an action for Operations, the assistant, MCP and the CLI. */
export function registerOperations(
  ctx: PluginContext,
  search: SearchService,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("log-search.search", {
    run: async (input) => {
      const now = Date.now();
      const source = String(input.source ?? "all");
      const request = parseSearch(
        {
          query: input.query,
          from: now - rangeMs(input.range),
          to: now,
          sources: isSource(source) ? [source] : [],
          level: input.level,
          limit: Math.min(200, Number(input.limit) || 50),
        },
        now,
      );
      const response = await search.run(request, now);
      const lines = response.entries.map(
        (e) =>
          `${new Date(e.time).toISOString()} ${e.host} ${e.source}:${e.origin} ${e.message}`,
      );
      const failed = response.hosts.filter((h) => h.status === "error");
      const text = [
        ...lines,
        ...failed.map((h) => `! ${h.host}: ${h.error ?? "failed"}`),
      ]
        .join("\n")
        .slice(0, MAX_TEXT);
      return {
        summary: `${response.entries.length} lines from ${response.hosts.length} hosts`,
        data: { text },
      };
    },
  });
}
