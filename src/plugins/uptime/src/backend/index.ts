import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createAlerts } from "./alerts.js";
import { BeatStore } from "./beats.js";
import { UptimeEngine } from "./engine.js";
import { registerOperations } from "./operations.js";
import { createRelay } from "./relay.js";
import { createRepository } from "./repository.js";
import { RollupStore } from "./rollups.js";
import { PUBLIC_RATE_LIMIT, PUBLIC_ROUTES, registerRoutes } from "./routes.js";
import { createMonitorService } from "./service.js";
import {
  incidents,
  maintenance,
  monitorAccess,
  monitors,
  rollups,
  statusNotes,
  statusPages,
  watches,
} from "./tables.js";

export async function activate(ctx: PluginContext) {
  const repo = createRepository(ctx, {
    monitors: await ctx.db.define(monitors),
    monitorAccess: await ctx.db.define(monitorAccess),
    watches: await ctx.db.define(watches),
    incidents: await ctx.db.define(incidents),
    rollups: await ctx.db.define(rollups),
    maintenance: await ctx.db.define(maintenance),
    statusPages: await ctx.db.define(statusPages),
    statusNotes: await ctx.db.define(statusNotes),
  });
  const beats = new BeatStore();
  const rollupStore = new RollupStore();
  const engine = new UptimeEngine({
    ctx,
    repo,
    beats,
    rollups: rollupStore,
    alerts: createAlerts(ctx),
    relay: createRelay(ctx),
  });
  await engine.start();
  ctx.disposables.add(() => engine.dispose());

  const service = createMonitorService({
    ctx,
    repo,
    engine,
    rollups: rollupStore,
    beats,
  });

  ctx.events.on("host.deleted", ({ hostId }) => {
    for (const entry of engine.all()) {
      const { row } = entry;
      if (row.hostId !== hostId && row.fromHostId !== hostId) continue;
      void service
        .applyPause(row.id, true, "Its host was deleted")
        .catch((error) =>
          ctx.log.warn(`Could not pause monitor ${row.id}: ${String(error)}`),
        );
    }
  });

  registerOperations(ctx, service, engine);
  registerRoutes(
    ctx.http.router<Router>({
      public: PUBLIC_ROUTES,
      publicRateLimit: PUBLIC_RATE_LIMIT,
    }),
    ctx,
    { repo, engine, monitors: service, rollups: rollupStore, beats },
  );
  ctx.services.provide("uptime.access", {
    summary: () => service.summary(),
    hostMonitors: (hostId: number) => service.hostViews(hostId),
  });
  ctx.log.info("Uptime routes mounted at /plugin-api/uptime");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
