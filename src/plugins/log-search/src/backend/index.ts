import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerFollow } from "./follow.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createSavedStore } from "./saved.js";
import { registerSavedRoutes } from "./saved-routes.js";
import { createSearch } from "./search.js";
import { saved } from "./tables.js";
import { WATCH_TICK_MS, createWatch } from "./watch.js";

export async function activate(ctx: PluginContext) {
  const search = createSearch(ctx, createRemote(ctx));
  const store = createSavedStore(ctx, await ctx.db.define(saved));
  registerOperations(ctx, search, store);
  const router = ctx.http.router<Router>();
  registerRoutes(router, ctx, search);
  registerSavedRoutes(router, ctx, store, search);
  registerFollow(ctx, search);

  const watch = createWatch(ctx, store, search);
  ctx.schedule.every(WATCH_TICK_MS, () => watch.tick(), { id: "watch" });
  ctx.log.info("Log Search routes mounted at /plugin-api/log-search");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
