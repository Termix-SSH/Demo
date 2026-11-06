import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { accounts, limits, usage } from "./tables.js";
import { registerOperations } from "./operations.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";

const TICK_MS = 60_000;
const FIRST_RUN_MS = 30_000;

export async function activate(ctx: PluginContext) {
  const stores = {
    accounts: await ctx.db.define(accounts),
    usage: await ctx.db.define(usage),
    limits: await ctx.db.define(limits),
  };
  const service = createService(ctx, stores as never);

  registerOperations(ctx, service);
  // Uploads are streamed, so the limit only guards the form parser
  registerRoutes(ctx.http.router<Router>({ bodyLimit: "1gb" }), ctx, service);

  const work = () =>
    service
      .runDue()
      .catch((error: unknown) =>
        ctx.log.warn(
          `Object storage background work failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  ctx.schedule.after(FIRST_RUN_MS, work);
  ctx.schedule.every(TICK_MS, work, { jitterMs: 5_000 });
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
