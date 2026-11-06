import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerFollow } from "./follow.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createSummaryCache } from "./summary.js";
import { createWatchStore, startWatchChecker } from "./watches.js";

let stop: (() => void) | null = null;

export async function activate(ctx: PluginContext) {
  const service = createService(createRemote(ctx));
  const summary = createSummaryCache(ctx, service);
  const watches = createWatchStore(ctx);
  registerOperations(ctx, service, summary);
  registerRoutes(ctx.http.router<Router>(), ctx, { service, summary, watches });
  registerFollow(ctx);
  stop = startWatchChecker(ctx, watches, service);
  ctx.log.info("Web Servers routes mounted at /plugin-api/web-servers");
}

export async function deactivate() {
  stop?.();
  stop = null;
}
