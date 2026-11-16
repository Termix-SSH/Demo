import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { FinishedRun, StartingBackup } from "./engine.js";
import type { JobRow, Store } from "./store.js";

async function hostName(ctx: PluginContext, userId: string, hostId: number) {
  try {
    const host = await ctx.asUser(userId, () => ctx.hosts.get(hostId));
    return host?.name || host?.ip || `host ${hostId}`;
  } catch {
    return `host ${hostId}`;
  }
}

/** What the Storage Health plugin's storage-health.access service gives back. */
export interface StorageAccessV1 {
  check: (hostId: number) => Promise<{
    status: "ok" | "warn" | "fail" | "unknown";
    problems: number;
    worstDrive: string;
    readAt: number | null;
  }>;
}

/** Alerts and Termix events when a run ends. */
export function createAlerts(ctx: PluginContext) {
  const send = (message: Parameters<PluginContext["notify"]["send"]>[0]) =>
    ctx.notify.send(message).catch(() => undefined);

  /** The latest storage health of a host, or null when Storage Health is not there. */
  async function storageOf(hostId: number) {
    try {
      const providers = await ctx.services.providers("storage-health.access");
      if (providers.length === 0) return null;
      const access = await ctx.services.get<StorageAccessV1>(
        "storage-health.access",
      );
      return await access.check(hostId);
    } catch {
      return null;
    }
  }

  return {
    /**
     * A backup to a folder on a host with failing or worn storage is worth a
     * warning. It still runs: a failing drive is the reason to back up.
     */
    async starting({ job, repo }: StartingBackup): Promise<void> {
      if (repo.kind !== "local" || !job.alerts.onFailure) return;
      const hostId = repo.location.hostId;
      const storage = await storageOf(hostId);
      if (
        !storage ||
        (storage.status !== "fail" && storage.status !== "warn")
      ) {
        return;
      }
      const host = await hostName(ctx, job.updatedBy, hostId);
      await send({
        title: `Backup ${job.name} is stored on unhealthy storage on ${host}`,
        body: storage.worstDrive
          ? `Storage Health reports problems, worst on ${storage.worstDrive}. Keep a copy somewhere else too.`
          : "Storage Health reports problems. Keep a copy somewhere else too.",
        severity: storage.status === "fail" ? "critical" : "warning",
        category: "backups.target_unhealthy",
        audience: { userId: job.updatedBy },
        link: { tab: "backups" },
        dedupeKey: `backups:${job.id}:storage:${storage.status}`,
        context: {
          hostId,
          hostName: host,
          sourceId: job.id,
          sourceName: job.name,
        },
      });
    },

    async finished({ run, job, previousStatus }: FinishedRun): Promise<void> {
      if (typeof ctx.operations?.emit === "function") {
        const payload = {
          jobId: run.jobId,
          jobName: run.jobName,
          kind: run.kind,
          status: run.status,
          snapshotId: run.snapshotId,
          error: run.error,
        };
        await ctx.operations
          .emit("backups.run-finished", payload, { hostId: run.hostId })
          .catch(() => {});
        if (run.status === "failed") {
          await ctx.operations
            .emit("backups.run-failed", payload, { hostId: run.hostId })
            .catch(() => {});
        }
      }

      if (run.status === "canceled" || run.status === "running") return;
      const userId =
        run.kind === "backup" && job ? job.updatedBy : run.startedBy;
      const host = await hostName(ctx, userId, run.hostId);
      const context = {
        hostId: run.hostId,
        hostName: host,
        sourceId: run.jobId ?? undefined,
        sourceName: run.jobName,
      };

      if (run.kind === "restore") {
        if (run.status !== "failed") return;
        await send({
          title: `Restore on ${host} failed`,
          body: run.error ?? undefined,
          severity: "warning",
          category: "backups.restore_failed",
          audience: { userId },
          link: { tab: "backups" },
          context,
        });
        return;
      }

      if (!job || !job.alerts.onFailure) return;
      if (run.status === "failed" || run.status === "warning") {
        await send({
          title:
            run.status === "failed"
              ? `Backup ${run.jobName} on ${host} failed`
              : `Backup ${run.jobName} on ${host} finished with warnings`,
          body: run.error ?? undefined,
          severity: run.status === "failed" ? "critical" : "warning",
          category:
            run.status === "failed"
              ? "backups.run_failed"
              : "backups.run_warning",
          audience: { userId },
          link: { tab: "backups" },
          dedupeKey: `backups:${run.jobId}:${run.status}`,
          context,
        });
        return;
      }
      if (previousStatus === "failed" && run.status === "success") {
        await send({
          title: `Backup ${run.jobName} on ${host} works again`,
          severity: "success",
          category: "backups.run_recovered",
          audience: { userId },
          link: { tab: "backups" },
          context,
        });
      }
    },

    /** One alert a day per job that has had no good backup for too long. */
    async checkStale(store: Store, now = new Date()): Promise<void> {
      const jobs = await store.listJobs();
      for (const job of jobs) {
        if (!isStale(job, now)) continue;
        if (
          job.staleAlertAt &&
          now.getTime() - Date.parse(job.staleAlertAt) < 86_400_000
        ) {
          continue;
        }
        await store.updateJob(job.id, { staleAlertAt: now.toISOString() });
        const host = await hostName(ctx, job.updatedBy, job.hostId);
        await send({
          title: `No backup of ${job.name} on ${host} for ${job.alerts.staleDays} days`,
          severity: "warning",
          category: "backups.stale",
          audience: { userId: job.updatedBy },
          link: { tab: "backups" },
          dedupeKey: `backups:${job.id}:stale`,
          context: {
            hostId: job.hostId,
            hostName: host,
            sourceId: job.id,
            sourceName: job.name,
          },
        });
      }
    },
  };
}

export function isStale(job: JobRow, now = new Date()): boolean {
  if (!job.enabled || job.alerts.staleDays <= 0) return false;
  const since = Date.parse(job.lastSuccessAt ?? job.createdAt);
  if (!Number.isFinite(since)) return false;
  return now.getTime() - since > job.alerts.staleDays * 86_400_000;
}
