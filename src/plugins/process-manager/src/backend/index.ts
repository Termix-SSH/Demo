import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerFollow } from "./follow.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { watches } from "./tables.js";
import {
  WatchChecker,
  createWatchAlerts,
  createWatchStore,
} from "./watches.js";

export async function activate(ctx: PluginContext) {
  const service = createService(createRemote(ctx));
  const store = createWatchStore(ctx, await ctx.db.define(watches));
  const checker = new WatchChecker(ctx, store, service, createWatchAlerts(ctx));
  checker.start();
  ctx.disposables.add(() => checker.dispose());

  registerOperations(ctx, service, store);
  registerRoutes(ctx.http.router<Router>(), ctx, {
    service,
    watches: store,
    checker,
  });
  registerFollow(ctx);
  ctx.log.info("Process Manager routes mounted at /plugin-api/process-manager");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
