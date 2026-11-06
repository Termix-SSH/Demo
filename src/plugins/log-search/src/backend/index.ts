import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createSearch } from "./search.js";

export async function activate(ctx: PluginContext) {
  const search = createSearch(ctx, createRemote(ctx));
  registerOperations(ctx, search);
  registerRoutes(ctx.http.router<Router>(), ctx, search);
  ctx.log.info("Log Search routes mounted at /plugin-api/log-search");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
