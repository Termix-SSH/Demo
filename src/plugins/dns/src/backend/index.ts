import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { accounts, domains, links, snapshots } from "./tables.js";
import { registerRoutes } from "./routes.js";
import { registerOperations } from "./operations.js";
import { registerServices } from "./services.js";
import { createService } from "./service.js";

const TICK_MS = 60_000;
const FIRST_RUN_MS = 20_000;

export async function activate(ctx: PluginContext) {
  const stores = {
    accounts: await ctx.db.define(accounts),
    snapshots: await ctx.db.define(snapshots),
    domains: await ctx.db.define(domains),
    links: await ctx.db.define(links),
  };
  const service = createService(ctx, stores as never);

  registerOperations(ctx, service);
  registerServices(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, service);

  ctx.events.on("host.deleted", async (payload) => {
    const { hostId } = (payload ?? {}) as { hostId?: number };
    if (hostId) await service.removeHostLinks(hostId);
  });
  // A host that changed address updates its links soon
  ctx.events.on("host.updated", () => {
    ctx.schedule.after(5_000, () => service.runLinks("hosts"));
  });

  const work = async () => {
    await service.runLinks().catch(logTo(ctx));
    await service.runDaily().catch(logTo(ctx));
  };
  ctx.schedule.after(FIRST_RUN_MS, work);
  ctx.schedule.every(TICK_MS, work, { jitterMs: 5_000 });
}

function logTo(ctx: PluginContext) {
  return (error: unknown) =>
    ctx.log.warn(
      `DNS background work failed: ${error instanceof Error ? error.message : String(error)}`,
    );
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
