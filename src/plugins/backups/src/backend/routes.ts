import { randomBytes } from "node:crypto";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { JobInput, JobView, RepositoryInput } from "../shared/types.js";
import { nextRun, type Engine } from "./engine.js";
import { BackupsError } from "./errors.js";
import { streamDump } from "./download.js";
import { parseRcloneConfig } from "./repo-env.js";
import type { JobRow, RepoRow, Store } from "./store.js";
import * as v from "./validate.js";
import { jobView, repoView, runDetail, runView } from "./views.js";

export interface Deps {
  store: Store;
  engine: Engine;
}

type Level = "connect" | "edit";

function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (res.headersSent) return;
  if (error instanceof BackupsError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(
    `Backups request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  res.status(500).json({ error: "Something went wrong" });
}

/**
 * Mounts the Backups routes, served at /plugin-api/backups with auth and the
 * backups.use permission in front. Seeing jobs and runs needs connect access
 * to the host. Changing jobs, running them, browsing, downloading and
 * restoring need edit access. Repositories are only seen by their owner.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { store, engine } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const actor = () => {
    const userId = ctx.currentActor();
    if (!userId) throw new BackupsError("Not signed in", 401);
    return userId;
  };

  async function gate(hostId: number, level: Level): Promise<void> {
    if (!Number.isInteger(hostId) || hostId < 1) {
      throw new BackupsError("The host id is not valid");
    }
    if ((await ctx.hosts.checkAccess(hostId, level)).hasAccess) return;
    if (
      level === "edit" &&
      (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
    ) {
      throw new BackupsError("You need edit access to this host", 403, {
        code: "HOST_EDIT_REQUIRED",
      });
    }
    throw new BackupsError("Host not found", 404);
  }

  async function jobFor(req: Request, level: Level): Promise<JobRow> {
    const job = await store.getJob(Number(req.params.jobId));
    if (!job) throw new BackupsError("Job not found", 404);
    await gate(job.hostId, level);
    return job;
  }

  async function ownRepo(id: number): Promise<RepoRow> {
    const repo = await store.getRepo(id);
    if (!repo || repo.ownerId !== actor()) {
      throw new BackupsError("Repository not found", 404);
    }
    return repo;
  }

  async function secretIds(job: JobRow): Promise<Set<string>> {
    if (!job.secretsSealed) return new Set();
    try {
      const text = (await ctx.secrets.unseal(job.secretsSealed)) ?? "{}";
      return new Set(Object.keys(JSON.parse(text) as object));
    } catch {
      return new Set();
    }
  }

  async function views(jobs: JobRow[]): Promise<JobView[]> {
    const repos = new Map<number, RepoRow | null>();
    const running = new Map(
      (await store.running())
        .filter((r) => r.jobId && r.kind === "backup")
        .map((r) => [r.jobId!, r.id]),
    );
    const out: JobView[] = [];
    for (const job of jobs) {
      if (!repos.has(job.repositoryId)) {
        repos.set(job.repositoryId, await store.getRepo(job.repositoryId));
      }
      out.push(
        jobView(
          job,
          repos.get(job.repositoryId) ?? null,
          await secretIds(job),
          running.get(job.id) ?? null,
          ctx.currentActor(),
        ),
      );
    }
    return out;
  }

  /** Ids of every host the user can see. */
  async function visibleHosts(): Promise<number[]> {
    return (await ctx.hosts.list()).map((host) => host.id);
  }

  async function saveJob(
    hostId: number,
    input: JobInput,
    existing: JobRow | null,
  ): Promise<JobRow> {
    const userId = actor();
    const repo = await ownRepo(input.repositoryId).catch(() => {
      throw new BackupsError("Pick one of your own repositories", 400);
    });
    if (existing && existing.repositoryId !== repo.id) {
      await ownRepo(existing.repositoryId).catch(() => {
        throw new BackupsError(
          "Only the owner of this job's repository can change it",
          403,
        );
      });
    }
    if (repo.kind === "local" && repo.location.hostId !== hostId) {
      throw new BackupsError(
        "This repository is a folder on another host. Pick a repository this host can reach.",
      );
    }
    const old: Record<string, string> = {};
    if (existing?.secretsSealed) {
      try {
        Object.assign(
          old,
          JSON.parse(
            (await ctx.secrets.unseal(existing.secretsSealed)) ?? "{}",
          ),
        );
      } catch {
        // A broken value is replaced below.
      }
    }
    const secrets: Record<string, string> = {};
    const sources = input.sources.map((source) => {
      if (source.kind !== "database") return source;
      const { password, ...rest } = source;
      if (rest.loginId === 0 && rest.engine !== "sqlite") {
        if (password) secrets[rest.id] = password;
        else if (old[rest.id]) secrets[rest.id] = old[rest.id]!;
      }
      return { ...rest, hasPassword: false };
    });
    const fields = {
      hostId,
      repositoryId: repo.id,
      name: input.name,
      enabled: input.enabled,
      sources,
      secretsSealed: Object.keys(secrets).length
        ? await ctx.secrets.seal(JSON.stringify(secrets))
        : null,
      hooks: input.hooks,
      cron: input.cron,
      timezone: input.timezone,
      keep: input.keep,
      alerts: input.alerts,
      oneFileSystem: input.oneFileSystem,
      nextRunAt: nextRun(input),
      updatedBy: userId,
    };
    if (existing) {
      await store.updateJob(existing.id, fields, true);
      return (await store.getJob(existing.id))!;
    }
    return store.createJob(fields);
  }

  function audit(
    action: string,
    hostId: number | null,
    name: string | undefined,
    error?: unknown,
  ) {
    void ctx.audit.record({
      action: `backups.${action}`,
      resourceType: hostId ? "host" : "plugin",
      resourceId: hostId ? String(hostId) : undefined,
      resourceName: name,
      success: !error,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
  }

  /** Runs a handler and answers its result as JSON. */
  const handle =
    (run: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const result = await run(req, res);
        if (!res.headersSent) res.json(result ?? { ok: true });
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  /** Like handle, plus an audit line for the host. */
  const audited =
    (
      action: string,
      run: (
        req: Request,
      ) => Promise<{ hostId: number | null; name?: string; result?: unknown }>,
    ) =>
    async (req: Request, res: Response) => {
      try {
        const out = await run(req);
        audit(action, out.hostId, out.name);
        res.json(out.result ?? { ok: true });
      } catch (error) {
        if (!(error instanceof BackupsError && error.status === 404)) {
          audit(action, Number(req.params.hostId) || null, undefined, error);
        }
        fail(ctx, res, error);
      }
    };

  const hostParam = (req: Request) => Number(req.params.hostId);

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/status:
   *   get:
   *     summary: Backup tools on a host
   *     description: Reports root access, the restic and rclone versions, Docker and the database dump tools.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The host status.
   */
  router.get(
    "/hosts/:hostId/status",
    handle(async (req) => {
      await gate(hostParam(req), "connect");
      return engine.status(hostParam(req));
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/install:
   *   post:
   *     summary: Install restic
   *     description: Installs restic 0.17 or newer with the package manager, or the pinned release from GitHub when the package is too old.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The installed version.
   */
  router.post(
    "/hosts/:hostId/install",
    audited("install", async (req) => {
      await gate(hostParam(req), "edit");
      return {
        hostId: hostParam(req),
        name: "restic",
        result: { version: await engine.install(hostParam(req)) },
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/install-rclone:
   *   post:
   *     summary: Install rclone
   *     description: Installs rclone with the host's package manager, for rclone repositories.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The installed version.
   */
  router.post(
    "/hosts/:hostId/install-rclone",
    audited("install", async (req) => {
      await gate(hostParam(req), "edit");
      return {
        hostId: hostParam(req),
        name: "rclone",
        result: { version: await engine.installRclone(hostParam(req)) },
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/docker:
   *   get:
   *     summary: Docker volumes and stacks
   *     description: Lists the Docker volumes and compose stacks on the host, for picking job sources.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Volumes and stacks.
   */
  router.get(
    "/hosts/:hostId/docker",
    handle(async (req) => {
      await gate(hostParam(req), "edit");
      return engine.dockerInventory(hostParam(req));
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/database-logins:
   *   get:
   *     summary: Saved database logins
   *     description: Lists the host's logins saved in the Databases plugin, without passwords. Empty when that plugin is off.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The logins.
   */
  router.get(
    "/hosts/:hostId/database-logins",
    handle(async (req) => {
      await gate(hostParam(req), "connect");
      const service = engine.databaseLogins();
      if (!service) return { available: false, logins: [] };
      return { available: true, logins: await service.list(hostParam(req)) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/hosts/{hostId}/jobs:
   *   get:
   *     summary: Jobs on a host
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The host's backup jobs.
   *   post:
   *     summary: Add a job
   *     description: Adds a backup job to the host. The repository must be one of yours.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The new job.
   */
  router.get(
    "/hosts/:hostId/jobs",
    handle(async (req) => {
      await gate(hostParam(req), "connect");
      return views(await store.listJobs({ hostId: hostParam(req) }));
    }),
  );
  router.post(
    "/hosts/:hostId/jobs",
    audited("job.create", async (req) => {
      const hostId = hostParam(req);
      await gate(hostId, "edit");
      const job = await saveJob(hostId, v.job(req.body), null);
      return { hostId, name: job.name, result: (await views([job]))[0] };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs:
   *   get:
   *     summary: All jobs
   *     description: Every backup job on the hosts you can see.
   *     tags:
   *       - Backups
   *     responses:
   *       200:
   *         description: The jobs.
   */
  router.get(
    "/jobs",
    handle(async () => {
      const hosts = new Set(await visibleHosts());
      return views(
        (await store.listJobs()).filter((job) => hosts.has(job.hostId)),
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}:
   *   get:
   *     summary: One job
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The job.
   *   put:
   *     summary: Change a job
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The saved job.
   *   delete:
   *     summary: Delete a job
   *     description: Removes the job. Its snapshots stay in the repository.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.get(
    "/jobs/:jobId",
    handle(async (req) => (await views([await jobFor(req, "connect")]))[0]),
  );
  router.put(
    "/jobs/:jobId",
    audited("job.update", async (req) => {
      const existing = await jobFor(req, "edit");
      const job = await saveJob(existing.hostId, v.job(req.body), existing);
      return {
        hostId: job.hostId,
        name: job.name,
        result: (await views([job]))[0],
      };
    }),
  );
  router.delete(
    "/jobs/:jobId",
    audited("job.delete", async (req) => {
      const job = await jobFor(req, "edit");
      if (await store.runningForJob(job.id)) {
        throw new BackupsError("Stop the running backup first", 409);
      }
      await store.deleteJob(job.id);
      return { hostId: job.hostId, name: job.name };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/run:
   *   post:
   *     summary: Run a job now
   *     description: Starts a backup. It runs on the host on its own, so this answers right away with the run.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The started run.
   */
  router.post(
    "/jobs/:jobId/run",
    audited("job.run", async (req) => {
      const job = await jobFor(req, "edit");
      const run = await engine.startBackup(job, "manual", actor());
      return { hostId: job.hostId, name: job.name, result: runView(run) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/snapshots:
   *   get:
   *     summary: Snapshots of a job
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The snapshots, newest first.
   */
  router.get(
    "/jobs/:jobId/snapshots",
    handle(async (req) => engine.snapshots(await jobFor(req, "connect"))),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/snapshots/{snapshotId}/files:
   *   get:
   *     summary: Files in a snapshot
   *     description: Lists one folder of a snapshot.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: snapshotId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: path
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The folder's entries.
   */
  router.get(
    "/jobs/:jobId/snapshots/:snapshotId/files",
    handle(async (req) => {
      const job = await jobFor(req, "edit");
      const dir = req.query.path ? v.absPath(req.query.path) : "/";
      return engine.ls(job, v.snapshotId(req.params.snapshotId), dir);
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/snapshots/{snapshotId}/download:
   *   get:
   *     summary: Download from a snapshot
   *     description: Streams one file, or a folder as a zip file. Audited.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: snapshotId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: folder
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: The file.
   */
  router.get(
    "/jobs/:jobId/snapshots/:snapshotId/download",
    async (req, res) => {
      let hostId: number | null = null;
      const path = String(req.query.path ?? "");
      try {
        const job = await jobFor(req, "edit");
        hostId = job.hostId;
        const snapshot = v.snapshotId(req.params.snapshotId);
        const target = v.absPath(path);
        const env = await engine.dumpEnv(job, snapshot);
        audit("download", hostId, `${job.name}: ${target}`);
        await streamDump(ctx, res, {
          hostId: job.hostId,
          env,
          snapshot,
          path: target,
          folder: req.query.folder === "1" || req.query.folder === "true",
        });
      } catch (error) {
        if (hostId) audit("download", hostId, path, error);
        fail(ctx, res, error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/snapshots/{snapshotId}/restore:
   *   post:
   *     summary: Restore a snapshot
   *     description: Restores all of a snapshot, or picked files, to a folder on this host or another host you can edit. Audited.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: snapshotId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The started restore run.
   */
  router.post(
    "/jobs/:jobId/snapshots/:snapshotId/restore",
    audited("restore", async (req) => {
      const job = await jobFor(req, "edit");
      const snapshot = v.snapshotId(req.params.snapshotId);
      const { hostId, ...target } = v.restoreTarget(req.body);
      const targetHost = hostId ?? job.hostId;
      if (targetHost !== job.hostId) await gate(targetHost, "edit");
      const run = await engine.startRestore(
        job,
        snapshot,
        target,
        targetHost,
        actor(),
      );
      return {
        hostId: targetHost,
        name: `${job.name} ${snapshot.slice(0, 8)} to ${target.path}`,
        result: runView(run),
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/jobs/{jobId}/snapshots/{snapshotId}:
   *   delete:
   *     summary: Delete a snapshot
   *     description: Removes one snapshot from the repository and frees its space. Audited.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: snapshotId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/jobs/:jobId/snapshots/:snapshotId",
    audited("snapshot.delete", async (req) => {
      const job = await jobFor(req, "edit");
      const snapshot = v.snapshotId(req.params.snapshotId);
      await engine.forget(job, snapshot);
      return {
        hostId: job.hostId,
        name: `${job.name} ${snapshot.slice(0, 8)}`,
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/runs:
   *   get:
   *     summary: Run history
   *     description: Backups and restores, newest first, on hosts you can see.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: query
   *         name: jobId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: hostId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: before
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: A page of runs.
   */
  router.get(
    "/runs",
    handle(async (req) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      let hostIds = await visibleHosts();
      if (req.query.hostId) {
        const hostId = Number(req.query.hostId);
        hostIds = hostIds.filter((id) => id === hostId);
      }
      const runs = await store.listRuns({
        jobId: req.query.jobId ? Number(req.query.jobId) : undefined,
        hostIds,
        before: Number(req.query.before) || undefined,
        limit: limit + 1,
      });
      const page = runs.slice(0, limit);
      return {
        runs: page.map(runView),
        next: runs.length > limit ? page[page.length - 1]!.id : null,
      };
    }),
  );

  async function runFor(req: Request, level: Level) {
    const run = await store.getRun(Number(req.params.runId));
    if (!run) throw new BackupsError("Run not found", 404);
    await gate(run.hostId, level);
    return run;
  }

  /**
   * @openapi
   * /plugin-api/backups/runs/{runId}:
   *   get:
   *     summary: One run with its log
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The run.
   */
  router.get(
    "/runs/:runId",
    handle(async (req) => runDetail(await runFor(req, "connect"))),
  );

  /**
   * @openapi
   * /plugin-api/backups/runs/{runId}/cancel:
   *   post:
   *     summary: Stop a run
   *     description: Stops a running backup or restore. A stopped backup keeps no snapshot.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The stop was sent.
   */
  router.post(
    "/runs/:runId/cancel",
    audited("run.cancel", async (req) => {
      const run = await runFor(req, "edit");
      await engine.cancel(run);
      return { hostId: run.hostId, name: run.jobName };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/repositories:
   *   get:
   *     summary: Your repositories
   *     description: Storage places for backups. Keys and passwords are never sent back.
   *     tags:
   *       - Backups
   *     responses:
   *       200:
   *         description: The repositories.
   *   post:
   *     summary: Add a repository
   *     description: Saves an S3, REST server, rclone or local folder repository. A restic password is made when none is given.
   *     tags:
   *       - Backups
   *     responses:
   *       200:
   *         description: The new repository.
   */
  router.get(
    "/repositories",
    handle(async () => {
      const repos = await store.listRepos(actor());
      const jobs = await store.listJobs();
      return repos.map((repo) =>
        repoView(
          repo,
          jobs.filter((job) => job.repositoryId === repo.id).length,
        ),
      );
    }),
  );

  async function checkRepoInput(
    input: RepositoryInput,
    existing: RepoRow | null,
  ) {
    if (input.kind === "local") {
      await gate(input.location.hostId!, "edit");
    }
    const keepsSecret =
      existing && existing.kind === input.kind && !input.secret;
    if (!keepsSecret) {
      if (input.kind === "s3" && !input.secret) {
        throw new BackupsError("The secret access key is required");
      }
      if (input.kind === "rclone") {
        if (!input.secret)
          throw new BackupsError("The rclone config is required");
        parseRcloneConfig(input.secret);
      }
    }
  }

  router.post(
    "/repositories",
    audited("repository.create", async (req) => {
      const input = v.repository(req.body);
      await checkRepoInput(input, null);
      const password = input.password || randomBytes(24).toString("base64url");
      const repo = await store.createRepo({
        ownerId: actor(),
        name: input.name,
        kind: input.kind,
        location: input.location,
        secretSealed:
          input.secret && input.kind !== "local"
            ? await ctx.secrets.seal(input.secret)
            : null,
        passwordSealed: await ctx.secrets.seal(password),
      });
      return { hostId: null, name: repo.name, result: repoView(repo, 0) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/repositories/{id}:
   *   put:
   *     summary: Change a repository
   *     description: Empty secret and password fields keep the saved ones.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The saved repository.
   *   delete:
   *     summary: Delete a repository
   *     description: Removes it from Termix only. The data in the storage stays. Refused while jobs use it.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.put(
    "/repositories/:id",
    audited("repository.update", async (req) => {
      const existing = await ownRepo(Number(req.params.id));
      const input = v.repository(req.body);
      await checkRepoInput(input, existing);
      await store.updateRepo(existing.id, {
        name: input.name,
        kind: input.kind,
        location: input.location,
        secretSealed:
          input.kind === "local"
            ? null
            : input.secret
              ? await ctx.secrets.seal(input.secret)
              : existing.kind === input.kind
                ? existing.secretSealed
                : null,
        passwordSealed: input.password
          ? await ctx.secrets.seal(input.password)
          : undefined,
      });
      const repo = (await store.getRepo(existing.id))!;
      const jobs = await store.listJobs({ repositoryId: repo.id });
      return {
        hostId: null,
        name: repo.name,
        result: repoView(repo, jobs.length),
      };
    }),
  );
  router.delete(
    "/repositories/:id",
    audited("repository.delete", async (req) => {
      const repo = await ownRepo(Number(req.params.id));
      const jobs = await store.listJobs({ repositoryId: repo.id });
      if (jobs.length) {
        throw new BackupsError(
          `${jobs.length} job${jobs.length === 1 ? "" : "s"} still use this repository`,
          409,
        );
      }
      await store.deleteRepo(repo.id);
      return { hostId: null, name: repo.name };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/repositories/{id}/password:
   *   post:
   *     summary: Show the restic password
   *     description: Returns the repository password so it can be opened without Termix. Owner only and audited.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The password.
   */
  router.post(
    "/repositories/:id/password",
    audited("repository.reveal", async (req) => {
      const repo = await ownRepo(Number(req.params.id));
      const password = (await ctx.secrets.unseal(repo.passwordSealed)) ?? "";
      return { hostId: null, name: repo.name, result: { password } };
    }),
  );

  /**
   * @openapi
   * /plugin-api/backups/repositories/{id}/test:
   *   post:
   *     summary: Check a repository
   *     description: Opens the repository from a host. With init on, sets it up when it does not exist yet.
   *     tags:
   *       - Backups
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether it opened or was made.
   */
  router.post(
    "/repositories/:id/test",
    handle(async (req) => {
      const repo = await ownRepo(Number(req.params.id));
      const hostId =
        repo.kind === "local"
          ? repo.location.hostId!
          : Number(req.body?.hostId);
      await gate(hostId, "edit");
      return engine.testRepo(repo, hostId, req.body?.init === true);
    }),
  );
}
