import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { nextRun, type Engine } from "./engine.js";
import type { Store } from "./store.js";

export const SCHEDULE_TICK_MS = 30_000;
export const POLL_TICK_MS = 10_000;
const STALE_TICK_MS = 60 * 60_000;
const RUN_RETENTION_DAYS = 90;

/**
 * Starts due jobs as the user who last saved them. A job's next time is saved
 * before it starts, so a crash can't run it twice, and a time missed while
 * Termix was down runs once on the next tick.
 */
export function createScheduler(
  ctx: PluginContext,
  store: Store,
  engine: Engine,
  checkStale: () => Promise<void>,
) {
  let ticking = false;
  let polling = false;
  let lastStale = 0;

  async function tick(now = new Date()): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      for (const job of await store.dueJobs(now.toISOString())) {
        await store.updateJob(job.id, { nextRunAt: nextRun(job, now) });
        const userId = job.updatedBy;
        try {
          await ctx.asUser(userId, async () => {
            if (!(await ctx.rbac.hasFor(userId, "use"))) {
              throw new Error("The job's owner can no longer use Backups");
            }
            if (!(await ctx.hosts.checkAccess(job.hostId, "edit")).hasAccess) {
              throw new Error("The job's owner can no longer edit this host");
            }
            if (await store.runningForJob(job.id)) return;
            await engine.startBackup(job, "schedule", userId);
          });
        } catch (error) {
          ctx.log.warn(
            `Scheduled backup ${job.id} did not start: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (now.getTime() - lastStale > STALE_TICK_MS) {
        lastStale = now.getTime();
        await checkStale();
        await store.pruneRuns(RUN_RETENTION_DAYS);
      }
    } finally {
      ticking = false;
    }
  }

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;
    try {
      await engine.poll();
    } catch (error) {
      ctx.log.warn(
        `Backups poll failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      polling = false;
    }
  }

  return {
    tick,
    poll,
    start() {
      ctx.schedule.every(SCHEDULE_TICK_MS, () => tick(), { jitterMs: 5_000 });
      ctx.schedule.every(POLL_TICK_MS, () => poll(), { runNow: true });
    },
  };
}
