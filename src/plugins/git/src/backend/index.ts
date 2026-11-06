import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { startAutoPull } from "./autopull.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createStore } from "./store.js";
import { createSummaryCache } from "./summary.js";

let stop: (() => void) | null = null;

export async function activate(ctx: PluginContext) {
  const store = createStore(ctx);
  const service = createService(createRemote(ctx), store);
  const summary = createSummaryCache(ctx, service);
  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, { service, store, summary });
  stop = startAutoPull(ctx, service, store);
  ctx.log.info("Git routes mounted at /plugin-api/git");
}

export async function deactivate() {
  stop?.();
  stop = null;
}
