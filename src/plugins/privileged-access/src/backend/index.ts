import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { requests } from "./tables.js";
import { createRequestStore } from "./store.js";
import { createAccessService } from "./access.js";
import { createWorkflow } from "./workflow.js";
import { registerRoutes } from "./routes.js";
import { registerOperations } from "./operations.js";

/** What other plugins (Session Recording) ask about hosts. */
export interface PrivilegedHostsV1 {
  isPrivileged: (hostId: number) => Promise<boolean>;
}

export async function activate(ctx: PluginContext) {
  const table = await ctx.db.define(requests);
  const store = createRequestStore(ctx.db, table);
  const access = createAccessService(ctx, store);
  await access.reloadGrants();
  const workflow = createWorkflow(ctx, store, access);

  ctx.hosts.connectPolicy.provide({ check: (input) => access.check(input) });

  ctx.services.provide<PrivilegedHostsV1>("privileged-access.hosts", {
    isPrivileged: async (hostId) =>
      (await access.hostSettings(hostId)).privileged,
  });

  ctx.http
    .router<Router>()
    .use(registerRoutes({ ctx, store, access, workflow }));
  registerOperations(ctx, store, access, workflow);

  ctx.events.on("host.updated", (payload) => {
    const hostId = Number((payload as { hostId?: unknown })?.hostId);
    if (Number.isSafeInteger(hostId)) access.forgetHost(hostId);
  });

  workflow.startSweep();
  ctx.log.info("Privileged Access mounted at /plugin-api/privileged-access");
}

export async function deactivate() {}
