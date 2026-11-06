import type {
  AccessLevel,
  MonitorConfig,
  MonitorView,
  UptimeSummary,
} from "../shared/types.js";
import type { Entry, UptimeEngine } from "./engine.js";
import type { MonitorRow, Repository } from "./repository.js";
import type { RollupStore } from "./rollups.js";
import type { BeatStore } from "./beats.js";

export const LIST_BEATS = 60;

export type AccessOf = (row: MonitorRow) => AccessLevel | null;

/** What one user may do with each monitor, read once per request. */
export async function accessReader(
  repo: Repository,
  userId: string,
): Promise<AccessOf> {
  const [grants, roles] = await Promise.all([
    repo.listAllGrants(),
    repo.roleIdsOf(userId),
  ]);
  const roleSet = new Set(roles);
  const levels = new Map<number, "view" | "edit">();
  for (const grant of grants) {
    const mine =
      grant.userId === userId ||
      (grant.roleId !== null && roleSet.has(grant.roleId));
    if (!mine) continue;
    if (grant.level === "edit" || !levels.has(grant.monitorId)) {
      levels.set(grant.monitorId, grant.level);
    }
  }
  return (row) =>
    row.userId === userId ? "owner" : (levels.get(row.id) ?? null);
}

/** The stored command is for people who can edit it. */
function visibleConfig(config: MonitorConfig, access: AccessLevel) {
  if (access !== "view" || !config.command) return config;
  return { ...config, command: "" };
}

export interface ViewDeps {
  engine: UptimeEngine;
  rollups: RollupStore;
  beats: BeatStore;
}

export function toView(
  entry: Entry,
  access: AccessLevel,
  userId: string,
  deps: ViewDeps,
  now: number,
  beats = LIST_BEATS,
): MonitorView {
  const { row, state, secrets } = entry;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    groupName: row.groupName,
    tags: row.tags,
    config: visibleConfig(row.config, access),
    hasSecrets: Object.keys(secrets).length > 0,
    hostId: row.hostId,
    fromHostId: row.fromHostId,
    intervalSec: row.intervalSec,
    retries: row.retries,
    retryIntervalSec: row.retryIntervalSec,
    timeoutSec: row.timeoutSec,
    resendMinutes: row.resendMinutes,
    enabled: row.enabled,
    access,
    owner: access === "owner",
    status: row.enabled ? state.status : "paused",
    statusSince: state.since,
    lastCheckAt: state.lastAt,
    latencyMs: state.latencyMs,
    message: row.enabled ? state.message : (row.pauseNote ?? ""),
    cert: entry.cert,
    uptime: deps.rollups.uptime(row.id, now),
    beats: deps.beats.list(row.id, beats),
    watching: deps.engine.isWatching(row.id, userId),
  };
}

export function summarize(
  views: MonitorView[],
  rollups: RollupStore,
  now: number,
): UptimeSummary {
  const summary: UptimeSummary = {
    total: views.length,
    up: 0,
    down: 0,
    pending: 0,
    paused: 0,
    maintenance: 0,
    uptimeMonth: null,
  };
  let sum = 0;
  let counted = 0;
  for (const view of views) {
    if (view.status === "up") summary.up++;
    else if (view.status === "down") summary.down++;
    else if (view.status === "pending") summary.pending++;
    else if (view.status === "paused") summary.paused++;
    else if (view.status === "maintenance") summary.maintenance++;
    const month = rollups.uptime(view.id, now).month;
    if (month !== null) {
      sum += month;
      counted++;
    }
  }
  if (counted) summary.uptimeMonth = Math.round((sum / counted) * 100) / 100;
  return summary;
}
