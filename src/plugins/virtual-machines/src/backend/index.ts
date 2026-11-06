import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { registerConsole } from "./console.js";
import { createInventory } from "./inventory.js";
import { createJobs } from "./jobs.js";
import { createLibvirtProvider } from "./libvirt/provider.js";
import { registerOperations } from "./operations.js";
import { createRemote } from "./remote.js";
import { registerRoutes } from "./routes.js";
import { jobs as jobsTable, watches as watchesTable } from "./tables.js";
import { WatchChecker, createWatchStore } from "./watches.js";

export async function activate(ctx: PluginContext) {
  const remote = createRemote(ctx);
  const provider = createLibvirtProvider(remote);
  const watches = createWatchStore(ctx, await ctx.db.define(watchesTable));

  let checker: WatchChecker | null = null;
  const inventory = createInventory(provider, (hostId, read, changes) => {
    void checker?.onRead(hostId, read, changes);
  });
  checker = new WatchChecker(ctx, watches, inventory);
  checker.start();
  ctx.disposables.add(() => checker?.dispose());

  const jobs = createJobs(
    ctx,
    remote,
    await ctx.db.define(jobsTable),
    ({ row, status }) => {
      inventory.invalidate(row.hostId);
      try {
        ctx.operations.emit(
          "virtual-machines.job-finished",
          { kind: row.kind, label: row.label, status },
          { hostId: row.hostId },
        );
      } catch (error) {
        ctx.log.debug(`Could not emit a job event: ${String(error)}`);
      }
    },
  );
  jobs.startPolling();

  registerOperations(ctx, { provider, inventory, jobs });
  registerConsole(ctx, provider);
  registerRoutes(ctx.http.router<Router>(), ctx, {
    provider,
    inventory,
    jobs,
    watches,
  });
  ctx.log.info(
    "Virtual Machines mounted at /plugin-api/virtual-machines and /plugin-ws/virtual-machines/console",
  );
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
