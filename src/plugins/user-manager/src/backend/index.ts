import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";

export async function activate(ctx: PluginContext) {
  const service = createService(createRemote(ctx));
  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, service);
  ctx.log.info("Users routes mounted at /plugin-api/user-manager");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
