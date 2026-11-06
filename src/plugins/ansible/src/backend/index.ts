import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createSummaryCache, registerSummary } from "./summary.js";

export async function activate(ctx: PluginContext) {
  const service = createService(ctx, createRemote(ctx));
  const summary = createSummaryCache(ctx, service);
  registerOperations(ctx, service, summary);
  const router = ctx.http.router<Router>();
  registerRoutes(router, ctx, service);
  registerSummary(router, ctx, summary);
  ctx.log.info("Ansible routes mounted at /plugin-api/ansible");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
