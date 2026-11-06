import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { AnsibleHostSummary, RunSummary } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";

const CACHE_MS = 60_000;
const SUMMARY_CONCURRENCY = 4;
const WINDOW_MS = 7 * 24 * 60 * 60_000;

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

const bad = (run: RunSummary) => run.state === "failed" || run.state === "lost";

/** One alert per run that ended failed or lost. Alerted ids are kept in kv. */
export async function alertRuns(
  ctx: PluginContext,
  hostId: number,
  runs: RunSummary[],
): Promise<void> {
  const userId = ctx.currentActor();
  if (!userId) return;
  const key = `alerted:${userId}:${hostId}`;
  const stored = await ctx.kv.get(key).catch(() => null);
  const seen = new Set(Array.isArray(stored) ? (stored as string[]) : []);
  const recent = runs.filter(
    (run) => bad(run) && Date.now() - run.startedAt < WINDOW_MS,
  );
  const first = !Array.isArray(stored);
  const host = await ctx.hosts.get(hostId).catch(() => null);
  const hostName = host?.name || host?.ip || `#${hostId}`;
  for (const run of recent) {
    if (seen.has(run.id) || first) continue;
    await ctx.notify.send({
      title:
        run.state === "lost"
          ? `Ansible run ${run.title} was lost on ${hostName}`
          : `Ansible run ${run.title} failed on ${hostName}`,
      body: "Open the Ansible tab to read the log.",
      severity: "warning",
      category: `ansible.${run.state}`,
      audience: { userId },
      link: { tab: "ansible" },
      dedupeKey: `ansible:${hostId}:${run.id}`,
      context: { hostId, hostName, runId: run.id },
    });
  }
  const next = recent.map((run) => run.id);
  if (first || next.length !== seen.size || next.some((id) => !seen.has(id))) {
    await ctx.kv.set(key, next);
  }
}

export interface SummaryCache {
  check: (hostId: number, refresh?: boolean) => Promise<AnsibleHostSummary>;
}

export function createSummaryCache(
  ctx: PluginContext,
  service: Pick<Service, "runs">,
): SummaryCache {
  const cache = new Map<string, AnsibleHostSummary>();
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
      let fresh: AnsibleHostSummary;
      try {
        const runs = await service.runs(hostId);
        const newest = runs[0];
        fresh = {
          hostId,
          checkedAt,
          running: runs.filter((run) => run.state === "running").length,
          failed: runs.filter(
            (run) => bad(run) && Date.now() - run.startedAt < WINDOW_MS,
          ).length,
          last: newest
            ? {
                id: newest.id,
                title: newest.title,
                state: newest.state,
                startedAt: newest.startedAt,
              }
            : null,
        };
        if ((await readHostSettings(ctx, hostId)).alerts) {
          await alertRuns(ctx, hostId, runs).catch((error) =>
            ctx.log.debug(
              `Ansible alert failed for host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          running: 0,
          failed: 0,
          last: null,
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
   * /plugin-api/ansible/summary:
   *   get:
   *     summary: Recent Ansible runs on every host
   *     description: One entry per host with Ansible turned on, checked as the caller and cached for a minute unless refresh=1.
   *     tags:
   *       - Ansible
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
        "Failed to build the ansible summary",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to build the ansible summary" });
    }
  });
}
