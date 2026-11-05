import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostCertSummary } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { CertService } from "./service.js";

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
  check: (hostId: number, refresh?: boolean) => Promise<HostCertSummary>;
  forget: (hostId: number) => void;
}

export function createSummaryCache(
  ctx: PluginContext,
  service: CertService,
): SummaryCache {
  const cache = new Map<string, HostCertSummary>();
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
      let fresh: HostCertSummary;
      try {
        const certs = await service.list(
          hostId,
          await readHostSettings(ctx, hostId),
        );
        fresh = {
          hostId,
          checkedAt,
          certs: certs.map((cert) => ({
            name: cert.name,
            client: cert.client,
            daysLeft: cert.daysLeft,
          })),
        };
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          certs: [],
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

/** GET /summary: certificates on every host the caller can reach with Certificates on. */
export function registerSummary(
  router: Router,
  ctx: PluginContext,
  summary: SummaryCache,
): void {
  /**
   * @openapi
   * /plugin-api/certificates/summary:
   *   get:
   *     summary: Certificates on every host
   *     description: One entry per host with Certificates turned on, with each certificate's days left. Kept for an hour unless refresh=1.
   *     tags:
   *       - Certificates
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
        "Failed to build the certificate summary",
        error instanceof Error ? error : undefined,
      );
      res
        .status(500)
        .json({ error: "Failed to build the certificate summary" });
    }
  });
}
