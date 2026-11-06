import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { Engine } from "./engine.js";
import type { JobRow, Store } from "./store.js";

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

async function requireJob(
  store: Store,
  context: PluginOperationContext,
): Promise<JobRow> {
  const hostId = requireHost(context);
  const job = await store.getJob(Number(context.resourceKey));
  if (!job || job.hostId !== hostId) throw new Error("Backup job not found");
  return job;
}

/** Everything Backups offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  store: Store,
  engine: Engine,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("backups.list-jobs", {
    run: async (_input, context) => {
      const jobs = await store.listJobs({ hostId: requireHost(context) });
      const rows = jobs.map((job) => ({
        id: String(job.id),
        name: job.name,
        status: job.lastStatus ?? "never",
        lastSuccess: job.lastSuccessAt,
        nextRun: job.nextRunAt,
        size: job.lastBytes,
      }));
      return { summary: `${rows.length} backup jobs`, data: { rows } };
    },
  });

  ctx.operations.register("backups.failed", {
    run: async (_input, context) => {
      const jobs = await store.listJobs({ hostId: requireHost(context) });
      const failed = jobs.filter(
        (job) => job.enabled && job.lastStatus === "failed",
      );
      return {
        summary: `${failed.length} failed`,
        data: {
          value: failed.length,
          status: failed.length > 0 ? "fail" : "ok",
          label: jobs.length
            ? `${jobs.length - failed.length} of ${jobs.length} jobs fine`
            : "No backup jobs",
          items: failed.map((job) => ({ label: job.name, status: "fail" })),
        },
      };
    },
  });

  ctx.operations.register("backups.run-job", {
    describe: async (_input, context) => {
      const job = await requireJob(store, context);
      return `Would start backup ${job.name}`;
    },
    run: async (_input, context) => {
      const job = await requireJob(store, context);
      const userId = ctx.currentActor();
      if (!userId) throw new Error("This needs a user");
      const run = await engine.startBackup(job, "operation", userId);
      return {
        summary: `Backup ${job.name} started`,
        changed: true,
        data: { runId: run.id },
      };
    },
  });

  ctx.operations.register("backups.cancel-run", {
    describe: async (_input, context) => {
      const job = await requireJob(store, context);
      return `Would stop the running backup ${job.name}`;
    },
    run: async (_input, context) => {
      const job = await requireJob(store, context);
      const run = await store.runningForJob(job.id);
      if (!run) return { summary: `${job.name} is not running` };
      await engine.cancel(run);
      return { summary: `Stopping ${job.name}`, changed: true };
    },
  });

  ctx.operations.register("backups.list-snapshots", {
    run: async (_input, context) => {
      const job = await requireJob(store, context);
      const rows = (await engine.snapshots(job)).map((snapshot) => ({
        id: snapshot.shortId,
        time: snapshot.time,
        size: snapshot.bytes,
        files: snapshot.files,
      }));
      return {
        summary: `${rows.length} snapshots of ${job.name}`,
        data: { rows },
      };
    },
  });
}
