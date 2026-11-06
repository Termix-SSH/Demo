import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { RepoSummary } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { GitService } from "./service.js";

const CACHE_MS = 60_000;
/** Hosts checked at once, so a big fleet does not open every connection together. */
export const SUMMARY_CONCURRENCY = 4;

/** Runs `fn` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export interface SummaryCache {
  check: (hostId: number, refresh?: boolean) => Promise<RepoSummary>;
  forget: (hostId: number) => void;
}

export function createSummaryCache(
  ctx: PluginContext,
  service: GitService,
): SummaryCache {
  const cache = new Map<string, RepoSummary>();
  const key = (hostId: number) => `${ctx.currentActor() ?? ""}:${hostId}`;
  return {
    check: async (hostId, refresh = false) => {
      const cached = cache.get(key(hostId));
      if (
        !refresh &&
        cached &&
        Date.now() - Date.parse(cached.checkedAt) < CACHE_MS
      ) {
        return cached;
      }
      const checkedAt = new Date().toISOString();
      let fresh: RepoSummary;
      try {
        const settings = await readHostSettings(ctx, hostId);
        const repos = await service.repos(hostId, settings);
        fresh = {
          hostId,
          checkedAt,
          repos: repos
            .filter((r) => !r.error)
            .map((r) => ({
              path: r.path,
              name: r.name,
              branch: r.branch,
              ahead: r.ahead,
              behind: r.behind,
              changed: r.changed,
              untracked: r.untracked,
              conflicts: r.conflicts,
              failing: r.auto?.failing === true,
            })),
        };
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          repos: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
      cache.set(key(hostId), fresh);
      return fresh;
    },
    forget: (hostId) => {
      for (const k of [...cache.keys()]) {
        if (k.endsWith(`:${hostId}`)) cache.delete(k);
      }
    },
  };
}

/** GET /summary: repos on every host the caller can reach with the plugin on. */
export function registerSummary(
  router: Router,
  ctx: PluginContext,
  summary: SummaryCache,
): void {
  /**
   * @openapi
   * /plugin-api/git/summary:
   *   get:
   *     summary: Repos on every host
   *     description: One entry per host with Git turned on, with each repo's branch, ahead and behind counts and changed files. Kept for a minute unless refresh=1.
   *     tags:
   *       - Git
   *     parameters:
   *       - in: query
   *         name: refresh
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: One entry per host.
   */
  router.get("/summary", async (req: Request, res: Response) => {
    try {
      const refresh = req.query.refresh === "1";
      const hosts = await ctx.hosts.list();
      const enabled: number[] = [];
      for (const host of hosts) {
        if ((await readHostSettings(ctx, host.id)).enabled)
          enabled.push(host.id);
      }
      res.json(
        await mapLimit(enabled, SUMMARY_CONCURRENCY, (hostId) =>
          summary.check(hostId, refresh),
        ),
      );
    } catch (error) {
      ctx.log.error(
        "Failed to build the git summary",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to build the git summary" });
    }
  });
}
