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

const RUN_ID = /^[A-Za-z0-9-]{8,64}$/;

/** A search the caller named with a run id, so they can stop it. */
function runKey(ctx: PluginContext, runId: unknown): string | null {
  const actor = ctx.currentActor();
  if (!actor || typeof runId !== "string" || !RUN_ID.test(runId)) return null;
  return `${actor}:${runId}`;
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
   * /plugin-api/log-search/hosts:
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
   * /plugin-api/log-search/search:
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
   *               runId:
   *                 type: string
   *                 description: Lets the caller stop this search with search/cancel.
   *     responses:
   *       200:
   *         description: Matching lines and a status for every host.
   *       400:
   *         description: The search is not valid.
   */
  const running = new Map<string, AbortController>();

  router.post("/search", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = runKey(ctx, body.runId);
    const controller = new AbortController();
    try {
      const request = parseSearch(body);
      if (key) running.set(key, controller);
      const response = await search.run(request, Date.now(), controller.signal);
      void ctx.audit.record({
        action: "log-search.search",
        resourceType: "server",
        resourceName: `${response.hosts.length} hosts`,
        success: true,
      });
      res.json(response);
    } catch (error) {
      fail(ctx, res, error);
    } finally {
      if (key && running.get(key) === controller) running.delete(key);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/search/cancel:
   *   post:
   *     summary: Stop a running search
   *     description: Stops a search the caller started with this runId. Hosts already being read finish, the rest are skipped.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [runId]
   *             properties:
   *               runId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Whether a running search was stopped.
   */
  router.post("/search/cancel", (req: Request, res: Response) => {
    const key = runKey(ctx, (req.body as Record<string, unknown>)?.runId);
    const controller = key ? running.get(key) : undefined;
    controller?.abort();
    res.json({ cancelled: Boolean(controller) });
  });
}
