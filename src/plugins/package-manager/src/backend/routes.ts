import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { PackageAction } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import { cleanNames, cleanQuery } from "./scripts.js";
import type { PackageService } from "./service.js";
import { registerSummary, type SummaryCache } from "./summary.js";

const ACTIONS: PackageAction[] = [
  "refresh",
  "update",
  "upgrade-all",
  "install",
  "remove",
  "hold",
  "unhold",
];
const NEEDS_NAMES = new Set<PackageAction>([
  "update",
  "install",
  "remove",
  "hold",
  "unhold",
]);

function actionOf(req: Request): PackageAction {
  const action = str(body(req).action) as PackageAction;
  if (!ACTIONS.includes(action)) throw new HostScriptError("Unknown action");
  return action;
}

/**
 * Mounts the Packages routes, served at /plugin-api/package-manager with
 * auth and the package-manager.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: PackageService,
  summary: SummaryCache,
): void {
  const { read, write, canEdit } = createHttp(router, ctx);
  registerSummary(router, ctx, summary);

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/status:
   *   get:
   *     summary: Package manager status on a host
   *     description: The package manager, whether root or passwordless sudo works, whether a reboot is needed and when the package index was last refreshed.
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The status.
   */
  router.get(
    "/:hostId/status",
    read(async (hostId, _req, s) => ({
      ...(await service.status(hostId, s)),
      canEdit: await canEdit(hostId, s),
      readOnly: s.readOnly,
    })),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/updates:
   *   get:
   *     summary: Packages with an update
   *     description: Read from the package index the host already has. Refresh the index first for the newest list.
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Name, current and new version, repo and whether it is a security update.
   */
  router.get(
    "/:hostId/updates",
    read(async (hostId, _req, s) => service.updates(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/installed:
   *   get:
   *     summary: Installed packages
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Name, version, size, summary and whether it is held.
   */
  router.get(
    "/:hostId/installed",
    read(async (hostId, _req, s) => service.installed(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/search:
   *   get:
   *     summary: Search available packages
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Up to about 100 matches.
   */
  router.get(
    "/:hostId/search",
    read(async (hostId, req, s) =>
      service.search(hostId, s, cleanQuery(req.query.q)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/history:
   *   get:
   *     summary: Recent package changes
   *     description: From the package manager's own log or history.
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Newest first.
   */
  router.get(
    "/:hostId/history",
    read(async (hostId, _req, s) => service.history(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/repos:
   *   get:
   *     summary: Package repositories
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The configured repositories and whether each is on.
   */
  router.get(
    "/:hostId/repos",
    read(async (hostId, _req, s) => service.repos(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/package-manager/{hostId}/action:
   *   post:
   *     summary: Change packages
   *     description: refresh, update, upgrade-all, install, remove, hold or unhold. Runs as root and can take several minutes.
   *     tags:
   *       - Packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [action]
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [refresh, update, upgrade-all, install, remove, hold, unhold]
   *               packages:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: The end of the package manager's output.
   *       400:
   *         description: The action failed. The output is in the answer.
   */
  router.post(
    "/:hostId/action",
    write(
      "action",
      async (hostId, req, s) => {
        const action = actionOf(req);
        const names = NEEDS_NAMES.has(action)
          ? cleanNames(body(req).packages)
          : [];
        try {
          return await service.act(hostId, s, action, names);
        } finally {
          summary.forget(hostId);
        }
      },
      (req) => {
        const packages = body(req).packages;
        const list = Array.isArray(packages) ? packages.join(" ") : "";
        return `${str(body(req).action)} ${list}`.trim().slice(0, 200);
      },
    ),
  );
}
