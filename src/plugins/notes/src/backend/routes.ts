import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { NotesError } from "./access.js";
import { parseInput, parseScope, type Service } from "./service.js";

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof NotesError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(
    `Notes request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  res.status(500).json({ error: "Something went wrong" });
}

/**
 * Mounts the Notes routes on the plugin's router, which core serves at
 * /plugin-api/notes with auth and the notes.use permission in front. Host
 * notes need connect access to read and edit access to change.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: Service,
): void {
  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const handle =
    (run: (req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        res.json(await run(req));
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");

  /**
   * @openapi
   * /plugin-api/notes/notes:
   *   get:
   *     summary: List notes
   *     description: Lists the notes of one host, folder or the caller's global notes, pinned first. Bodies are cut to an excerpt.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: query
   *         name: scope
   *         required: true
   *         schema:
   *           type: string
   *           enum: [host, folder, global]
   *       - in: query
   *         name: hostId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: folder
   *         schema:
   *           type: string
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The notes.
   */
  router.get(
    "/notes",
    handle((req) =>
      service.list({
        scope: parseScope(req.query.scope),
        hostId: req.query.hostId ? Number(req.query.hostId) : undefined,
        folder: text(req.query.folder) || undefined,
        q: text(req.query.q) || undefined,
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/notes/search:
   *   get:
   *     summary: Search all notes
   *     description: Searches titles, bodies and tags of every note the caller can open.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Matching notes.
   */
  router.get(
    "/search",
    handle((req) => service.search(text(req.query.q))),
  );

  /**
   * @openapi
   * /plugin-api/notes/folders:
   *   get:
   *     summary: Folders with hosts the caller can open
   *     tags:
   *       - Notes
   *     responses:
   *       200:
   *         description: Folder names.
   */
  router.get(
    "/folders",
    handle(() => service.folders()),
  );

  /**
   * @openapi
   * /plugin-api/notes/notes:
   *   post:
   *     summary: Create a note
   *     description: Needs edit access to the host for a host note, or edit access to a host in the folder for a folder note.
   *     tags:
   *       - Notes
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [scope]
   *             properties:
   *               scope:
   *                 type: string
   *                 enum: [host, folder, global]
   *               hostId:
   *                 type: integer
   *               folder:
   *                 type: string
   *               title:
   *                 type: string
   *               body:
   *                 type: string
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *               pinned:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The new note.
   */
  router.post(
    "/notes",
    handle((req) => service.create(parseInput(body(req)))),
  );

  /**
   * @openapi
   * /plugin-api/notes/notes/{uid}:
   *   get:
   *     summary: Read a note
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: uid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The note with its body.
   */
  router.get(
    "/notes/:uid",
    handle((req) => service.get(String(req.params.uid))),
  );

  /**
   * @openapi
   * /plugin-api/notes/notes/{uid}:
   *   put:
   *     summary: Update a note
   *     description: Only the fields sent are changed.
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: uid
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               title:
   *                 type: string
   *               body:
   *                 type: string
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *               pinned:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The updated note.
   */
  router.put(
    "/notes/:uid",
    handle((req) => service.update(String(req.params.uid), body(req))),
  );

  /**
   * @openapi
   * /plugin-api/notes/notes/{uid}:
   *   delete:
   *     summary: Delete a note
   *     tags:
   *       - Notes
   *     parameters:
   *       - in: path
   *         name: uid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/notes/:uid",
    handle(async (req) => {
      await service.remove(String(req.params.uid));
      return { ok: true };
    }),
  );
}
