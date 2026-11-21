import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { fail } from "./routes.js";
import { parseSearch, rangeMs } from "./query.js";
import { parseSavedInput, toSaved, type SavedStore } from "./saved.js";
import type { SearchService } from "./search.js";

/** Runs a saved search now over its own time range. */
export async function runSaved(
  search: SearchService,
  saved: ReturnType<typeof toSaved>,
  now = Date.now(),
) {
  return search.run(
    parseSearch(
      { ...saved.search, from: now - rangeMs(saved.search.range), to: now },
      now,
    ),
    now,
  );
}

export function registerSavedRoutes(
  router: Router,
  ctx: PluginContext,
  store: SavedStore,
  search: SearchService,
): void {
  const actor = () => {
    const userId = ctx.currentActor();
    if (!userId) throw new HostScriptError("Sign in first", 401);
    return userId;
  };
  const idOf = (req: Request) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) {
      throw new HostScriptError("Saved search not found", 404);
    }
    return id;
  };

  /**
   * @openapi
   * /plugin-api/log-search/saved:
   *   get:
   *     summary: The signed in user's saved searches
   *     description: Each saved search with its alert settings and the result of its last check.
   *     responses:
   *       200:
   *         description: The saved searches.
   */
  router.get("/saved", async (_req: Request, res: Response) => {
    try {
      res.json({ saved: (await store.list(actor())).map(toSaved) });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/saved:
   *   post:
   *     summary: Save a search
   *     description: Saves a search with a name, its time range and an optional alert that checks it every few minutes.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               search:
   *                 type: object
   *               alert:
   *                 type: object
   *                 properties:
   *                   enabled:
   *                     type: boolean
   *                   everyMinutes:
   *                     type: integer
   *                   minMatches:
   *                     type: integer
   *                   channelIds:
   *                     type: array
   *                     items:
   *                       type: integer
   *     responses:
   *       201:
   *         description: The saved search.
   *       400:
   *         description: The search is not valid.
   */
  router.post("/saved", async (req: Request, res: Response) => {
    try {
      const input = parseSavedInput(
        (req.body ?? {}) as Record<string, unknown>,
      );
      const row = await store.create(actor(), input);
      res.status(201).json(toSaved(row));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/saved/{id}:
   *   put:
   *     summary: Change a saved search
   *     description: Replaces the search, its name and its alert. An open alert starts over.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The saved search.
   *       400:
   *         description: The search is not valid.
   *       404:
   *         description: Not one of your saved searches.
   */
  router.put("/saved/:id", async (req: Request, res: Response) => {
    try {
      const input = parseSavedInput(
        (req.body ?? {}) as Record<string, unknown>,
      );
      const row = await store.update(actor(), idOf(req), input);
      if (!row) throw new HostScriptError("Saved search not found", 404);
      res.json(toSaved(row));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/saved/{id}:
   *   delete:
   *     summary: Delete a saved search
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   *       404:
   *         description: Not one of your saved searches.
   */
  router.delete("/saved/:id", async (req: Request, res: Response) => {
    try {
      if (!(await store.remove(actor(), idOf(req)))) {
        throw new HostScriptError("Saved search not found", 404);
      }
      res.json({ ok: true });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/saved/{id}/run:
   *   post:
   *     summary: Run a saved search now
   *     description: Runs it over its time range and returns the lines, like a search.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Matching lines and a status for every host.
   *       404:
   *         description: Not one of your saved searches.
   */
  router.post("/saved/:id/run", async (req: Request, res: Response) => {
    try {
      const row = await store.find(actor(), idOf(req));
      if (!row) throw new HostScriptError("Saved search not found", 404);
      res.json(await runSaved(search, toSaved(row)));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/log-search/channels:
   *   get:
   *     summary: The signed in user's alert channels
   *     description: Names and ids of the channels a saved search alert can go to. Empty when the Alerts plugin is off.
   *     responses:
   *       200:
   *         description: The channels.
   */
  router.get("/channels", async (_req: Request, res: Response) => {
    try {
      const channels = await ctx.notify.channels().catch(() => []);
      res.json({
        channels: channels
          .filter((c) => c.enabled)
          .map((c) => ({ id: c.id, name: c.name })),
      });
    } catch (error) {
      fail(ctx, res, error);
    }
  });
}
