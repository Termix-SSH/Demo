import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { WireguardHostSummary } from "../shared/types.js";
import type { InterfaceManager } from "./interfaces.js";
import type { WireguardService } from "./service.js";

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

/**
 * One alert while an interface set to start at boot is not active. The names
 * sent last time are kept in kv, so a restart does not repeat the alert and a
 * recovery clears it.
 */
export async function alertDown(
  ctx: PluginContext,
  summary: WireguardHostSummary,
): Promise<void> {
  const userId = ctx.currentActor();
  if (!userId) return;
  const key = `down:${userId}:${summary.hostId}`;
  const sent = await ctx.kv.get(key).catch(() => null);
  const before = new Set(Array.isArray(sent) ? (sent as string[]) : []);
  const host = await ctx.hosts.get(summary.hostId).catch(() => null);
  const hostName = host?.name || host?.ip || `#${summary.hostId}`;
  for (const name of summary.downNames) {
    if (before.has(name)) continue;
    await ctx.notify.send({
      title: `WireGuard ${name} is down on ${hostName}`,
      body: "The interface is set to start at boot but is not active.",
      severity: "warning",
      category: "wireguard.down",
      audience: { userId },
      link: { tab: "wireguard" },
      dedupeKey: `wireguard:${summary.hostId}:${name}`,
      context: { hostId: summary.hostId, hostName, interface: name },
    });
  }
  const same =
    before.size === summary.downNames.length &&
    summary.downNames.every((name) => before.has(name));
  if (!same) await ctx.kv.set(key, summary.downNames);
}

export interface SummaryCache {
  check: (hostId: number, refresh?: boolean) => Promise<WireguardHostSummary>;
}

export function createSummaryCache(
  ctx: PluginContext,
  deps: {
    service: Pick<WireguardService, "status">;
    interfaces: Pick<InterfaceManager, "list">;
  },
): SummaryCache {
  const cache = new Map<string, WireguardHostSummary>();
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
      let fresh: WireguardHostSummary;
      try {
        const status = await deps.service.status(hostId);
        const list = status.installed ? await deps.interfaces.list(hostId) : [];
        const downNames = list
          .filter((iface) => iface.enabled && !iface.active)
          .map((iface) => iface.name);
        fresh = {
          hostId,
          checkedAt,
          installed: status.installed,
          total: list.length,
          up: list.filter((iface) => iface.active).length,
          down: downNames.length,
          downNames,
          clients: list.reduce((sum, iface) => sum + iface.clients, 0),
        };
        if ((await ctx.settings.getAll("host", hostId)).alertDown !== false) {
          await alertDown(ctx, fresh).catch((error) =>
            ctx.log.debug(
              `WireGuard alert failed for host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      } catch (error) {
        fresh = {
          hostId,
          checkedAt,
          installed: false,
          total: 0,
          up: 0,
          down: 0,
          downNames: [],
          clients: 0,
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
   * /plugin-api/wireguard/summary:
   *   get:
   *     summary: WireGuard state on every host
   *     description: One entry per host with WireGuard turned on, checked as the caller and cached for a minute unless refresh=1.
   *     tags:
   *       - WireGuard
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
        if (
          (await ctx.settings.getAll("host", host.id)).enableWireguard === true
        ) {
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
        "Failed to build the wireguard summary",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to build the wireguard summary" });
    }
  });
}
