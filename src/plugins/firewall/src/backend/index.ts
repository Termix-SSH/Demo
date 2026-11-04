import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { readHostSettings } from "./host-settings.js";
import { createManager } from "./manager.js";
import { createRemote } from "./remote.js";
import { registerOperations } from "./operations.js";
import { registerRoutes } from "./routes.js";
import { createRuleSetStore } from "./rulesets.js";
import { pending, rulesetHosts, rulesets, watches } from "./tables.js";
import {
  WatchChecker,
  createWatchAlerts,
  createWatchStore,
} from "./watches.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const watchStore = createWatchStore(ctx, await ctx.db.define(watches));
  let checker: WatchChecker | null = null;
  const manager = createManager(
    ctx,
    remote,
    await ctx.db.define(pending),
    (hostId) => checker?.noteWrite(hostId),
  );
  checker = new WatchChecker(
    ctx,
    watchStore,
    async (hostId) =>
      manager.state(hostId, await readHostSettings(ctx, hostId)),
    createWatchAlerts(ctx),
  );
  checker.start();
  ctx.disposables.add(() => checker?.dispose());

  registerOperations(ctx, manager);
  registerRoutes(ctx.http.router<Router>(), ctx, {
    manager,
    remote,
    rulesets: createRuleSetStore(
      ctx,
      await ctx.db.define(rulesets),
      await ctx.db.define(rulesetHosts),
    ),
    watches: watchStore,
    checker,
  });
  ctx.log.info("Firewall routes mounted at /plugin-api/firewall");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
