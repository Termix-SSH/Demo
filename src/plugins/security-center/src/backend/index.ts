import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { Engine } from "./engine.js";
import { KnownKeys } from "./known.js";
import { registerOperations } from "./operations.js";
import { Osv } from "./osv.js";
import { createRemote } from "./remote.js";
import { createRotation } from "./rotation.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createStore } from "./store.js";
import { events, hosts, ignores } from "./tables.js";
import { VulnStore } from "./vuln-store.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const store = createStore(
    ctx,
    await ctx.db.define(hosts),
    await ctx.db.define(events),
    await ctx.db.define(ignores),
  );
  const dir = await ctx.files.dataDir();
  const osv = new Osv(ctx, dir);
  await osv.load();
  const known = new KnownKeys(ctx);
  const engine = new Engine(ctx, store, remote, osv, new VulnStore(dir), known);
  engine.start();
  ctx.disposables.add(() => engine.dispose());

  const service = createService(
    ctx,
    store,
    engine,
    createRotation(ctx, remote, known),
  );
  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, { store, engine, service });
  ctx.services.provide("security-center.access", {
    check: (hostId: number) => service.check(hostId),
  });
  ctx.log.info("Security Center routes mounted at /plugin-api/security-center");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
