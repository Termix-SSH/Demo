import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { MAX_RANGE_MS } from "../shared/types.js";
import { parseSearch } from "./query.js";
import { toSaved, type SavedRow, type SavedStore } from "./saved.js";
import type { SearchService } from "./search.js";

export const WATCH_TICK_MS = 60_000;
/** Most lines one check reads; enough to know a threshold was passed. */
const CHECK_LIMIT = 500;
const SAMPLE_LINES = 5;

type KeepAwake = (reason: string, awake: boolean) => void;

/**
 * Runs the saved searches that have an alert, each as the person who saved
 * it, over the time since its last check. One alert when a check finds
 * enough lines, one when a later check finds too few again.
 */
export function createWatch(
  ctx: PluginContext,
  store: SavedStore,
  search: SearchService,
) {
  let running = false;

  const keepAwake = (awake: boolean) => {
    const schedule = ctx.schedule as { keepAwake?: KeepAwake };
    schedule.keepAwake?.call(ctx.schedule, "watch", awake);
  };

  async function check(row: SavedRow, now: number): Promise<void> {
    const saved = toSaved(row);
    const last = row.lastRunAt ? Date.parse(row.lastRunAt) : NaN;
    const from = Math.max(
      Number.isFinite(last) ? last : now - saved.alert.everyMinutes * 60_000,
      now - MAX_RANGE_MS,
    );
    let count = 0;
    let sample: string[] = [];
    let error: string | null = null;
    let hostId: number | undefined;
    try {
      const result = await ctx.asUser(row.createdBy, () =>
        search.run(
          parseSearch(
            { ...saved.search, from, to: now, limit: CHECK_LIMIT },
            now,
          ),
          now,
        ),
      );
      count = result.entries.length;
      sample = result.entries
        .slice(0, SAMPLE_LINES)
        .map((e) => `${e.host}: ${e.message.slice(0, 300)}`);
      const hosts = new Set(result.entries.map((e) => e.hostId));
      if (hosts.size === 1) hostId = [...hosts][0];
      const failed = result.hosts.filter((h) => h.status === "error");
      if (result.hosts.length && failed.length === result.hosts.length) {
        error = failed[0]?.error ?? "Could not read the hosts";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const stamp = new Date(now).toISOString();
    const matched = !error && count >= saved.alert.minMatches;
    const update: Parameters<SavedStore["recordRun"]>[1] = {
      lastRunAt: stamp,
      lastCount: error ? null : count,
      lastError: error,
    };
    const context = {
      sourceId: row.id,
      sourceName: row.name,
      value: count,
      threshold: saved.alert.minMatches,
      ...(hostId ? { hostId } : {}),
    };

    if (matched) {
      update.lastMatchAt = stamp;
      if (!row.alertActive) {
        update.alertActive = true;
        await ctx.notify
          .send({
            audience: { userId: row.createdBy },
            title: `${row.name}: ${count >= CHECK_LIMIT ? `${CHECK_LIMIT}+` : count} matching log lines`,
            body: sample.join("\n"),
            severity: "warning",
            category: "log-search.match",
            link: { tab: "log-search" },
            channelIds: saved.alert.channelIds,
            dedupeKey: `log-search:${row.id}:match:${now}`,
            context,
          })
          .catch((e: unknown) =>
            ctx.log.warn(`Could not send a log alert: ${String(e)}`),
          );
      }
    } else if (!error && row.alertActive) {
      update.alertActive = false;
      await ctx.notify
        .send({
          audience: { userId: row.createdBy },
          title: `${row.name}: quiet again`,
          severity: "success",
          category: "log-search.quiet",
          link: { tab: "log-search" },
          channelIds: saved.alert.channelIds,
          dedupeKey: `log-search:${row.id}:quiet:${now}`,
          context,
        })
        .catch((e: unknown) =>
          ctx.log.warn(`Could not send a log alert: ${String(e)}`),
        );
    }
    await store.recordRun(row.id, update);
  }

  async function tick(now = Date.now()): Promise<void> {
    if (running) return;
    running = true;
    try {
      const rows = await store.listAlerting();
      keepAwake(rows.length > 0);
      for (const row of rows) {
        const last = row.lastRunAt ? Date.parse(row.lastRunAt) : 0;
        if (now - last < row.alertEvery * 60_000 - 5_000) continue;
        try {
          await check(row, now);
        } catch (e) {
          ctx.log.warn(`Saved search ${row.id} failed: ${String(e)}`);
        }
      }
    } finally {
      running = false;
    }
  }

  return { tick, check };
}
