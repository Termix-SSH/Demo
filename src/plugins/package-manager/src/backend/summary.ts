import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostUpdateSummary } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { PackageService } from "./service.js";

const CACHE_MS = 60 * 60_000;
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
  /** Pending updates for one host, cached for an hour per user. */
  check: (hostId: number, refresh?: boolean) => Promise<HostUpdateSummary>;
  forget: (hostId: number) => void;
}

export function createSummaryCache(
  ctx: PluginContext,
  service: PackageService,
): SummaryCache {
  const cache = new Map<string, HostUpdateSummary>();
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
      let fresh: HostUpdateSummary;
      try {
        const s = await readHostSettings(ctx, hostId);
        const [status, updates] = [
          await service.status(hostId, s),
          await service.updates(hostId, s),
        ];
        fresh = {
          hostId,
          checkedAt,
          updates: updates.length,
          security: updates.filter((item) => item.security).length,
          reboot: status.rebootRequired === true,
        };
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          updates: 0,
          security: 0,
          reboot: false,
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

/** GET /summary: pending updates on every host the caller can reach with Packages on. */
export function registerSummary(
  router: Router,
  ctx: PluginContext,
  summary: SummaryCache,
): void {
  /**
   * @openapi
   * /plugin-api/package-manager/summary:
   *   get:
   *     summary: Pending updates on every host
   *     description: One entry per host with Packages turned on. Each host is checked as the caller and kept for an hour unless refresh=1.
   *     tags:
   *       - Packages
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
        "Failed to build the update summary",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to build the update summary" });
    }
  });
}
