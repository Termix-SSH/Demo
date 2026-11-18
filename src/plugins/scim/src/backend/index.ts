import type { Router } from "express";
import type {
  PluginContext,
  PluginRouterOptions,
} from "@termix-ssh/plugin-sdk/backend";
import { pluginDocsPage } from "@termix-ssh/plugin-sdk/docs";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerScimRoutes, SCIM_PATHS } from "./scim-routes.js";
import { createService, type Service } from "./service.js";
import { jsonBody } from "./body.js";
import { createStore } from "./store.js";
import {
  connections,
  events,
  groupMembers,
  scimGroups,
  scimUsers,
} from "./tables.js";
import { usersApi } from "./termix-users.js";

export async function activate(ctx: PluginContext) {
  const store = createStore(ctx, {
    connections: await ctx.db.define(connections),
    users: await ctx.db.define(scimUsers),
    groups: await ctx.db.define(scimGroups),
    members: await ctx.db.define(groupMembers),
    events: await ctx.db.define(events),
  });

  let service: Service | null = null;
  const getService = () => {
    const users = usersApi(ctx);
    if (!users) return null;
    service ??= createService({ store, users, log: ctx.log });
    return service;
  };

  // SCIM sends application/scim+json, which core's parser skips, and its
  // token in the Authorization header, which core passes only on these
  // public routes when asked.
  const options: PluginRouterOptions = {
    public: SCIM_PATHS,
    rawBody: true,
    publicRateLimit: 3000,
    publicAuthorization: true,
  };
  const router = ctx.http.router<Router>(options);
  router.use(jsonBody);

  registerScimRoutes({
    router,
    ctx,
    store,
    service: getService,
    docsUrl: pluginDocsPage(ctx.manifest.docs),
  });
  registerAdminRoutes({
    router,
    ctx,
    store,
    service: getService,
    users: () => usersApi(ctx),
  });
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
