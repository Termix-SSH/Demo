import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createInterfaces } from "./interfaces.js";
import { createRemote } from "./remote.js";
import { registerOperations } from "./operations.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const service = createService(remote);
  const interfaces = createInterfaces(remote);
  registerOperations(ctx, service, interfaces);
  registerRoutes(ctx.http.router<Router>(), ctx, { service, interfaces });
  ctx.log.info("WireGuard routes mounted at /plugin-api/wireguard");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
