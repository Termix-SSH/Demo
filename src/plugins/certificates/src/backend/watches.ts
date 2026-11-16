import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CertView } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import type { CertService } from "./service.js";

const WATCHES = "watches";
const SENT = "sent";
const CHECK_MS = 6 * 60 * 60_000;

export interface Watch {
  userId: string;
  hostId: number;
}

type Level = "soon" | "expired";

/** "soon", "expired" or null for a certificate with time left. */
export function levelOf(cert: CertView, warnDays: number): Level | null {
  if (cert.daysLeft === null) return null;
  if (cert.daysLeft < 0) return "expired";
  if (cert.daysLeft <= warnDays) return "soon";
  return null;
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

/**
 * Every few hours, checks the certificates on each watched host as the user
 * who watches it, and sends one alert when a certificate starts to expire
 * soon or has expired. The last alert per certificate is kept in kv, so a
 * restart does not repeat it.
 */
export function startWatchChecker(
  ctx: PluginContext,
  store: WatchStore,
  service: CertService,
): () => void {
  const check = async () => {
    const watches = await store.list().catch(() => [] as Watch[]);
    const sentValue = await ctx.kv.get(SENT).catch(() => null);
    const sent: Record<string, Level> =
      sentValue && typeof sentValue === "object"
        ? { ...(sentValue as Record<string, Level>) }
        : {};
    for (const { userId, hostId } of watches) {
      try {
        await ctx.asUser(userId, async () => {
          if (!(await ctx.hosts.checkAccess(hostId, "connect")).hasAccess)
            return;
          const settings = await readHostSettings(ctx, hostId);
          if (!settings.enabled) return;
          const certs = await service.list(hostId, settings);
          const host = await ctx.hosts.get(hostId).catch(() => null);
          const hostName = host?.name || host?.ip || `#${hostId}`;
          for (const cert of certs) {
            const key = `${userId}:${hostId}:${cert.key}`;
            const level = levelOf(cert, settings.warnDays);
            if (!level) {
              delete sent[key];
              continue;
            }
            if (sent[key] === level) continue;
            sent[key] = level;
            await ctx.notify.send({
              title:
                level === "expired"
                  ? `The certificate ${cert.name} on ${hostName} has expired`
                  : `The certificate ${cert.name} on ${hostName} expires in ${cert.daysLeft} days`,
              body:
                level === "expired"
                  ? "Renew it in the Certificates tab."
                  : "Renew it soon, or check that automatic renewal works.",
              severity: level === "expired" ? "critical" : "warning",
              category: "certificates.expiring",
              audience: { userId },
              link: { tab: "certificates" },
              dedupeKey: `certificates:${hostId}:${cert.key}:${level}`,
              context: { hostId, hostName },
            });
          }
        });
      } catch (error) {
        ctx.log.debug(
          `Certificate check failed for host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    for (const key of Object.keys(sent)) {
      const [userId, hostId] = key.split(":");
      const watched = watches.some(
        (w) => w.userId === userId && String(w.hostId) === hostId,
      );
      if (!watched) delete sent[key];
    }
    await ctx.kv.set(SENT, sent).catch(() => undefined);
  };
  return ctx.schedule.every(CHECK_MS, check, {
    id: "expiry-check",
    jitterMs: 60_000,
  });
}
