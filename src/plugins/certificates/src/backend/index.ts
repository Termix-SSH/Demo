import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
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
  stop = startWatchChecker(ctx, watches, service);
  ctx.log.info("Certificates routes mounted at /plugin-api/certificates");
}

export async function deactivate() {
  stop?.();
  stop = null;
}
