import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { readHostSettings } from "./host-settings.js";
import type { GitService } from "./service.js";
import type { RepoStore, SavedRepo } from "./store.js";

const TICK_MS = 30_000;
/** Pulls started at once across all hosts. */
const CONCURRENCY = 3;

/**
 * Runs one repo's auto pull as the user who set it up, with that user's
 * current rights, and sends an alert when it starts or stops failing.
 */
export async function runAutoPull(
  ctx: PluginContext,
  service: GitService,
  hostId: number,
  repo: SavedRepo,
): Promise<void> {
  const auto = repo.auto;
  if (!auto) return;
  const userId = auto.updatedBy;
  await ctx.asUser(userId, async () => {
    const access = await ctx.hosts.checkAccess(hostId, "edit");
    const settings = await readHostSettings(ctx, hostId);
    if (!access.hasAccess || !settings.enabled || settings.readOnly) {
      await service.snooze(
        hostId,
        repo.path,
        "Git is off, read only or not editable for this user on the host",
      );
      return;
    }
    // A post command needs its own permission, checked on every run.
    const post =
      auto.postCommand && (await ctx.rbac.has("run-commands"))
        ? auto.postCommand
        : "";
    const result = await service.autoPull(hostId, settings, repo.path, post);
    if (result.nowFailing === result.wasFailing) return;
    const host = await ctx.hosts.get(hostId).catch(() => null);
    const hostName = host?.name || host?.ip || `#${hostId}`;
    const name = repo.path.split("/").pop() || repo.path;
    await ctx.notify
      .send({
        title: result.nowFailing
          ? `Auto pull failed for ${name} on ${hostName}`
          : `Auto pull works again for ${name} on ${hostName}`,
        body: result.nowFailing
          ? result.run.message
          : "The repo is pulling normally again.",
        severity: result.nowFailing ? "warning" : "info",
        category: "git.pull",
        audience: { userId },
        link: { tab: "git" },
        dedupeKey: `git:${hostId}:${repo.path}:${result.nowFailing ? "fail" : "ok"}`,
        context: { hostId, hostName, path: repo.path },
      })
      .catch(() => undefined);
  });
}

/** Every 30 seconds, pulls each repo whose time has come. */
export function startAutoPull(
  ctx: PluginContext,
  service: GitService,
  store: RepoStore,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due: Array<{ hostId: number; repo: SavedRepo }> = [];
      const now = Date.now();
      for (const hostId of await store.autoHosts()) {
        for (const repo of await store.list(hostId)) {
          if (!repo.auto?.enabled) continue;
          const at = repo.auto.nextAt ? Date.parse(repo.auto.nextAt) : 0;
          if (!at || at <= now) due.push({ hostId, repo });
        }
      }
      let next = 0;
      const worker = async () => {
        while (next < due.length) {
          const { hostId, repo } = due[next++];
          try {
            await runAutoPull(ctx, service, hostId, repo);
          } catch (error) {
            ctx.log.debug(
              `Auto pull failed for ${repo.path} on host ${hostId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker),
      );
    } finally {
      running = false;
    }
  };
  return ctx.schedule.every(TICK_MS, tick, { jitterMs: 5_000 });
}
