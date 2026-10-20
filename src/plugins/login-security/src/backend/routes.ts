import type { Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { LoginSecuritySettings } from "./policy.js";

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  settings: () => LoginSecuritySettings,
): void {
  /**
   * @openapi
   * /policy:
   *   get:
   *     summary: Idle timeout for the signed in user
   *     description: The idle timeout in minutes, 0 when off. The app uses it to sign out after a time without activity.
   *     tags:
   *       - Login Security
   *     responses:
   *       200:
   *         description: The idle timeout.
   */
  router.get("/policy", (_req, res) => {
    res.json({ idleTimeoutMinutes: settings().idleTimeoutMinutes });
  });

  /**
   * @openapi
   * /activity:
   *   post:
   *     summary: Mark the session as active
   *     description: Sent while someone works in a terminal or another view that makes no other requests, so the server does not end the session as idle.
   *     tags:
   *       - Login Security
   *     responses:
   *       204:
   *         description: Recorded.
   */
  router.post("/activity", (_req, res) => {
    res.status(204).end();
  });

  /**
   * @openapi
   * /status:
   *   get:
   *     summary: Second factors available
   *     description: Admin only. The second factors installed plugins provide, so the settings page can warn when a second factor is required but none is installed.
   *     tags:
   *       - Login Security
   *     responses:
   *       200:
   *         description: The second factors.
   *       403:
   *         description: Not an admin.
   */
  router.get("/status", ctx.rbac.require("manage") as never, (_req, res) => {
    res.json({
      factors: ctx.auth.listSecondFactors(),
      secondFactor: settings().secondFactor,
    });
  });
}
