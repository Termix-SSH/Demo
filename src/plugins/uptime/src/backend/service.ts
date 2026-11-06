import { randomBytes } from "node:crypto";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  MonitorInput,
  MonitorSecrets,
  MonitorStatus,
  MonitorView,
  UptimeSummary,
} from "../shared/types.js";
import type { BeatStore } from "./beats.js";
import { hashToken, type Entry, type UptimeEngine } from "./engine.js";
import type { MonitorRow, Repository } from "./repository.js";
import type { RollupStore } from "./rollups.js";
import {
  BlockedTargetError,
  isPrivateAddress,
  resolveTarget,
} from "./target-guard.js";
import {
  InputError,
  MAX_MONITORS_PER_USER,
  parseMonitor,
  type Limits,
} from "./validate.js";
import { accessReader, summarize, toView, type AccessOf } from "./views.js";

export class AccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface MonitorServiceDeps {
  ctx: PluginContext;
  repo: Repository;
  engine: UptimeEngine;
  rollups: RollupStore;
  beats: BeatStore;
  now?: () => number;
}

function actor(ctx: PluginContext): string {
  const userId = ctx.currentActor();
  if (!userId) throw new AccessError("Sign in first", 401);
  return userId;
}

/** Hosts in a target only matter while they run from the Termix server. */
function networkHost(input: MonitorInput): string | null {
  if (input.fromHostId) return null;
  const { config, type } = input;
  if (type === "http") return new URL(config.url ?? "").hostname;
  if (type === "tcp" || type === "ping" || type === "tls") {
    return config.target ?? null;
  }
  return null;
}

/** Whether a change touches what the monitor reaches or runs. */
function targetChanged(row: MonitorRow, input: MonitorInput): boolean {
  return (
    row.type !== input.type ||
    row.hostId !== (input.hostId ?? null) ||
    row.fromHostId !== (input.fromHostId ?? null) ||
    input.secrets !== undefined ||
    JSON.stringify(row.config) !== JSON.stringify(input.config)
  );
}

export type MonitorService = ReturnType<typeof createMonitorService>;

export function createMonitorService(deps: MonitorServiceDeps) {
  const { ctx, repo, engine, rollups, beats } = deps;
  const now = deps.now ?? Date.now;
  const viewDeps = { engine, rollups, beats };

  async function limits(): Promise<Limits> {
    return {
      minIntervalSec:
        Number(await ctx.settings.get("minIntervalSeconds")) || 20,
      defaultIntervalSec:
        Number(await ctx.settings.get("defaultIntervalSeconds")) || 60,
    };
  }

  /** Refuses targets and hosts the signed-in user has no right to. */
  async function authorize(input: MonitorInput): Promise<void> {
    const needHost = async (hostId: number, level: "connect" | "edit") => {
      const access = await ctx.hosts.checkAccess(hostId, level);
      if (!access.hasAccess) {
        throw new AccessError("You don't have access to that host", 403);
      }
    };
    if (input.type === "command") {
      if (!(await ctx.rbac.has("run-commands"))) {
        throw new AccessError(
          "You are not allowed to run commands on hosts",
          403,
        );
      }
      if (input.hostId) await needHost(input.hostId, "edit");
    } else if (input.hostId) {
      await needHost(input.hostId, "connect");
    }
    if (input.fromHostId) await needHost(input.fromHostId, "connect");

    const allowPrivate = await ctx.rbac.has("private-targets");
    if (allowPrivate) return;
    const server = input.type === "dns" ? input.config.dnsServer : "";
    if (server && isPrivateAddress(server) && !input.fromHostId) {
      throw new BlockedTargetError(server);
    }
    const host = networkHost(input);
    if (!host) return;
    try {
      await resolveTarget(host, false);
    } catch (error) {
      // A name that doesn't resolve yet can still be saved.
      if (error instanceof BlockedTargetError) throw error;
    }
  }

  async function seal(secrets: MonitorSecrets | undefined) {
    if (!secrets || Object.keys(secrets).length === 0) return null;
    return ctx.secrets.seal(JSON.stringify(secrets));
  }

  function pushUrlFor(req: unknown, token: string): string {
    const base = ctx.http.baseUrl(req as never);
    return `${base}/plugin-api/uptime/push/${token}`;
  }

  async function readAccess(userId: string): Promise<AccessOf> {
    return accessReader(repo, userId);
  }

  async function need(
    id: number,
    level: "view" | "edit" | "owner",
  ): Promise<{ entry: Entry; userId: string; access: AccessOf }> {
    const userId = actor(ctx);
    const entry = engine.entry(id);
    if (!entry) throw new AccessError("Monitor not found", 404);
    const access = await readAccess(userId);
    const have = access(entry.row);
    if (!have) throw new AccessError("Monitor not found", 404);
    const enough =
      have === "owner" ||
      level === "view" ||
      (level === "edit" && have === "edit");
    if (!enough) throw new AccessError("You can't change this monitor", 403);
    return { entry, userId, access };
  }

  return {
    need,
    limits,
    authorize,
    pushUrlFor,

    async list(): Promise<MonitorView[]> {
      const userId = actor(ctx);
      const access = await readAccess(userId);
      const at = now();
      const views: MonitorView[] = [];
      for (const entry of engine.all()) {
        const level = access(entry.row);
        if (level) views.push(toView(entry, level, userId, viewDeps, at));
      }
      return views.sort((a, b) => a.name.localeCompare(b.name));
    },

    async summary(): Promise<UptimeSummary> {
      return summarize(await this.list(), rollups, now());
    },

    async one(id: number, beatCount?: number): Promise<MonitorView> {
      const { entry, userId, access } = await need(id, "view");
      return toView(
        entry,
        access(entry.row) ?? "view",
        userId,
        viewDeps,
        now(),
        beatCount,
      );
    },

    async create(body: unknown, req: unknown): Promise<MonitorView> {
      const userId = actor(ctx);
      const input = parseMonitor(body, await limits());
      await authorize(input);
      const owned = engine.all().filter((e) => e.row.userId === userId);
      if (owned.length >= MAX_MONITORS_PER_USER) {
        throw new InputError(`You can have up to ${MAX_MONITORS_PER_USER}`);
      }
      const token =
        input.type === "push" ? randomBytes(24).toString("hex") : null;
      const row = await repo.createMonitor(
        userId,
        input,
        await seal(input.secrets),
        token ? hashToken(token) : null,
      );
      const entry = await engine.upsert(row);
      await engine.setWatch(row.id, userId, true);
      entry.nextAt = now();
      const view = toView(entry, "owner", userId, viewDeps, now());
      return token ? { ...view, pushUrl: pushUrlFor(req, token) } : view;
    },

    async update(id: number, body: unknown): Promise<MonitorView> {
      const { entry, userId } = await need(id, "edit");
      const raw = { ...(body as object), type: entry.row.type };
      const input = parseMonitor(raw, await limits());
      const changed = targetChanged(entry.row, input);
      // Only what changes needs the editor's own rights. Checks then run as them.
      if (changed) await authorize(input);
      const merged: MonitorSecrets = { ...entry.secrets, ...input.secrets };
      await repo.updateMonitor(id, input, {
        sealed: await seal(merged),
        updatedBy: changed ? userId : entry.row.updatedBy,
      });
      const row = await repo.getMonitor(id);
      if (!row) throw new AccessError("Monitor not found", 404);
      if (changed) engine.dropPing(id);
      const fresh = await engine.upsert(row);
      if (changed) fresh.nextAt = now();
      return this.one(id);
    },

    async remove(id: number): Promise<void> {
      await need(id, "owner");
      await repo.deleteMonitor(id);
      engine.drop(id);
      rollups.forget(id);
      beats.forget(id);
    },

    async setPaused(id: number, paused: boolean): Promise<MonitorView> {
      await need(id, "edit");
      await this.applyPause(id, paused, null);
      return this.one(id);
    },

    /** No access check, for callers that made their own. */
    async applyPause(id: number, paused: boolean, note: string | null) {
      await repo.setEnabled(id, !paused, note);
      const row = await repo.getMonitor(id);
      if (row) await engine.upsert(row);
    },

    async newPushToken(id: number, req: unknown): Promise<string> {
      const { entry } = await need(id, "edit");
      if (entry.row.type !== "push") {
        throw new InputError("Only push monitors have a URL");
      }
      const token = randomBytes(24).toString("hex");
      const hash = hashToken(token);
      await repo.setPushHash(id, hash);
      entry.row = { ...entry.row, pushTokenHash: hash };
      return pushUrlFor(req, token);
    },

    /** A monitor for every host in the list. Hosts already watched are skipped. */
    async addHosts(hostIds: number[]): Promise<number> {
      const userId = actor(ctx);
      const base = await limits();
      const have = new Set(
        engine
          .all()
          .filter((e) => e.row.userId === userId && e.row.type === "host")
          .map((e) => e.row.hostId),
      );
      let added = 0;
      for (const hostId of hostIds) {
        if (have.has(hostId)) continue;
        const host = await ctx.hosts.get(hostId);
        if (!host) continue;
        const input = parseMonitor(
          {
            name: host.name || host.ip,
            type: "host",
            hostId,
            config: {},
            tags: [],
          },
          base,
        );
        await authorize(input);
        const row = await repo.createMonitor(userId, input, null, null);
        await engine.upsert(row);
        await engine.setWatch(row.id, userId, true);
        added++;
      }
      return added;
    },

    async hostViews(hostId: number): Promise<MonitorView[]> {
      return (await this.list()).filter(
        (view) => view.hostId === hostId || view.fromHostId === hostId,
      );
    },
  };
}

export function worst(statuses: MonitorStatus[]): MonitorStatus {
  for (const status of ["down", "pending", "maintenance", "up"] as const) {
    if (statuses.includes(status)) return status;
  }
  return "unknown";
}
