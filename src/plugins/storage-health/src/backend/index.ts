import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { Engine } from "./engine.js";
import { History } from "./history.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createStore } from "./store.js";
import { events, hosts } from "./tables.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const store = createStore(
    ctx,
    await ctx.db.define(hosts),
    await ctx.db.define(events),
  );
  const history = new History(await ctx.files.dataDir());
  await history.load();
  const engine = new Engine(ctx, store, remote, history);
  engine.start();
  ctx.disposables.add(() => engine.dispose());

  const service = createService(ctx, store, engine, remote);
  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, {
    store,
    engine,
    history,
    service,
  });
  ctx.services.provide("storage-health.access", {
    check: (hostId: number) => service.check(hostId),
  });
  ctx.log.info("Storage Health routes mounted at /plugin-api/storage-health");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
