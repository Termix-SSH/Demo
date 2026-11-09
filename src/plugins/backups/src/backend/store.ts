import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, lt, lte, ne } from "drizzle-orm";
import type { PluginDatabase } from "@termix-ssh/plugin-sdk/backend";
import {
  EMPTY_KEEP,
  type JobAlerts,
  type JobHooks,
  type JobSource,
  type KeepPolicy,
  type RepoKind,
  type RepoLocation,
  type RestoreTarget,
  type RunKind,
  type RunProgress,
  type RunStatus,
  type RunSummary,
  type RunTrigger,
} from "../shared/types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;

export interface RepoRow {
  id: number;
  uid: string;
  ownerId: string;
  name: string;
  kind: RepoKind;
  location: RepoLocation;
  secretSealed: string | null;
  passwordSealed: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRow {
  id: number;
  uid: string;
  hostId: number;
  repositoryId: number;
  name: string;
  enabled: boolean;
  sources: JobSource[];
  secretsSealed: string | null;
  hooks: JobHooks;
  cron: string;
  timezone: string;
  keep: KeepPolicy;
  alerts: JobAlerts;
  oneFileSystem: boolean;
  lastStatus: RunStatus | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  lastSnapshotId: string | null;
  lastBytes: number | null;
  staleAlertAt: string | null;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunRow {
  id: number;
  uid: string;
  jobId: number | null;
  jobName: string;
  hostId: number;
  repositoryId: number;
  kind: RunKind;
  trigger: RunTrigger;
  status: RunStatus;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  polledAt: string | null;
  snapshotId: string | null;
  progress: RunProgress | null;
  summary: RunSummary | null;
  target: RestoreTarget | null;
  error: string | null;
  log: string | null;
}

function parse<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string" || !text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const iso = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

function toRepo(row: any): RepoRow {
  return {
    id: row.id,
    uid: row.uid,
    ownerId: row.ownerId,
    name: row.name,
    kind: row.kind,
    location: parse<RepoLocation>(row.location, {}),
    secretSealed: row.secretSealed ?? null,
    passwordSealed: row.passwordSealed,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

function toJob(row: any): JobRow {
  return {
    id: row.id,
    uid: row.uid,
    hostId: row.hostId,
    repositoryId: row.repositoryId,
    name: row.name,
    enabled: Boolean(row.enabled),
    sources: parse<JobSource[]>(row.sources, []),
    secretsSealed: row.secretsSealed ?? null,
    hooks: parse<JobHooks>(row.hooks, { pre: "", post: "" }),
    cron: row.cron ?? "",
    timezone: row.timezone ?? "",
    keep: { ...EMPTY_KEEP, ...parse<Partial<KeepPolicy>>(row.keep, {}) },
    alerts: {
      onFailure: true,
      staleDays: 0,
      ...parse<Partial<JobAlerts>>(row.alerts, {}),
    },
    oneFileSystem: Boolean(row.oneFileSystem),
    lastStatus: row.lastStatus ?? null,
    lastRunAt: iso(row.lastRunAt),
    lastSuccessAt: iso(row.lastSuccessAt),
    nextRunAt: iso(row.nextRunAt),
    lastSnapshotId: row.lastSnapshotId ?? null,
    lastBytes:
      row.lastBytes === null || row.lastBytes === undefined
        ? null
        : Number(row.lastBytes),
    staleAlertAt: iso(row.staleAlertAt),
    updatedBy: row.updatedBy,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

function toRun(row: any): RunRow {
  return {
    id: row.id,
    uid: row.uid,
    jobId: row.jobId ?? null,
    jobName: row.jobName ?? "",
    hostId: row.hostId,
    repositoryId: row.repositoryId,
    kind: row.kind,
    trigger: row.startedVia,
    status: row.status,
    startedBy: row.startedBy,
    startedAt: row.startedAt ?? "",
    finishedAt: iso(row.finishedAt),
    polledAt: iso(row.polledAt),
    snapshotId: row.snapshotId ?? null,
    progress: parse<RunProgress | null>(row.progress, null),
    summary: parse<RunSummary | null>(row.summary, null),
    target: parse<RestoreTarget | null>(row.target, null),
    error: row.error ?? null,
    log: row.log ?? null,
  };
}

export interface Tables {
  repositories: Table;
  jobs: Table;
  runs: Table;
}

export type JobFields = Omit<
  JobRow,
  | "id"
  | "uid"
  | "createdAt"
  | "updatedAt"
  | "lastStatus"
  | "lastRunAt"
  | "lastSuccessAt"
  | "lastSnapshotId"
  | "lastBytes"
  | "staleAlertAt"
>;

function jobValues(fields: Partial<JobRow>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || key === "id" || key === "uid") continue;
    out[key] =
      key === "sources" || key === "hooks" || key === "keep" || key === "alerts"
        ? JSON.stringify(value)
        : value;
  }
  return out;
}

function runValues(fields: Partial<RunRow>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || key === "id" || key === "uid") continue;
    // "trigger" is an SQL word, so the column is started_via.
    if (key === "trigger") {
      out.startedVia = value;
      continue;
    }
    out[key] =
      key === "progress" || key === "summary" || key === "target"
        ? value === null
          ? null
          : JSON.stringify(value)
        : value;
  }
  return out;
}

export function createStore(db: PluginDatabase, t: Tables) {
  const client = () => db.client<any>();
  const now = () => new Date().toISOString();

  return {
    // Repositories

    async listRepos(ownerId?: string): Promise<RepoRow[]> {
      const d = await client();
      const rows = ownerId
        ? await d
            .select()
            .from(t.repositories)
            .where(eq(t.repositories.ownerId, ownerId))
        : await d.select().from(t.repositories);
      return rows
        .map(toRepo)
        .sort((a: RepoRow, b: RepoRow) => a.name.localeCompare(b.name));
    },

    async getRepo(id: number): Promise<RepoRow | null> {
      // Postgres refuses NaN, so a bad id from a URL finds nothing.
      if (!Number.isSafeInteger(id)) return null;

      const rows = await (
        await client()
      )
        .select()
        .from(t.repositories)
        .where(eq(t.repositories.id, id))
        .limit(1);
      return rows[0] ? toRepo(rows[0]) : null;
    },

    async createRepo(fields: {
      ownerId: string;
      name: string;
      kind: RepoKind;
      location: RepoLocation;
      secretSealed: string | null;
      passwordSealed: string;
    }): Promise<RepoRow> {
      const uid = randomUUID();
      const d = await client();
      await d.insert(t.repositories).values({
        uid,
        ...fields,
        location: JSON.stringify(fields.location),
        createdAt: now(),
        updatedAt: now(),
      });
      await db.persist();
      const rows = await d
        .select()
        .from(t.repositories)
        .where(eq(t.repositories.uid, uid))
        .limit(1);
      return toRepo(rows[0]);
    },

    async updateRepo(
      id: number,
      fields: Partial<
        Pick<
          RepoRow,
          "name" | "kind" | "location" | "secretSealed" | "passwordSealed"
        >
      >,
    ): Promise<void> {
      const set: Record<string, unknown> = { updatedAt: now() };
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        set[key] = key === "location" ? JSON.stringify(value) : value;
      }
      await (
        await client()
      )
        .update(t.repositories)
        .set(set)
        .where(eq(t.repositories.id, id));
      await db.persist();
    },

    async deleteRepo(id: number): Promise<void> {
      await (
        await client()
      )
        .delete(t.repositories)
        .where(eq(t.repositories.id, id));
      await db.persist();
    },

    // Jobs

    async listJobs(
      filter: { hostId?: number; repositoryId?: number } = {},
    ): Promise<JobRow[]> {
      const d = await client();
      const where = [
        filter.hostId !== undefined
          ? eq(t.jobs.hostId, filter.hostId)
          : undefined,
        filter.repositoryId !== undefined
          ? eq(t.jobs.repositoryId, filter.repositoryId)
          : undefined,
      ].filter(Boolean);
      const rows = where.length
        ? await d
            .select()
            .from(t.jobs)
            .where(and(...where))
        : await d.select().from(t.jobs);
      return rows
        .map(toJob)
        .sort((a: JobRow, b: JobRow) => a.name.localeCompare(b.name));
    },

    async getJob(id: number): Promise<JobRow | null> {
      // Postgres refuses NaN, so a bad id from a URL finds nothing.
      if (!Number.isSafeInteger(id)) return null;

      const rows = await (
        await client()
      )
        .select()
        .from(t.jobs)
        .where(eq(t.jobs.id, id))
        .limit(1);
      return rows[0] ? toJob(rows[0]) : null;
    },

    async createJob(fields: JobFields): Promise<JobRow> {
      const uid = randomUUID();
      const d = await client();
      await d.insert(t.jobs).values({
        uid,
        ...jobValues(fields),
        createdAt: now(),
        updatedAt: now(),
      });
      await db.persist();
      const rows = await d
        .select()
        .from(t.jobs)
        .where(eq(t.jobs.uid, uid))
        .limit(1);
      return toJob(rows[0]);
    },

    async updateJob(
      id: number,
      fields: Partial<JobRow>,
      touch = false,
    ): Promise<void> {
      const set = jobValues(fields);
      if (touch) set.updatedAt = now();
      if (Object.keys(set).length === 0) return;
      await (await client()).update(t.jobs).set(set).where(eq(t.jobs.id, id));
      await db.persist();
    },

    async deleteJob(id: number): Promise<void> {
      const d = await client();
      await d.delete(t.jobs).where(eq(t.jobs.id, id));
      await d.update(t.runs).set({ jobId: null }).where(eq(t.runs.jobId, id));
      await db.persist();
    },

    async dueJobs(at: string): Promise<JobRow[]> {
      const rows = await (
        await client()
      )
        .select()
        .from(t.jobs)
        .where(
          and(
            eq(t.jobs.enabled, true),
            ne(t.jobs.cron, ""),
            lte(t.jobs.nextRunAt, at),
          ),
        );
      return rows.map(toJob);
    },

    // Runs

    async createRun(fields: {
      jobId: number | null;
      jobName: string;
      hostId: number;
      repositoryId: number;
      kind: RunKind;
      trigger: RunTrigger;
      startedBy: string;
      target?: RestoreTarget | null;
    }): Promise<RunRow> {
      const uid = randomUUID();
      const d = await client();
      await d.insert(t.runs).values({
        uid,
        ...runValues({ ...fields, target: fields.target ?? null }),
        status: "running",
        startedAt: now(),
        polledAt: now(),
      });
      await db.persist();
      const rows = await d
        .select()
        .from(t.runs)
        .where(eq(t.runs.uid, uid))
        .limit(1);
      return toRun(rows[0]);
    },

    async updateRun(
      id: number,
      fields: Partial<RunRow>,
      persist = true,
    ): Promise<void> {
      const set = runValues(fields);
      if (Object.keys(set).length === 0) return;
      await (await client()).update(t.runs).set(set).where(eq(t.runs.id, id));
      if (persist) await db.persist();
    },

    async deleteRun(id: number): Promise<void> {
      await (await client()).delete(t.runs).where(eq(t.runs.id, id));
      await db.persist();
    },

    async getRun(id: number): Promise<RunRow | null> {
      // Postgres refuses NaN, so a bad id from a URL finds nothing.
      if (!Number.isSafeInteger(id)) return null;

      const rows = await (
        await client()
      )
        .select()
        .from(t.runs)
        .where(eq(t.runs.id, id))
        .limit(1);
      return rows[0] ? toRun(rows[0]) : null;
    },

    async running(): Promise<RunRow[]> {
      const rows = await (
        await client()
      )
        .select()
        .from(t.runs)
        .where(eq(t.runs.status, "running"));
      return rows.map(toRun);
    },

    async runningForJob(jobId: number): Promise<RunRow | null> {
      const rows = await (
        await client()
      )
        .select()
        .from(t.runs)
        .where(
          and(
            eq(t.runs.jobId, jobId),
            eq(t.runs.kind, "backup"),
            eq(t.runs.status, "running"),
          ),
        )
        .limit(1);
      return rows[0] ? toRun(rows[0]) : null;
    },

    async listRuns(filter: {
      jobId?: number;
      hostIds?: number[];
      before?: number;
      limit: number;
    }): Promise<RunRow[]> {
      if (filter.hostIds && filter.hostIds.length === 0) return [];
      const where = [
        filter.jobId !== undefined ? eq(t.runs.jobId, filter.jobId) : undefined,
        filter.hostIds ? inArray(t.runs.hostId, filter.hostIds) : undefined,
        filter.before ? lt(t.runs.id, filter.before) : undefined,
      ].filter(Boolean);
      const d = await client();
      const base = d.select().from(t.runs);
      const rows = await (where.length ? base.where(and(...where)) : base)
        .orderBy(desc(t.runs.id))
        .limit(filter.limit);
      return rows.map(toRun);
    },

    /** Drops finished runs older than `days`. */
    async pruneRuns(days: number): Promise<void> {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      await (
        await client()
      )
        .delete(t.runs)
        .where(and(ne(t.runs.status, "running"), lt(t.runs.startedAt, cutoff)));
      await db.persist();
    },
  };
}

export type Store = ReturnType<typeof createStore>;
