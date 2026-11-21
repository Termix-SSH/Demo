import { createHash } from "node:crypto";
import {
  SUDO_REFUSED_RE,
  parseKeys,
  scriptShell,
  scrub,
  shellQuote,
} from "@termix-ssh/plugin-sdk/host-scripts";
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
import { looksLikeTar, relay } from "./relay.js";
import {
  RESTORE_PROBE_SCRIPT,
  parseSourceOutput,
  probeScript,
  pullDir,
  pullRoot,
  receivePrepScript,
  receiveScript,
  relativePaths,
  relayDumpScript,
  relaySourceScript,
  resticExcludes,
  restoreFileSink,
  restoreTarSink,
  rootBash,
  sourcePath,
  sourceStateDir,
} from "./relay-scripts.js";
import {
  copySourceEnv,
  mirrorConflict,
  mirrorEnv,
  repoEnv,
  type Env,
} from "./repo-env.js";
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
  RUNS_DIR,
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
  unlockRepoScript,
  type DumpPlan,
} from "./scripts.js";
import type { JobRow, RepoRow, RunRow, Store } from "./store.js";
import { backupOptionArgs } from "./validate.js";

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
  /** A failed backup that will be tried again: no failure alert yet. */
  willRetry?: boolean;
}

/** What a finished backup does to the job's retry state. */
export function retryState(
  job: Pick<JobRow, "retries" | "retryDelayMinutes" | "retryCount">,
  status: RunStatus,
  now = Date.now(),
): { retryCount: number; retryAt: string | null; willRetry: boolean } {
  if (status === "failed" && job.retryCount < job.retries) {
    return {
      retryCount: job.retryCount + 1,
      retryAt: new Date(now + job.retryDelayMinutes * 60_000).toISOString(),
      willRetry: true,
    };
  }
  return { retryCount: 0, retryAt: null, willRetry: false };
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

/** The host restic runs on for a job. */
export function resticHost(
  job: Pick<JobRow, "hostId" | "runnerHostId">,
): number {
  return job.runnerHostId && job.runnerHostId !== job.hostId
    ? job.runnerHostId
    : job.hostId;
}

/** The host a run's files and restic process live on. */
function runHost(run: Pick<RunRow, "hostId" | "resticHostId">): number {
  return run.resticHostId ?? run.hostId;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  /** Env for the job's mirrors that can still take a copy, and how many. */
  async function mirrorsFor(job: JobRow, repo: RepoRow) {
    const env: Env = {};
    let count = 0;
    for (const id of job.mirrors) {
      const mirror = await store.getRepo(id);
      if (!mirror || mirror.id === repo.id) continue;
      if (mirrorConflict(repo, mirror, resticHost(job))) continue;
      count += 1;
      Object.assign(
        env,
        mirrorEnv(count, await envFor(mirror, resticHost(job))),
      );
    }
    if (count > 0) {
      Object.assign(
        env,
        copySourceEnv(
          repo.kind,
          repo.location,
          await unseal(repo.secretSealed),
        ),
      );
    }
    return { env, count };
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
        ...(source.serverDir ? { serverDir: source.serverDir } : {}),
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
      await remote.root(runHost(run), launchScript(run.uid, files, env), {
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

  // Runs whose copy goes through Termix right now, so the poll leaves them be.
  const relaying = new Map<number, AbortController>();

  function startRelay(
    run: RunRow,
    previousStatus: RunStatus | null,
    task: (signal: AbortSignal) => Promise<void>,
  ): void {
    const controller = new AbortController();
    relaying.set(run.id, controller);
    void ctx
      .asUser(run.startedBy, () => task(controller.signal))
      .catch(async (error) => {
        const current = await store.getRun(run.id);
        if (current?.status === "running") {
          const canceled = controller.signal.aborted;
          await store.updateRun(run.id, {
            status: canceled ? "canceled" : "failed",
            finishedAt: new Date().toISOString(),
            error: canceled ? "Canceled" : message(error).slice(0, 4000),
          });
        }
        if (run.resticHostId) {
          await remote
            .root(run.resticHostId, cleanupScript([run.uid]), {
              allowFail: true,
            })
            .catch(() => {});
        }
        await engine.finished(await store.getRun(run.id), previousStatus);
      })
      .catch((error) => {
        ctx.log.warn(`Backups copy failed: ${message(error)}`);
      })
      .finally(() => relaying.delete(run.id));
  }

  function logger(run: RunRow) {
    const lines: string[] = [];
    return {
      lines,
      async note(text: string) {
        lines.push(`${new Date().toISOString().slice(0, 19)}Z ${text}`);
        await store.updateRun(run.id, { log: lines.join("\n") }, false);
      },
    };
  }

  function copyProgress(bytes: number, started: number) {
    return {
      percent: 0,
      filesDone: 0,
      totalFiles: 0,
      bytesDone: bytes,
      totalBytes: 0,
      secondsElapsed: Math.round((Date.now() - started) / 1000),
      secondsRemaining: null,
      current: [],
      copying: true,
    };
  }

  /** The sink's own message, or the end of what it wrote. */
  function sinkError(stderr: string, fallback: string): string {
    const own = stderr.match(new RegExp(`${MARK}message=(.*)`));
    if (own?.[1]) return own[1].trim();
    return scrub(stderr, 1500) || fallback;
  }

  /**
   * Copies the job's files from its host to the restic host through Termix,
   * then starts restic there on the copy like any other run.
   */
  async function relayBackup(
    run: RunRow,
    job: JobRow,
    plan: Awaited<ReturnType<typeof planBackup>>,
    env: Env,
    mirrors: number,
    signal: AbortSignal,
  ): Promise<void> {
    const runner = resticHost(job);
    const log = logger(run);
    const paths = relativePaths(plan.paths);
    const hash = createHash("sha256")
      .update(JSON.stringify([paths, plan.excludes, job.oneFileSystem]))
      .digest("hex")
      .slice(0, 16);
    const [src, dst] = await Promise.all([
      remote
        .root(job.hostId, probeScript(`${sourceStateDir(job.uid)}/gen`, false))
        .then((out) => parseKeys(out.stdout)),
      remote
        .root(runner, probeScript(`${pullDir(job.uid)}/gen`, true))
        .then((out) => parseKeys(out.stdout))
        .catch((error) => {
          throw new BackupsError(
            `The host that runs restic: ${message(error)}`,
          );
        }),
    ]);
    if (src.tar !== "1") {
      throw new BackupsError("tar is not installed on the source host");
    }
    if (dst.tar !== "1") {
      throw new BackupsError(
        "tar is not installed on the host that runs restic",
      );
    }
    const incremental = src.gnu === "1" && dst.gnu === "1";
    const saved = src.gen ?? "";
    const full =
      !incremental ||
      !saved ||
      saved !== (dst.gen ?? "") ||
      !saved.endsWith(` ${hash}`);
    const gen = full ? `${run.uid} ${hash}` : saved;
    await log.note(
      full
        ? "Copying all files from the source host through Termix"
        : "Copying changed files from the source host through Termix",
    );
    await remote.root(
      runner,
      receivePrepScript(
        run.uid,
        receiveScript({
          uid: run.uid,
          jobUid: job.uid,
          gnu: dst.gnu === "1",
          incremental,
          full,
          gen,
        }),
      ),
    );
    const started = Date.now();
    const result = await relay(ctx, {
      sourceHost: job.hostId,
      sourceCommand: scriptShell("root"),
      sourceStdin: relaySourceScript(
        {
          uid: run.uid,
          jobUid: job.uid,
          paths,
          excludes: plan.excludes,
          dumps: plan.dumps,
          stopStacks: plan.stopStacks,
          oneFileSystem: job.oneFileSystem,
          pre: job.hooks.pre,
          post: job.hooks.post,
          gnu: src.gnu === "1",
          incremental,
          full,
          gen,
        },
        plan.env,
      ),
      sink: () => ({
        host: runner,
        command: rootBash(`exec bash ${RUNS_DIR}/${run.uid}/receive.sh`),
      }),
      onBytes: (bytes) => {
        void store
          .updateRun(run.id, { progress: copyProgress(bytes, started) }, false)
          .catch(() => {});
      },
      signal,
      stderrLimit: 256 * 1024,
    });
    const out = parseSourceOutput(result.source.stderr);
    const copyLog = [...log.lines, out.log.trim()].filter(Boolean).join("\n");
    await store.updateRun(
      run.id,
      {
        log: copyLog.slice(-8000),
        progress: copyProgress(result.bytes, started),
      },
      false,
    );
    if (result.canceled) throw new BackupsError("Canceled");
    if (out.status !== "success" && out.status !== "warning") {
      const stderr = result.source.stderr;
      throw new BackupsError(
        out.message ||
          (SUDO_REFUSED_RE.test(stderr)
            ? "The source host needs passwordless sudo, or a root login"
            : scrub(stderr, 1500)) ||
          "The copy from the source host failed",
      );
    }
    if (!result.sink || result.sink.code !== 0) {
      throw new BackupsError(
        sinkError(
          result.sink?.stderr ?? "",
          "The host that runs restic did not take the files",
        ),
      );
    }
    const root = pullRoot(job.uid);
    const options = backupOptionArgs(job.backupOptions);
    const name = (await ctx.hosts.get(job.hostId).catch(() => null))?.name;
    if (
      name &&
      !options.some(
        (o) => o === "-H" || o === "--host" || o.startsWith("--host="),
      )
    ) {
      // Snapshots carry the source host's name, not the restic host's.
      options.push("--host", name.slice(0, 120));
    }
    const excludes = resticExcludes(plan.excludes, root);
    if (signal.aborted) throw new BackupsError("Canceled");
    await launch(
      run,
      {
        "run.sh": backupRunScript({
          uid: run.uid,
          jobUid: job.uid,
          paths: out.present,
          excludes,
          dumps: [],
          stopStacks: [],
          oneFileSystem: false,
          options,
          keep: job.keep,
          pre: "",
          post: "",
          mirrors,
          cwd: root,
          copyWarning:
            out.status === "warning"
              ? out.message || "Some files could not be copied"
              : undefined,
        }),
        paths: out.present.join("\n") + "\n",
        excludes: excludes.length ? excludes.join("\n") + "\n" : undefined,
        log: copyLog + "\n",
      },
      env,
    );
  }

  /** A restore onto a host without restic: the restic host sends the files through Termix. */
  async function relayRestoreRun(
    repo: RepoRow,
    job: JobRow,
    snapshot: string,
    target: RestoreTarget,
    targetHostId: number,
    userId: string,
  ): Promise<RunRow> {
    const runner = resticHost(job);
    const env = await envFor(repo, runner);
    const run = await store.createRun({
      jobId: job.id,
      jobName: job.name,
      hostId: targetHostId,
      resticHostId: runner,
      repositoryId: repo.id,
      kind: "restore",
      trigger: "manual",
      startedBy: userId,
      target,
    });
    startRelay(run, null, async (signal) => {
      const log = logger(run);
      const probe = parseKeys(
        (await remote.root(targetHostId, RESTORE_PROBE_SCRIPT)).stdout,
      );
      if (probe.tar !== "1") {
        throw new BackupsError("tar is not installed on the target host");
      }
      const gnu = probe.gnu === "1";
      if (
        !gnu &&
        (target.overwrite === "never" || target.overwrite === "if-newer")
      ) {
        throw new BackupsError(
          "This overwrite choice needs GNU tar on the target host. Pick another one.",
        );
      }
      const started = Date.now();
      let done = 0;
      const items = target.includes.length ? target.includes : ["/"];
      for (const path of items) {
        await log.note(`Restoring ${path} to ${target.path} through Termix`);
        const result = await relay(ctx, {
          sourceHost: runner,
          sourceCommand: scriptShell("root"),
          sourceStdin: relayDumpScript(env, snapshot, path),
          sink: (head) => ({
            host: targetHostId,
            command: looksLikeTar(head)
              ? restoreTarSink(target.path, target.overwrite, gnu)
              : restoreFileSink(target.path, path, target.overwrite),
          }),
          onBytes: (bytes) => {
            void store
              .updateRun(
                run.id,
                { progress: copyProgress(done + bytes, started) },
                false,
              )
              .catch(() => {});
          },
          signal,
        });
        done += result.bytes;
        if (result.canceled) throw new BackupsError("Canceled");
        if (result.source.code !== 0) {
          throw new BackupsError(
            scrub(result.source.stderr, 1500) ||
              "restic could not read the snapshot",
          );
        }
        if (!result.sink || result.sink.code !== 0) {
          throw new BackupsError(
            sinkError(
              result.sink?.stderr ?? "",
              "Writing the files on the target host failed",
            ),
          );
        }
      }
      await log.note("Restore done");
      await store.updateRun(run.id, {
        status: "success",
        finishedAt: new Date().toISOString(),
        progress: copyProgress(done, started),
        log: log.lines.join("\n"),
      });
      await engine.finished(await store.getRun(run.id), null);
    });
    return run;
  }

  const engine = {
    resticHost,

    /** Removes a job's copy from its restic host and tar's state from its host, in the background. */
    dropCopy(job: JobRow): void {
      if (resticHost(job) === job.hostId) return;
      const drop = `rm -rf ${shellQuote(pullDir(job.uid))}
echo done
`;
      for (const host of [resticHost(job), job.hostId]) {
        void remote.root(host, drop, { allowFail: true }).catch(() => {});
      }
    },

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
          mongodump: k.mongodump === "1",
          redisCli: k.redis_cli === "1",
          sqlcmd: k.sqlcmd === "1",
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

    async unlockRepo(repo: RepoRow, hostId: number): Promise<void> {
      await remote.root(hostId, unlockRepoScript(await envFor(repo, hostId)), {
        timeoutMs: 120_000,
      });
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
      const repoValues = await envFor(repo, resticHost(job));
      const mirrors = await mirrorsFor(job, repo);
      try {
        await hooks.onStarting?.({ job, repo });
      } catch (error) {
        ctx.log.warn(
          `Backups start hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const relayed = resticHost(job) !== job.hostId;
      const run = await store.createRun({
        jobId: job.id,
        jobName: job.name,
        hostId: job.hostId,
        resticHostId: relayed ? resticHost(job) : null,
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
      if (relayed) {
        startRelay(run, job.lastStatus, (signal) =>
          relayBackup(
            run,
            job,
            plan,
            { ...repoValues, ...mirrors.env },
            mirrors.count,
            signal,
          ),
        );
        await store.updateJob(job.id, { lastRunAt: run.startedAt });
        return run;
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
            options: backupOptionArgs(job.backupOptions),
            keep: job.keep,
            pre: job.hooks.pre,
            post: job.hooks.post,
            mirrors: mirrors.count,
          }),
          paths: plan.paths.join("\n") + "\n",
          excludes: plan.excludes.length
            ? plan.excludes.join("\n") + "\n"
            : undefined,
          "pre.sh": job.hooks.pre || undefined,
          "post.sh": job.hooks.post || undefined,
        },
        { ...repoValues, ...mirrors.env, ...plan.env },
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
      await ownSnapshot(job, snapshot);
      if (resticHost(job) !== job.hostId && targetHostId !== resticHost(job)) {
        return relayRestoreRun(
          await repoOf(job),
          job,
          snapshot,
          target,
          targetHostId,
          userId,
        );
      }
      return engine.restoreFrom(
        await repoOf(job),
        job,
        snapshot,
        target,
        targetHostId,
        userId,
      );
    },

    /** Every snapshot in a repository, read from a host that can reach it. */
    async repoSnapshots(
      repo: RepoRow,
      hostId: number,
    ): Promise<SnapshotView[]> {
      const out = await remote.root(
        hostId,
        snapshotsScript(await envFor(repo, hostId), ""),
        { timeoutMs: 120_000, maxOutputBytes: 8 * 1024 * 1024 },
      );
      return parseSnapshots(out.stdout);
    },

    async repoLs(
      repo: RepoRow,
      hostId: number,
      snapshot: string,
      dir: string,
    ): Promise<SnapshotEntry[]> {
      const out = await remote.root(
        hostId,
        lsScript(await envFor(repo, hostId), snapshot, dir),
        { timeoutMs: 180_000, maxOutputBytes: 4 * 1024 * 1024 },
      );
      return parseLs(out.stdout, dir);
    },

    repoEnv: (repo: RepoRow, hostId: number) => envFor(repo, hostId),

    /** Restores a snapshot of a repository, with or without a job. */
    async restoreFrom(
      repo: RepoRow,
      job: JobRow | null,
      snapshot: string,
      target: RestoreTarget,
      targetHostId: number,
      userId: string,
    ): Promise<RunRow> {
      const env = await envFor(repo, targetHostId);
      const run = await store.createRun({
        jobId: job?.id ?? null,
        jobName: job?.name ?? repo.name,
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
      const active = relaying.get(run.id);
      if (active) {
        active.abort();
        return;
      }
      await remote.root(runHost(run), cancelScript(run.uid), {
        timeoutMs: 30_000,
      });
    },

    async snapshots(job: JobRow): Promise<SnapshotView[]> {
      const repo = await repoOf(job);
      const host = resticHost(job);
      const out = await remote.root(
        host,
        snapshotsScript(await envFor(repo, host), `termix-job:${job.uid}`),
        { timeoutMs: 120_000, maxOutputBytes: 4 * 1024 * 1024 },
      );
      const list = parseSnapshots(out.stdout);
      if (host === job.hostId) return list;
      const root = pullRoot(job.uid);
      return list.map((s) => ({
        ...s,
        paths: s.paths.map((p) => sourcePath(p, root)),
      }));
    },

    async ls(
      job: JobRow,
      snapshot: string,
      dir: string,
    ): Promise<SnapshotEntry[]> {
      await ownSnapshot(job, snapshot);
      const repo = await repoOf(job);
      const out = await remote.root(
        resticHost(job),
        lsScript(await envFor(repo, resticHost(job)), snapshot, dir),
        { timeoutMs: 180_000, maxOutputBytes: 4 * 1024 * 1024 },
      );
      return parseLs(out.stdout, dir);
    },

    async forget(job: JobRow, snapshot: string): Promise<void> {
      await ownSnapshot(job, snapshot);
      const repo = await repoOf(job);
      await remote.root(
        resticHost(job),
        forgetSnapshotScript(await envFor(repo, resticHost(job)), snapshot),
        { timeoutMs: 600_000 },
      );
    },

    /** Env for a download stream, opened as the caller. */
    async dumpEnv(job: JobRow, snapshot: string): Promise<Env> {
      await ownSnapshot(job, snapshot);
      return envFor(await repoOf(job), resticHost(job));
    },

    /** Moves a finished run onto its job and tells the hooks. */
    async finished(
      run: RunRow | null,
      previousStatus: RunStatus | null,
    ): Promise<void> {
      if (!run || run.status === "running") return;
      const job = run.jobId ? await store.getJob(run.jobId) : null;
      let willRetry = false;
      if (job && run.kind === "backup") {
        const good = run.status === "success" || run.status === "warning";
        const retry =
          run.status === "canceled"
            ? { retryCount: 0, retryAt: null, willRetry: false }
            : retryState(job, run.status);
        willRetry = retry.willRetry;
        await store.updateJob(job.id, {
          retryCount: retry.retryCount,
          retryAt: retry.retryAt,
          // A retry keeps the status the job had before, so the recovery alert still works.
          lastStatus: willRetry ? job.lastStatus : run.status,
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
        await hooks.onFinished?.({ run, job, previousStatus, willRetry });
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
                ? run.resticHostId && run.kind === "restore"
                  ? "The restore stopped, maybe Termix restarted"
                  : "The run's files are gone from the host"
                : polled.result
                  ? "The run failed"
                  : polled.copying
                    ? "The copy from the source host stopped, maybe Termix restarted"
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
            .root(runHost(run), cleanupScript([run.uid]), { allowFail: true })
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
      // Runs Termix is copying right now are watched by their copy.
      const running = (await store.running()).filter(
        (run) => !relaying.has(run.id),
      );
      if (running.length === 0) return;
      const byHost = new Map<number, RunRow[]>();
      for (const run of running) {
        const host = runHost(run);
        byHost.set(host, [...(byHost.get(host) ?? []), run]);
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
