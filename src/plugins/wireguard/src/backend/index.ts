import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createInterfaces } from "./interfaces.js";
import { createRemote } from "./remote.js";
import { registerOperations } from "./operations.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createSummaryCache, registerSummary } from "./summary.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const service = createService(remote);
  const interfaces = createInterfaces(remote);
  const summary = createSummaryCache(ctx, { service, interfaces });
  registerOperations(ctx, service, interfaces, summary);
  const router = ctx.http.router<Router>();
  registerRoutes(router, ctx, { service, interfaces });
  registerSummary(router, ctx, summary);
  ctx.log.info("WireGuard routes mounted at /plugin-api/wireguard");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
