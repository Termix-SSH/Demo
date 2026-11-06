import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { ServerKind } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import { label } from "./servers.js";
import type { WebService } from "./service.js";

const WATCHES = "watches";
const LAST = "states";
const CHECK_MS = 60_000;

export interface Watch {
  userId: string;
  hostId: number;
}

export interface WatchStore {
  list: () => Promise<Watch[]>;
  isWatching: (userId: string, hostId: number) => Promise<boolean>;
  set: (userId: string, hostId: number, on: boolean) => Promise<void>;
}

export function createWatchStore(ctx: PluginContext): WatchStore {
  const list = async (): Promise<Watch[]> => {
    const value = await ctx.kv.get(WATCHES);
    return Array.isArray(value)
      ? value.filter(
          (w): w is Watch =>
            !!w &&
            typeof (w as Watch).userId === "string" &&
            Number.isInteger((w as Watch).hostId),
        )
      : [];
  };
  return {
    list,
    isWatching: async (userId, hostId) =>
      (await list()).some((w) => w.userId === userId && w.hostId === hostId),
    set: async (userId, hostId, on) => {
      const rest = (await list()).filter(
        (w) => !(w.userId === userId && w.hostId === hostId),
      );
      await ctx.kv.set(WATCHES, on ? [...rest, { userId, hostId }] : rest);
    },
  };
}

const up = (state: string) => state === "active" || state === "reloading";

/**
 * Every minute, checks the installed web servers on each watched host as the
 * user who watches it. Sends one alert when a server stops and one when it
 * runs again. The last state is kept in kv, so a restart does not repeat it.
 */
export function startWatchChecker(
  ctx: PluginContext,
  store: WatchStore,
  service: WebService,
): () => void {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const watches = await store.list().catch(() => [] as Watch[]);
      const lastValue = await ctx.kv.get(LAST).catch(() => null);
      const last: Record<string, boolean> =
        lastValue && typeof lastValue === "object"
          ? { ...(lastValue as Record<string, boolean>) }
          : {};
      for (const { userId, hostId } of watches) {
        try {
          await ctx.asUser(userId, async () => {
            if (!(await ctx.hosts.checkAccess(hostId, "connect")).hasAccess)
              return;
            const settings = await readHostSettings(ctx, hostId);
            if (!settings.enabled) return;
            const status = await service.status(hostId, settings);
            const host = await ctx.hosts.get(hostId).catch(() => null);
            const hostName = host?.name || host?.ip || `#${hostId}`;
            for (const server of status.servers) {
              if (!server.installed || !server.state) continue;
              const key = `${userId}:${hostId}:${server.kind}`;
              const now = up(server.state);
              const before = last[key];
              last[key] = now;
              if (before === undefined || before === now) continue;
              await notify(server.kind, now, hostId, hostName, userId);
            }
          });
        } catch (error) {
          ctx.log.debug(
            `Web server check failed for host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      for (const key of Object.keys(last)) {
        const [userId, hostId] = key.split(":");
        const watched = watches.some(
          (w) => w.userId === userId && String(w.hostId) === hostId,
        );
        if (!watched) delete last[key];
      }
      await ctx.kv.set(LAST, last).catch(() => undefined);
    } finally {
      running = false;
    }
  };

  const notify = (
    kind: ServerKind,
    now: boolean,
    hostId: number,
    hostName: string,
    userId: string,
  ) =>
    ctx.notify.send({
      title: now
        ? `${label(kind)} on ${hostName} is running again`
        : `${label(kind)} on ${hostName} stopped`,
      body: now
        ? "The web server is back up."
        : "Open Web Servers to see its logs and start it again.",
      severity: now ? "info" : "critical",
      category: "web-servers.down",
      audience: { userId },
      link: { tab: "web-servers" },
      dedupeKey: `web-servers:${hostId}:${kind}:${now ? "up" : "down"}`,
      context: { hostId, hostName },
    });

  return ctx.schedule.every(CHECK_MS, check, { jitterMs: 10_000 });
}
