import type {
  JobSource,
  JobView,
  RepositoryView,
  RunDetail,
  RunView,
} from "../shared/types.js";
import type { JobRow, RepoRow, RunRow } from "./store.js";

export function repoView(repo: RepoRow, jobs: number): RepositoryView {
  return {
    id: repo.id,
    name: repo.name,
    kind: repo.kind,
    location: repo.location,
    hasSecret: Boolean(repo.secretSealed),
    jobs,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
  };
}

export function jobView(
  job: JobRow,
  repo: RepoRow | null,
  secretIds: Set<string>,
  runningRunId: number | null,
  actor: string | undefined,
): JobView {
  const sources: JobSource[] = job.sources.map((source) =>
    source.kind === "database"
      ? { ...source, hasPassword: secretIds.has(source.id) }
      : source,
  );
  return {
    id: job.id,
    hostId: job.hostId,
    repositoryId: job.repositoryId,
    repositoryName: repo?.name ?? "",
    repositoryKind: repo?.kind ?? null,
    name: job.name,
    enabled: job.enabled,
    sources,
    hooks: job.hooks,
    cron: job.cron,
    timezone: job.timezone,
    keep: job.keep,
    alerts: job.alerts,
    oneFileSystem: job.oneFileSystem,
    lastStatus: job.lastStatus,
    lastRunAt: job.lastRunAt,
    lastSuccessAt: job.lastSuccessAt,
    nextRunAt: job.nextRunAt,
    lastSnapshotId: job.lastSnapshotId,
    lastBytes: job.lastBytes,
    runningRunId,
    canEditRepo: Boolean(repo && actor && repo.ownerId === actor),
  };
}

export function runView(run: RunRow): RunView {
  return {
    id: run.id,
    jobId: run.jobId,
    jobName: run.jobName,
    hostId: run.hostId,
    kind: run.kind,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    snapshotId: run.snapshotId,
    progress: run.progress,
    summary: run.summary,
    error: run.error,
    target: run.target,
  };
}

export function runDetail(run: RunRow): RunDetail {
  return { ...runView(run), log: run.log ?? "" };
}
