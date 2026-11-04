import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createDrift } from "./drift.js";
import { createRollouts } from "./rollouts.js";
import { registerRoutes } from "./routes.js";
import { createRuleStore, decide } from "./rules.js";
import {
  baselineResults,
  baselines,
  batches,
  batchTargets,
  rules,
} from "./tables.js";

const DRIFT_TICK_MS = 60_000;

export async function activate(ctx: PluginContext) {
  const ruleStore = createRuleStore(ctx, await ctx.db.define(rules));
  await ruleStore.seed();
  const rollouts = createRollouts(ctx, {
    batches: await ctx.db.define(batches),
    targets: await ctx.db.define(batchTargets),
  });
  const drift = createDrift(ctx, {
    baselines: await ctx.db.define(baselines),
    results: await ctx.db.define(baselineResults),
  });

  await rollouts.recover();
  ctx.disposables.add(() => rollouts.stopAll());

  ctx.operations.approvals.provide(async (input) =>
    decide(await ruleStore.all(), input),
  );

  registerRoutes(ctx.http.router<Router>(), ctx, {
    rules: ruleStore,
    rollouts,
    drift,
  });

  ctx.schedule.every(DRIFT_TICK_MS, () => drift.tick(), { jitterMs: 5000 });
  ctx.log.info("Operations Center mounted at /plugin-api/operations-center");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
