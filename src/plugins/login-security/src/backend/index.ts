import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  DEFAULT_SETTINGS,
  VERIFY_DECISION,
  connectFactorApplies,
  decide,
  readSettings,
} from "./policy.js";
import { registerRoutes } from "./routes.js";
import { noteLogin, type LoginEventDetails } from "./new-device.js";

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

  // People's background work (metrics, tunnels) never stops for a prompt.
  ctx.hosts.connectPolicy.provide({
    check: async (input) => {
      if (!connectFactorApplies(settings, input)) return { decision: "allow" };
      if (settings.connectFactor === "marked") {
        const marked = await ctx.settings.getHost<boolean>(
          input.hostId,
          "requireConnectFactor",
        );
        if (marked !== true) return { decision: "allow" };
      }
      return VERIFY_DECISION;
    },
  });

  ctx.events.on("internal.event", (payload) => {
    const event = payload as {
      event?: string;
      userId?: string;
      details?: LoginEventDetails;
    };
    if (event?.event !== "user_login" || !event.userId) return;
    noteLogin(ctx, event.userId, event.details ?? {}, {
      enabled: settings.newDeviceNotice,
    }).catch((error) =>
      ctx.log.warn(
        `Could not check the sign in device: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  });

  registerRoutes(ctx.http.router<Router>(), ctx, () => settings);
}

export async function deactivate() {
  // Everything registered through ctx is disposed by core.
}
