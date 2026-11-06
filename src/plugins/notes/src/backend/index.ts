import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { createAccess } from "./access.js";
import { registerOperations } from "./operations.js";
import { registerRoutes } from "./routes.js";
import { createService } from "./service.js";
import { createStore } from "./store.js";
import { notes } from "./tables.js";

export async function activate(ctx: PluginContext) {
  const table = await ctx.db.define(notes);
  const store = createStore(ctx, ctx.db, table);
  const service = createService(ctx, store, createAccess(ctx));

  registerOperations(ctx, service);
  registerRoutes(ctx.http.router<Router>(), ctx, service);

  // Host notes go with the host. A reset also clears the user's global notes.
  ctx.events.on("host.deleted", async (payload) => {
    const { hostId } = (payload ?? {}) as { hostId?: number };
    if (hostId) await store.removeHost(hostId);
  });
  ctx.events.on("user.data_wiped", async (payload) => {
    const { userId } = (payload ?? {}) as { userId?: string };
    if (userId) await store.removeUser(userId);
  });

  ctx.log.info("Notes routes mounted at /plugin-api/notes");
}

export async function deactivate() {
  // Everything above was registered through ctx and is disposed by core.
}
