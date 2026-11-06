import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createAlerts } from "./alerts.js";
import { createEngine } from "./engine.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createScheduler } from "./scheduler.js";
import { createStore } from "./store.js";
import { jobs, repositories, runs } from "./tables.js";

export async function activate(ctx: PluginContext) {
  const store = createStore(ctx.db, {
    repositories: await ctx.db.define(repositories),
    jobs: await ctx.db.define(jobs),
    runs: await ctx.db.define(runs),
  });
  const alerts = createAlerts(ctx);
  const engine = createEngine(ctx, createRemote(ctx), store, {
    onFinished: (finished) => alerts.finished(finished),
    onStarting: (starting) => alerts.starting(starting),
  });
  const scheduler = createScheduler(ctx, store, engine, () =>
    alerts.checkStale(store),
  );
  scheduler.start();

  registerOperations(ctx, store, engine);
  registerRoutes(ctx.http.router<Router>(), ctx, { store, engine });
  ctx.log.info("Backups routes mounted at /plugin-api/backups");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
