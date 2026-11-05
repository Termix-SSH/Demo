import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createSummaryCache } from "./summary.js";

export async function activate(ctx: PluginContext) {
  const service = createService(createRemote(ctx));
  const summary = createSummaryCache(ctx, service);
  registerOperations(ctx, service, summary);
  registerRoutes(ctx.http.router<Router>(), ctx, service, summary);
  ctx.log.info("Packages routes mounted at /plugin-api/package-manager");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
