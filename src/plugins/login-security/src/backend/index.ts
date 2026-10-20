import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { DEFAULT_SETTINGS, decide, readSettings } from "./policy.js";
import { registerRoutes } from "./routes.js";

const KEYS = Object.keys(DEFAULT_SETTINGS);

export async function activate(ctx: PluginContext) {
  // Kept in memory: core asks on every login and the login page asks often.
  let settings = readSettings(await ctx.settings.getAll("admin"));
  const reload = async () => {
    settings = readSettings(await ctx.settings.getAll("admin"));
  };
  for (const key of KEYS) {
    ctx.settings.onChange(key, () => {
      reload().catch((error) =>
        ctx.log.warn(
          `Could not reload login security settings: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
  }

  ctx.auth.policy.provide({
    evaluate: (input) => decide(settings, input),
    allowRememberDevice: () => settings.rememberDevice,
  });

  registerRoutes(ctx.http.router<Router>(), ctx, () => settings);
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
