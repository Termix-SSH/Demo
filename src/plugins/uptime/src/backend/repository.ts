import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  MaintenanceInput,
  MonitorConfig,
  MonitorInput,
  MonitorStatus,
  MonitorType,
  NoteLevel,
  ShareGrant,
  StatusGroup,
  StatusNoteView,
  StatusPageInput,
} from "../shared/types.js";
import type { MaintenanceWindow } from "./maintenance.js";
import type { RollupRow } from "./rollups.js";
import type { RunState } from "./state.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Tables {
  monitors: Table;
  monitorAccess: Table;
  watches: Table;
  incidents: Table;
  rollups: Table;
  maintenance: Table;
  statusPages: Table;
  statusNotes: Table;
}

export interface MonitorRow {
  id: number;
  key: string;
  userId: string;
  updatedBy: string;
  name: string;
  type: MonitorType;
  groupName: string;
  tags: string[];
  config: MonitorConfig;
  sealed: string | null;
  hostId: number | null;
  fromHostId: number | null;
  intervalSec: number;
  retries: number;
  retryIntervalSec: number;
  timeoutSec: number;
  resendMinutes: number;
  enabled: boolean;
  pushTokenHash: string | null;
  status: MonitorStatus;
  statusSince: number | null;
  lastCheckAt: number | null;
  pauseNote: string | null;
  createdAt: number;
}

export interface GrantRow {
  id: number;
  monitorId: number;
  userId: string | null;
  roleId: number | null;
  level: "view" | "edit";
}

export interface PageRow {
  id: number;
  userId: string;
  slug: string;
  title: string;
  description: string;
  published: boolean;
  showLatency: boolean;
  groups: StatusGroup[];
}

export interface IncidentRow {
  id: number;
  monitorId: number;
  startedAt: number;
  endedAt: number | null;
  cause: string;
  ackBy: string | null;
  ackAt: number | null;
  note: string;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function toMonitor(row: Record<string, unknown>): MonitorRow {
  return {
    id: Number(row.id),
    key: row.monitorKey as string,
    userId: row.userId as string,
    updatedBy: row.updatedBy as string,
    name: row.name as string,
    type: row.type as MonitorType,
    groupName: (row.groupName as string) ?? "",
    tags: parseJson<string[]>(row.tags, []),
    config: parseJson<MonitorConfig>(row.config, {}),
    sealed: (row.sealed as string | null) ?? null,
    hostId: num(row.hostId),
    fromHostId: num(row.fromHostId),
    intervalSec: Number(row.intervalSec),
    retries: Number(row.retries),
    retryIntervalSec: Number(row.retryIntervalSec),
    timeoutSec: Number(row.timeoutSec),
    resendMinutes: Number(row.resendMinutes),
    enabled: Boolean(row.enabled),
    pushTokenHash: (row.pushTokenHash as string | null) ?? null,
    status: row.status as MonitorStatus,
    statusSince: num(row.statusSince),
    lastCheckAt: num(row.lastCheckAt),
    pauseNote: (row.pauseNote as string | null) ?? null,
    createdAt: Number(row.createdAt),
  };
}

function toIncident(row: Record<string, unknown>): IncidentRow {
  return {
    id: Number(row.id),
    monitorId: Number(row.monitorId),
    startedAt: Number(row.startedAt),
    endedAt: num(row.endedAt),
    cause: row.cause as string,
    ackBy: (row.ackBy as string | null) ?? null,
    ackAt: num(row.ackAt),
    note: (row.note as string | null) ?? "",
  };
}

function toWindow(row: Record<string, unknown>): MaintenanceWindow {
  return {
    id: Number(row.id),
    userId: row.userId as string,
    name: row.name as string,
    scope: row.scope as MaintenanceInput["scope"],
    monitorKeys: parseJson<string[]>(row.monitorKeys, []),
    tag: (row.tag as string | null) ?? undefined,
    kind: row.kind as MaintenanceInput["kind"],
    startsAt: num(row.startsAt) ?? undefined,
    endsAt: num(row.endsAt) ?? undefined,
    days: parseJson<number[]>(row.days, []),
    startMinute: num(row.startMinute) ?? undefined,
    durationMinutes: num(row.durationMinutes) ?? undefined,
    timezone: (row.timezone as string | null) ?? undefined,
    enabled: Boolean(row.enabled),
  };
}

function toPage(row: Record<string, unknown>): PageRow {
  return {
    id: Number(row.id),
    userId: row.userId as string,
    slug: row.slug as string,
    title: row.title as string,
    description: (row.description as string | null) ?? "",
    published: Boolean(row.published),
    showLatency: Boolean(row.showLatency),
    groups: parseJson<StatusGroup[]>(row.groups, []),
  };
}

function toNote(row: Record<string, unknown>): StatusNoteView {
  return {
    id: Number(row.id),
    title: row.title as string,
    body: (row.body as string | null) ?? "",
    level: row.level as NoteLevel,
    createdAt: Number(row.createdAt),
    resolvedAt: num(row.resolvedAt),
  };
}

export type Repository = ReturnType<typeof createRepository>;

export function createRepository(ctx: PluginContext, tables: Tables) {
  const db = () => ctx.db.client<Drizzle>();
  const {
    monitors,
    monitorAccess,
    watches,
    incidents,
    rollups,
    maintenance,
    statusPages,
    statusNotes,
  } = tables;
  const lazy = () => ctx.db.persist({ lazy: true });

  async function getMonitor(id: number): Promise<MonitorRow | null> {
    const rows = await (
      await db()
    )
      .select()
      .from(monitors)
      .where(eq(monitors.id, id));
    return rows[0] ? toMonitor(rows[0]) : null;
  }

  return {
    getMonitor,

    async listMonitors(): Promise<MonitorRow[]> {
      const rows = await (await db()).select().from(monitors);
      return rows.map(toMonitor);
    },

    async createMonitor(
      userId: string,
      input: MonitorInput,
      sealed: string | null,
      pushTokenHash: string | null,
    ): Promise<MonitorRow> {
      const monitorKey = randomUUID();
      const client = await db();
      await client.insert(monitors).values({
        monitorKey,
        userId,
        updatedBy: userId,
        name: input.name,
        type: input.type,
        groupName: input.groupName ?? "",
        tags: JSON.stringify(input.tags ?? []),
        config: JSON.stringify(input.config),
        sealed,
        hostId: input.hostId ?? null,
        fromHostId: input.fromHostId ?? null,
        intervalSec: input.intervalSec,
        retries: input.retries,
        retryIntervalSec: input.retryIntervalSec,
        timeoutSec: input.timeoutSec,
        resendMinutes: input.resendMinutes,
        enabled: input.enabled !== false,
        pushTokenHash,
        status: input.enabled === false ? "paused" : "unknown",
        createdAt: Date.now(),
      });
      const rows = await client
        .select()
        .from(monitors)
        .where(eq(monitors.monitorKey, monitorKey));
      const row = toMonitor(rows[0]);
      await client.insert(watches).values({ monitorId: row.id, userId });
      await ctx.db.persist();
      return row;
    },

    async updateMonitor(
      id: number,
      input: MonitorInput,
      fields: { sealed: string | null; updatedBy: string },
    ): Promise<void> {
      await (
        await db()
      )
        .update(monitors)
        .set({
          name: input.name,
          groupName: input.groupName ?? "",
          tags: JSON.stringify(input.tags ?? []),
          config: JSON.stringify(input.config),
          sealed: fields.sealed,
          updatedBy: fields.updatedBy,
          hostId: input.hostId ?? null,
          fromHostId: input.fromHostId ?? null,
          intervalSec: input.intervalSec,
          retries: input.retries,
          retryIntervalSec: input.retryIntervalSec,
          timeoutSec: input.timeoutSec,
          resendMinutes: input.resendMinutes,
          enabled: input.enabled !== false,
        })
        .where(eq(monitors.id, id));
      await ctx.db.persist();
    },

    async deleteMonitor(id: number): Promise<void> {
      const client = await db();
      await client.delete(monitorAccess).where(eq(monitorAccess.monitorId, id));
      await client.delete(watches).where(eq(watches.monitorId, id));
      await client.delete(incidents).where(eq(incidents.monitorId, id));
      await client.delete(rollups).where(eq(rollups.monitorId, id));
      await client.delete(monitors).where(eq(monitors.id, id));
      await ctx.db.persist();
    },

    async saveState(
      id: number,
      state: Pick<RunState, "status" | "since" | "lastAt">,
    ): Promise<void> {
      await (
        await db()
      )
        .update(monitors)
        .set({
          status: state.status,
          statusSince: state.since,
          lastCheckAt: state.lastAt,
        })
        .where(eq(monitors.id, id));
      await lazy();
    },

    async setEnabled(
      id: number,
      enabled: boolean,
      pauseNote: string | null,
    ): Promise<void> {
      await (
        await db()
      )
        .update(monitors)
        .set({ enabled, pauseNote })
        .where(eq(monitors.id, id));
      await ctx.db.persist();
    },

    async setPushHash(id: number, hash: string): Promise<void> {
      await (
        await db()
      )
        .update(monitors)
        .set({ pushTokenHash: hash })
        .where(eq(monitors.id, id));
      await ctx.db.persist();
    },

    async listAllGrants(): Promise<GrantRow[]> {
      const rows = await (await db()).select().from(monitorAccess);
      return rows.map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        monitorId: Number(row.monitorId),
        userId: (row.userId as string | null) ?? null,
        roleId: num(row.roleId),
        level: row.level as "view" | "edit",
      }));
    },

    async setGrants(
      monitorId: number,
      grants: ShareGrant[],
      grantedBy: string,
    ): Promise<void> {
      const client = await db();
      await client
        .delete(monitorAccess)
        .where(eq(monitorAccess.monitorId, monitorId));
      if (grants.length) {
        await client.insert(monitorAccess).values(
          grants.map((grant) => ({
            monitorId,
            userId: grant.userId ?? null,
            roleId: grant.roleId ?? null,
            level: grant.level,
            grantedBy,
          })),
        );
      }
      await ctx.db.persist();
    },

    async roleIdsOf(userId: string): Promise<number[]> {
      const { userRoles } = await ctx.db.refs<{ userRoles: Table }>();
      const rows = await (
        await db()
      )
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));
      return rows.map((row: { roleId: number }) => Number(row.roleId));
    },

    async listAllWatches(): Promise<
      Array<{ monitorId: number; userId: string }>
    > {
      const rows = await (await db()).select().from(watches);
      return rows.map((row: { monitorId: number; userId: string }) => ({
        monitorId: Number(row.monitorId),
        userId: row.userId,
      }));
    },

    async setWatch(
      monitorId: number,
      userId: string,
      on: boolean,
    ): Promise<void> {
      const client = await db();
      await client
        .delete(watches)
        .where(
          and(eq(watches.monitorId, monitorId), eq(watches.userId, userId)),
        );
      if (on) await client.insert(watches).values({ monitorId, userId });
      await ctx.db.persist();
    },

    async openIncident(
      monitorId: number,
      startedAt: number,
      cause: string,
    ): Promise<void> {
      await (
        await db()
      )
        .insert(incidents)
        .values({ monitorId, startedAt, cause: cause.slice(0, 300) });
      await lazy();
    },

    async closeIncident(monitorId: number, endedAt: number): Promise<void> {
      await (
        await db()
      )
        .update(incidents)
        .set({ endedAt })
        .where(
          and(eq(incidents.monitorId, monitorId), isNull(incidents.endedAt)),
        );
      await lazy();
    },

    /** Open incidents by monitor, with why each one opened. */
    async openCauses(): Promise<Map<number, string>> {
      const rows = await (
        await db()
      )
        .select({ monitorId: incidents.monitorId, cause: incidents.cause })
        .from(incidents)
        .where(isNull(incidents.endedAt));
      return new Map(
        rows.map((row: { monitorId: number; cause: string }) => [
          Number(row.monitorId),
          row.cause,
        ]),
      );
    },

    async listIncidents(
      monitorIds: number[],
      limit: number,
      before?: number,
    ): Promise<IncidentRow[]> {
      if (monitorIds.length === 0) return [];
      const inScope = inArray(incidents.monitorId, monitorIds);
      const rows = await (
        await db()
      )
        .select()
        .from(incidents)
        .where(before ? and(inScope, lt(incidents.startedAt, before)) : inScope)
        .orderBy(desc(incidents.startedAt))
        .limit(limit);
      return rows.map(toIncident);
    },

    async getIncident(id: number): Promise<IncidentRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(incidents)
        .where(eq(incidents.id, id));
      return rows[0] ? toIncident(rows[0]) : null;
    },

    async ackIncident(id: number, userId: string, note: string): Promise<void> {
      await (
        await db()
      )
        .update(incidents)
        .set({ ackBy: userId, ackAt: Date.now(), note })
        .where(eq(incidents.id, id));
      await ctx.db.persist();
    },

    async listRollups(): Promise<RollupRow[]> {
      const rows = await (await db()).select().from(rollups);
      return rows.map((row: Record<string, unknown>) => ({
        monitorId: Number(row.monitorId),
        size: row.size as RollupRow["size"],
        bucket: Number(row.bucket),
        up: Number(row.up),
        down: Number(row.down),
        maintenance: Number(row.maintenance),
        latencySum: Number(row.latencySum),
        latencyCount: Number(row.latencyCount),
        latencyMin: num(row.latencyMin),
        latencyMax: num(row.latencyMax),
      }));
    },

    /** Writes changed rows, then one lazy save. */
    async saveRollups(rows: RollupRow[]): Promise<void> {
      if (rows.length === 0) return;
      const client = await db();
      for (const row of rows) {
        const where = and(
          eq(rollups.monitorId, row.monitorId),
          eq(rollups.size, row.size),
          eq(rollups.bucket, row.bucket),
        );
        const values = {
          up: row.up,
          down: row.down,
          maintenance: row.maintenance,
          latencySum: row.latencySum,
          latencyCount: row.latencyCount,
          latencyMin: row.latencyMin,
          latencyMax: row.latencyMax,
        };
        const have = await client
          .select({ id: rollups.id })
          .from(rollups)
          .where(where);
        if (have.length) {
          await client.update(rollups).set(values).where(where);
        } else {
          await client.insert(rollups).values({
            monitorId: row.monitorId,
            size: row.size,
            bucket: row.bucket,
            ...values,
          });
        }
      }
      await lazy();
    },

    async pruneRollups(hours: number, days: number): Promise<void> {
      await (
        await db()
      )
        .delete(rollups)
        .where(
          or(
            and(eq(rollups.size, "hour"), lt(rollups.bucket, hours)),
            and(eq(rollups.size, "day"), lt(rollups.bucket, days)),
          ),
        );
      await (await db()).delete(incidents).where(lt(incidents.startedAt, days));
      await lazy();
    },

    async listWindows(): Promise<MaintenanceWindow[]> {
      const rows = await (await db()).select().from(maintenance);
      return rows.map(toWindow);
    },

    async saveWindow(
      userId: string,
      input: MaintenanceInput,
      id?: number,
    ): Promise<void> {
      const values = {
        name: input.name,
        scope: input.scope,
        monitorKeys: JSON.stringify(input.monitorKeys ?? []),
        tag: input.tag ?? null,
        kind: input.kind,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        days: JSON.stringify(input.days ?? []),
        startMinute: input.startMinute ?? null,
        durationMinutes: input.durationMinutes ?? null,
        timezone: input.timezone ?? null,
        enabled: input.enabled !== false,
      };
      const client = await db();
      if (id) {
        await client
          .update(maintenance)
          .set(values)
          .where(eq(maintenance.id, id));
      } else {
        await client.insert(maintenance).values({ userId, ...values });
      }
      await ctx.db.persist();
    },

    async deleteWindow(id: number): Promise<void> {
      await (await db()).delete(maintenance).where(eq(maintenance.id, id));
      await ctx.db.persist();
    },

    async listPages(): Promise<PageRow[]> {
      const rows = await (await db()).select().from(statusPages);
      return rows.map(toPage);
    },

    async pageBySlug(slug: string): Promise<PageRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(statusPages)
        .where(eq(statusPages.slug, slug));
      return rows[0] ? toPage(rows[0]) : null;
    },

    async pageById(id: number): Promise<PageRow | null> {
      const rows = await (
        await db()
      )
        .select()
        .from(statusPages)
        .where(eq(statusPages.id, id));
      return rows[0] ? toPage(rows[0]) : null;
    },

    async savePage(
      userId: string,
      input: StatusPageInput,
      id?: number,
    ): Promise<void> {
      const values = {
        slug: input.slug,
        title: input.title,
        description: input.description ?? "",
        published: input.published === true,
        showLatency: input.showLatency === true,
        groups: JSON.stringify(input.groups),
      };
      const client = await db();
      if (id) {
        await client
          .update(statusPages)
          .set(values)
          .where(eq(statusPages.id, id));
      } else {
        await client.insert(statusPages).values({ userId, ...values });
      }
      await ctx.db.persist();
    },

    async deletePage(id: number): Promise<void> {
      const client = await db();
      await client.delete(statusNotes).where(eq(statusNotes.pageId, id));
      await client.delete(statusPages).where(eq(statusPages.id, id));
      await ctx.db.persist();
    },

    async listNotes(pageId: number): Promise<StatusNoteView[]> {
      const rows = await (
        await db()
      )
        .select()
        .from(statusNotes)
        .where(eq(statusNotes.pageId, pageId))
        .orderBy(desc(statusNotes.createdAt));
      return rows.map(toNote);
    },

    async addNote(
      pageId: number,
      note: { title: string; body: string; level: NoteLevel },
    ): Promise<void> {
      await (
        await db()
      )
        .insert(statusNotes)
        .values({ pageId, ...note, createdAt: Date.now() });
      await ctx.db.persist();
    },

    async resolveNote(pageId: number, noteId: number): Promise<void> {
      await (
        await db()
      )
        .update(statusNotes)
        .set({ resolvedAt: Date.now() })
        .where(and(eq(statusNotes.id, noteId), eq(statusNotes.pageId, pageId)));
      await ctx.db.persist();
    },

    async deleteNote(pageId: number, noteId: number): Promise<void> {
      await (
        await db()
      )
        .delete(statusNotes)
        .where(and(eq(statusNotes.id, noteId), eq(statusNotes.pageId, pageId)));
      await ctx.db.persist();
    },
  };
}
