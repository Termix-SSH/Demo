import { parseKeys } from "@termix-ssh/plugin-sdk/host-scripts";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { nextCronRun } from "../shared/cron.js";
import type {
  DockerInventory,
  HostStatus,
  RestoreTarget,
  RunStatus,
  RunTrigger,
  SnapshotEntry,
  SnapshotView,
} from "../shared/types.js";
import { BackupsError } from "./errors.js";
import type { Remote } from "./remote.js";
import { repoEnv, type Env } from "./repo-env.js";
import {
  parseDocker,
  parseLs,
  parsePoll,
  parseSnapshots,
  type DockerVolume,
  type PolledRun,
} from "./restic-json.js";
import {
  DOCKER_SCRIPT,
  INSTALL_RCLONE_SCRIPT,
  INSTALL_SCRIPT,
  MARK,
  STATUS_SCRIPT,
  STAGE_DIR,
  backupRunScript,
  cancelScript,
  cleanupScript,
  forgetSnapshotScript,
  launchScript,
  lsScript,
  pollScript,
  restoreRunScript,
  snapshotsScript,
  testRepoScript,
  type DumpPlan,
} from "./scripts.js";
import type { JobRow, RepoRow, RunRow, Store } from "./store.js";

/** What the Databases plugin's databases.logins service gives back. */
export interface DatabaseLoginsV1 {
  list: (
    hostId: number,
  ) => Promise<
    Array<{ id: number; name: string; engine: string; database: string }>
  >;
  resolve: (
    hostId: number,
    id: number,
  ) => Promise<{
    engine: string;
    address: string;
    port: number | null;
    username: string;
    password: string;
    runAs: string;
    database: string;
  } | null>;
}

/** A run has had no answer from its host for this long: it is given up. */
export const LOST_AFTER_MS = 60 * 60_000;
/** A dead process with no result is only failed after this, so a slow start is not. */
const START_GRACE_MS = 20_000;
const SNAPSHOT_CHECK_MS = 5 * 60_000;

export interface FinishedRun {
  run: RunRow;
  job: JobRow | null;
  previousStatus: RunStatus | null;
}

export interface StartingBackup {
  job: JobRow;
  repo: RepoRow;
}

export interface EngineHooks {
  onFinished?: (finished: FinishedRun) => Promise<void> | void;
  /** Runs before a backup starts. It can warn, it never stops the backup. */
  onStarting?: (starting: StartingBackup) => Promise<void> | void;
}

export function nextRun(
  job: Pick<JobRow, "cron" | "timezone" | "enabled">,
  from = new Date(),
): string | null {
  if (!job.enabled || !job.cron) return null;
  try {
    const next = nextCronRun(job.cron, from, job.timezone || null);
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

function safeFile(text: string): string {
  return text.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 60) || "db";
}

export function createEngine(
  ctx: PluginContext,
  remote: Remote,
  store: Store,
  hooks: EngineHooks = {},
) {
  async function unseal(sealed: string | null): Promise<string> {
    if (!sealed) return "";
    return (await ctx.secrets.unseal(sealed)) ?? "";
  }

  async function envFor(repo: RepoRow, hostId: number): Promise<Env> {
    if (repo.kind === "local" && repo.location.hostId !== hostId) {
      throw new BackupsError(
        "This repository is a folder on another host, so this host can't use it",
      );
    }
    return repoEnv(repo.kind, repo.location, {
      password: await unseal(repo.passwordSealed),
      secret: await unseal(repo.secretSealed),
    });
  }

  async function repoOf(job: JobRow): Promise<RepoRow> {
    const repo = await store.getRepo(job.repositoryId);
    if (!repo) throw new BackupsError("The job's repository was deleted", 409);
    return repo;
  }

  async function jobSecrets(job: JobRow): Promise<Record<string, string>> {
    const text = await unseal(job.secretsSealed);
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async function databaseLogins(): Promise<DatabaseLoginsV1 | null> {
    try {
      const providers = await ctx.services.providers("databases.logins");
      if (providers.length === 0) return null;
      return await ctx.services.get<DatabaseLoginsV1>("databases.logins");
    } catch {
      return null;
    }
  }

  // Snapshots checked lately, so browsing a folder doesn't list them every time.
  const checked = new Map<string, number>();

  /** A repository can hold many jobs: refuse a snapshot of another one. */
  async function ownSnapshot(job: JobRow, snapshot: string): Promise<void> {
    const key = `${job.id}:${snapshot}`;
    const now = Date.now();
    if ((checked.get(key) ?? 0) > now) return;
    const list = await engine.snapshots(job);
    if (!list.some((s) => s.id.startsWith(snapshot))) {
      throw new BackupsError("Snapshot not found", 404);
    }
    if (checked.size > 500) checked.clear();
    checked.set(key, now + SNAPSHOT_CHECK_MS);
  }

  async function docker(hostId: number) {
    const out = await remote.root(hostId, DOCKER_SCRIPT, { timeoutMs: 60_000 });
    return parseDocker(out.stdout);
  }

  /** Paths, dumps and env for one backup, worked out on the host as it is now. */
  async function planBackup(job: JobRow) {
    const paths: string[] = [];
    const excludes: string[] = [];
    const dumps: DumpPlan[] = [];
    const stopStacks: string[] = [];
    const env: Env = {};
    const secrets = await jobSecrets(job);
    let dockerState: {
      volumes: DockerVolume[];
      inventory: DockerInventory;
    } | null = null;

    for (const [index, source] of job.sources.entries()) {
      if (source.kind === "paths") {
        paths.push(...source.paths);
        excludes.push(...source.excludes);
        continue;
      }
      if (source.kind === "docker") {
        if (!dockerState) {
          const found = await docker(job.hostId);
          if (!found.docker)
            throw new BackupsError("Docker is not installed on this host");
          dockerState = found;
        }
        for (const name of source.volumes) {
          const volume = dockerState.volumes.find((v) => v.name === name);
          if (!volume?.mountpoint) {
            throw new BackupsError(`Docker volume ${name} was not found`);
          }
          paths.push(volume.mountpoint);
        }
        for (const name of source.stacks) {
          const stack = dockerState.inventory.stacks.find(
            (s) => s.name === name,
          );
          if (!stack)
            throw new BackupsError(`Docker stack ${name} was not found`);
          if (stack.dir) paths.push(stack.dir);
          for (const volume of dockerState.volumes) {
            if (volume.project === name && volume.mountpoint) {
              paths.push(volume.mountpoint);
            }
          }
          if (source.stop) stopStacks.push(name);
        }
        continue;
      }
      // A database source.
      let login = {
        address: source.address,
        port: source.port,
        username: source.username,
        password: secrets[source.id] ?? "",
        runAs: source.runAs,
      };
      if (source.loginId > 0) {
        const service = await databaseLogins();
        if (!service) {
          throw new BackupsError(
            "This job uses a Databases plugin login, but the Databases plugin is off",
          );
        }
        const saved = await service.resolve(job.hostId, source.loginId);
        if (!saved)
          throw new BackupsError("The saved database login was removed");
        login = {
          address: saved.address,
          port: saved.port,
          username: saved.username,
          password: saved.password,
          runAs: saved.runAs,
        };
      }
      const passwordEnv = login.password ? `TERMIX_DB_${index + 1}` : null;
      if (passwordEnv) env[passwordEnv] = login.password;
      dumps.push({
        file: `${index + 1}-${source.engine}-${safeFile(source.databases[0] ? source.databases.join("_") : "all")}`,
        engine: source.engine,
        address: login.address,
        port: login.port,
        username: login.username,
        passwordEnv,
        runAs: login.runAs,
        databases: source.databases,
      });
    }
    if (dumps.length) paths.push(`${STAGE_DIR}/${job.uid}`);
    if (paths.length === 0)
      throw new BackupsError("This job has nothing to back up");
    return {
      paths: [...new Set(paths)],
      excludes: [...new Set(excludes)],
      dumps,
      stopStacks: [...new Set(stopStacks)],
      env,
    };
  }

  async function launch(
    run: RunRow,
    files: Parameters<typeof launchScript>[1],
    env: Env,
  ): Promise<void> {
    try {
      await remote.root(run.hostId, launchScript(run.uid, files, env), {
        timeoutMs: 60_000,
      });
    } catch (error) {
      await store.updateRun(run.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const engine = {
    async status(hostId: number): Promise<HostStatus> {
      const k = parseKeys((await remote.root(hostId, STATUS_SCRIPT)).stdout);
      if (k.kernel && k.kernel !== "Linux") {
        throw new BackupsError("Backups only run on Linux hosts");
      }
      return {
        root: k.root === "1",
        os: k.os ?? "",
        arch: k.arch ?? "",
        packageManager: k.pm ?? "none",
        restic: k.restic || null,
        resticOk: k.restic_ok === "1",
        rclone: k.rclone || null,
        docker: k.docker === "1",
        tools: {
          mysqldump: k.mysqldump === "1",
          pgDump: k.pg_dump === "1",
          sqlite3: k.sqlite3 === "1",
        },
      };
    },

    async install(hostId: number): Promise<string> {
      const out = await remote.root(hostId, INSTALL_SCRIPT, {
        timeoutMs: 600_000,
      });
      return parseKeys(out.stdout).version ?? "";
    },

    async installRclone(hostId: number): Promise<string> {
      const out = await remote.root(hostId, INSTALL_RCLONE_SCRIPT, {
        timeoutMs: 600_000,
      });
      return parseKeys(out.stdout).version ?? "";
    },

    async dockerInventory(hostId: number): Promise<DockerInventory> {
      return (await docker(hostId)).inventory;
    },

    databaseLogins,

    /** Opens the repository from a host, and sets it up when `init` is on. */
    async testRepo(repo: RepoRow, hostId: number, init: boolean) {
      const out = await remote.root(
        hostId,
        testRepoScript(await envFor(repo, hostId), init),
        {
          timeoutMs: 120_000,
        },
      );
      const k = parseKeys(out.stdout.split(`${MARK}error`)[0] ?? "");
      if (k.ok === "1") return { ok: true, created: false, error: null };
      if (k.init === "1") return { ok: true, created: true, error: null };
      const error = (out.stdout.split(`${MARK}error`)[1] ?? "").trim();
      return {
        ok: false,
        created: false,
        error: error || "Could not open the repository",
      };
    },

    async startBackup(
      job: JobRow,
      trigger: RunTrigger,
      userId: string,
    ): Promise<RunRow> {
      if (await store.runningForJob(job.id)) {
        throw new BackupsError("This job is already running", 409, {
          code: "running",
        });
      }
      const repo = await repoOf(job);
      const repoValues = await envFor(repo, job.hostId);
      try {
        await hooks.onStarting?.({ job, repo });
      } catch (error) {
        ctx.log.warn(
          `Backups start hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const run = await store.createRun({
        jobId: job.id,
        jobName: job.name,
        hostId: job.hostId,
        repositoryId: repo.id,
        kind: "backup",
        trigger,
        startedBy: userId,
      });
      let plan;
      try {
        plan = await planBackup(job);
      } catch (error) {
        await store.updateRun(run.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
        await engine.finished(await store.getRun(run.id), job.lastStatus);
        throw error;
      }
      await launch(
        run,
        {
          "run.sh": backupRunScript({
            uid: run.uid,
            jobUid: job.uid,
            paths: plan.paths,
            excludes: plan.excludes,
            dumps: plan.dumps,
            stopStacks: plan.stopStacks,
            oneFileSystem: job.oneFileSystem,
            keep: job.keep,
            pre: job.hooks.pre,
            post: job.hooks.post,
          }),
          paths: plan.paths.join("\n") + "\n",
          excludes: plan.excludes.length
            ? plan.excludes.join("\n") + "\n"
            : undefined,
          "pre.sh": job.hooks.pre || undefined,
          "post.sh": job.hooks.post || undefined,
        },
        { ...repoValues, ...plan.env },
      ).catch(async (error) => {
        await engine.finished(await store.getRun(run.id), job.lastStatus);
        throw error;
      });
      await store.updateJob(job.id, { lastRunAt: run.startedAt });
      return run;
    },

    async startRestore(
      job: JobRow,
      snapshot: string,
      target: RestoreTarget,
      targetHostId: number,
      userId: string,
    ): Promise<RunRow> {
      const repo = await repoOf(job);
      const env = await envFor(repo, targetHostId);
      await ownSnapshot(job, snapshot);
      const run = await store.createRun({
        jobId: job.id,
        jobName: job.name,
        hostId: targetHostId,
        repositoryId: repo.id,
        kind: "restore",
        trigger: "manual",
        startedBy: userId,
        target,
      });
      await launch(
        run,
        {
          "run.sh": restoreRunScript({
            uid: run.uid,
            snapshot,
            target: target.path,
            includes: target.includes,
            overwrite: target.overwrite,
          }),
          includes: target.includes.length
            ? target.includes.join("\n") + "\n"
            : undefined,
        },
        env,
      );
      return run;
    },

    async cancel(run: RunRow): Promise<void> {
      if (run.status !== "running")
        throw new BackupsError("This run is not running", 409);
      await remote.root(run.hostId, cancelScript(run.uid), {
        timeoutMs: 30_000,
      });
    },

    async snapshots(job: JobRow): Promise<SnapshotView[]> {
      const repo = await repoOf(job);
      const out = await remote.root(
        job.hostId,
        snapshotsScript(
          await envFor(repo, job.hostId),
          `termix-job:${job.uid}`,
        ),
        { timeoutMs: 120_000, maxOutputBytes: 4 * 1024 * 1024 },
      );
      return parseSnapshots(out.stdout);
    },

    async ls(
      job: JobRow,
      snapshot: string,
      dir: string,
    ): Promise<SnapshotEntry[]> {
      await ownSnapshot(job, snapshot);
      const repo = await repoOf(job);
      const out = await remote.root(
        job.hostId,
        lsScript(await envFor(repo, job.hostId), snapshot, dir),
        { timeoutMs: 180_000, maxOutputBytes: 4 * 1024 * 1024 },
      );
      return parseLs(out.stdout, dir);
    },

    async forget(job: JobRow, snapshot: string): Promise<void> {
      await ownSnapshot(job, snapshot);
      const repo = await repoOf(job);
      await remote.root(
        job.hostId,
        forgetSnapshotScript(await envFor(repo, job.hostId), snapshot),
        { timeoutMs: 600_000 },
      );
    },

    /** Env for a download stream, opened as the caller. */
    async dumpEnv(job: JobRow, snapshot: string): Promise<Env> {
      await ownSnapshot(job, snapshot);
      return envFor(await repoOf(job), job.hostId);
    },

    /** Moves a finished run onto its job and tells the hooks. */
    async finished(
      run: RunRow | null,
      previousStatus: RunStatus | null,
    ): Promise<void> {
      if (!run || run.status === "running") return;
      const job = run.jobId ? await store.getJob(run.jobId) : null;
      if (job && run.kind === "backup") {
        const good = run.status === "success" || run.status === "warning";
        await store.updateJob(job.id, {
          lastStatus: run.status,
          lastRunAt: run.startedAt,
          ...(good
            ? {
                lastSuccessAt: run.finishedAt ?? new Date().toISOString(),
                lastSnapshotId: run.snapshotId ?? job.lastSnapshotId,
                lastBytes: run.summary?.totalBytes ?? job.lastBytes,
                staleAlertAt: null,
              }
            : {}),
        });
      }
      try {
        await hooks.onFinished?.({ run, job, previousStatus });
      } catch (error) {
        ctx.log.warn(
          `Backups finish hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    /** Applies what a host reported for one run. */
    async apply(
      run: RunRow,
      polled: PolledRun,
      now = Date.now(),
    ): Promise<void> {
      const started = Date.parse(run.startedAt) || now;
      const nowIso = new Date(now).toISOString();
      const log = polled.log.slice(-8000) || run.log;
      if (
        polled.result ||
        polled.missing ||
        (!polled.alive && now - started > START_GRACE_MS)
      ) {
        const status: RunStatus = polled.result?.status ?? "failed";
        const error =
          status === "success"
            ? null
            : polled.result?.message ||
              (polled.missing
                ? "The run's files are gone from the host"
                : polled.result
                  ? "The run failed"
                  : "The run stopped without a result, maybe the host restarted");
        const details = polled.errors.length
          ? `\n${polled.errors.join("\n")}`
          : "";
        const job = run.jobId ? await store.getJob(run.jobId) : null;
        await store.updateRun(run.id, {
          status,
          finishedAt: nowIso,
          polledAt: nowIso,
          progress: polled.progress ?? run.progress,
          summary: polled.summary,
          snapshotId: polled.snapshotId,
          error: error
            ? (error + details).slice(0, 4000)
            : details.trim() || null,
          log,
        });
        await engine.finished(
          await store.getRun(run.id),
          job?.lastStatus ?? null,
        );
        if (!polled.missing) {
          await remote
            .root(run.hostId, cleanupScript([run.uid]), { allowFail: true })
            .catch(() => {});
        }
        return;
      }
      await store.updateRun(
        run.id,
        { polledAt: nowIso, progress: polled.progress ?? run.progress, log },
        false,
      );
    },

    /** Checks every running run, host by host. */
    async poll(now = Date.now()): Promise<void> {
      const running = await store.running();
      if (running.length === 0) return;
      const byHost = new Map<number, RunRow[]>();
      for (const run of running) {
        byHost.set(run.hostId, [...(byHost.get(run.hostId) ?? []), run]);
      }
      for (const [hostId, runs] of byHost) {
        const userId = runs[0]!.startedBy;
        try {
          // One asUser per host: each call is an audit line.
          await ctx.asUser(userId, async () => {
            const out = await remote.root(
              hostId,
              pollScript(runs.map((r) => r.uid)),
              {
                timeoutMs: 30_000,
              },
            );
            const polled = parsePoll(out.stdout);
            for (const run of runs) {
              const found = polled.find((p) => p.uid === run.uid);
              if (found) await engine.apply(run, found, now);
            }
          });
        } catch (error) {
          for (const run of runs) {
            const last = Date.parse(run.polledAt ?? run.startedAt) || now;
            if (now - last < LOST_AFTER_MS) continue;
            await store.updateRun(run.id, {
              status: "failed",
              finishedAt: new Date(now).toISOString(),
              error: `Lost contact with the host: ${error instanceof Error ? error.message : String(error)}`,
            });
            await engine.finished(await store.getRun(run.id), null);
          }
        }
      }
      await ctx.db.persist({ lazy: true }).catch(() => {});
    },
  };
  return engine;
}

export type Engine = ReturnType<typeof createEngine>;
