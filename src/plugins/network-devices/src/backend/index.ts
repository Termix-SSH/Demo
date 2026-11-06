import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { devices } from "./tables.js";
import { registerRoutes } from "./routes.js";
import { registerOperations } from "./operations.js";
import { createService } from "./service.js";

const TICK_MS = 15_000;
const FIRST_RUN_MS = 5_000;

export async function activate(ctx: PluginContext) {
  const store = await ctx.db.define(devices);
  const service = createService(ctx, store);
  await service.hydrate();

  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, service);

  // Each device is read when its own interval has passed.
  ctx.schedule.after(FIRST_RUN_MS, () => service.runDue());
  ctx.schedule.every(TICK_MS, () => service.runDue(), { jitterMs: 2_000 });
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
