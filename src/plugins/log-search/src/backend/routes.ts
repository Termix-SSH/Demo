import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { parseSearch } from "./query.js";
import type { SearchService } from "./search.js";

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
export function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof HostScriptError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(
    `Request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  res.status(500).json({ error: "Something went wrong" });
}

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  search: SearchService,
): void {
  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /**
   * @openapi
   * /hosts:
   *   get:
   *     summary: Hosts the signed in user can search
   *     description: Hosts with Log Search turned on that the user can connect to.
   *     responses:
   *       200:
   *         description: The searchable hosts.
   */
  router.get("/hosts", async (_req: Request, res: Response) => {
    try {
      res.json({ hosts: await search.hosts() });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /search:
   *   post:
   *     summary: Search logs on many hosts
   *     description: Reads the journal, log files and Docker logs on the chosen hosts over SSH and returns the matching lines, newest first. Nothing is stored.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               query:
   *                 type: string
   *               regex:
   *                 type: boolean
   *               caseSensitive:
   *                 type: boolean
   *               hostIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               sources:
   *                 type: array
   *                 items:
   *                   type: string
   *                   enum: [journal, files, docker]
   *               from:
   *                 type: integer
   *                 description: Start time in Unix ms.
   *               to:
   *                 type: integer
   *                 description: End time in Unix ms.
   *               level:
   *                 type: string
   *                 enum: [all, warn, error]
   *               origin:
   *                 type: string
   *               limit:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Matching lines and a status for every host.
   *       400:
   *         description: The search is not valid.
   */
  router.post("/search", async (req: Request, res: Response) => {
    try {
      const request = parseSearch((req.body ?? {}) as Record<string, unknown>);
      const response = await search.run(request);
      void ctx.audit.record({
        action: "log-search.search",
        resourceType: "server",
        resourceName: `${response.hosts.length} hosts`,
        success: true,
      });
      res.json(response);
    } catch (error) {
      fail(ctx, res, error);
    }
  });
}
