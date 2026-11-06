import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CronHostSummary } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { CronService } from "./service.js";

const CACHE_MS = 60_000;
const SUMMARY_CONCURRENCY = 4;

async function mapLimit<T, R>(
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
  check: (hostId: number, refresh?: boolean) => Promise<CronHostSummary>;
}

export function createSummaryCache(
  ctx: PluginContext,
  service: CronService,
): SummaryCache {
  const cache = new Map<string, CronHostSummary>();
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
      let fresh: CronHostSummary;
      try {
        const s = await readHostSettings(ctx, hostId);
        const status = await service.status(hostId, s);
        const tab = status.installed
          ? await service.crontab(hostId, s, "")
          : { jobs: [] };
        fresh = {
          hostId,
          checkedAt,
          installed: status.installed,
          running: status.running,
          jobs: tab.jobs.length,
          disabled: tab.jobs.filter((job) => !job.enabled).length,
        };
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          installed: false,
          running: false,
          jobs: 0,
          disabled: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      cache.set(key(hostId), fresh);
      return fresh;
    },
  };
}

export function registerSummary(
  router: Router,
  ctx: PluginContext,
  summary: SummaryCache,
): void {
  /**
   * @openapi
   * /plugin-api/cron/summary:
   *   get:
   *     summary: Cron state on every host
   *     description: One entry per host with Cron turned on, checked as the caller and cached for a minute unless refresh=1.
   *     tags:
   *       - Cron
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
      const enabled: number[] = [];
      for (const host of await ctx.hosts.list()) {
        if ((await readHostSettings(ctx, host.id)).enabled) {
          enabled.push(host.id);
        }
      }
      res.json(
        await mapLimit(enabled, SUMMARY_CONCURRENCY, (hostId) =>
          summary.check(hostId, refresh),
        ),
      );
    } catch (error) {
      ctx.log.error(
        "Failed to build the cron summary",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to build the cron summary" });
    }
  });
}
