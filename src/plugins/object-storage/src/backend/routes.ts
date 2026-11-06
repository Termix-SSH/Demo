import { Readable } from "node:stream";
import Busboy from "busboy";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { SettingKind } from "../shared/types.js";
import { providers } from "./presets.js";
import { StorageError, type ObjectStorageService } from "./service.js";

const SETTING_KINDS: SettingKind[] = [
  "versioning",
  "lifecycle",
  "cors",
  "policy",
  "tags",
  "encryption",
  "publicAccess",
];

// Types a browser may show inline. Anything else is sent as a download.
const INLINE_TYPES =
  /^(image\/(png|jpeg|gif|webp|avif|bmp)|text\/plain|application\/json)(;|$)/i;

function fail(res: Response, error: unknown) {
  if (res.headersSent) return res.end();
  if (error instanceof StorageError) {
    return res.status(error.status).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ error: message });
}

const num = (value: unknown) => Number(value);
const body = (req: Request) => (req.body ?? {}) as Record<string, any>;
const query = (req: Request, name: string) =>
  typeof req.query[name] === "string" ? (req.query[name] as string) : "";

function contentDisposition(name: string, inline: boolean): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: ObjectStorageService,
): void {
  const view = ctx.rbac.require("view") as never;
  const edit = ctx.rbac.require("edit") as never;
  const manage = ctx.rbac.require("manage") as never;

  /** Wraps a handler so a thrown error becomes an answer. */
  const handle =
    (run: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const result = await run(req, res);
        if (!res.headersSent) res.json(result ?? { success: true });
      } catch (error) {
        fail(res, error);
      }
    };

  const account = (req: Request) => num(req.params.accountId);
  const bucket = (req: Request) => String(req.params.bucket);
  const base = "/accounts/:accountId/buckets/:bucket";

  /**
   * @openapi
   * /plugin-api/object-storage/providers:
   *   get:
   *     summary: List the provider presets with their endpoint templates
   *     tags:
   *       - Object Storage
   *     responses:
   *       200:
   *         description: The presets
   */
  router.get("/providers", view, (_req: Request, res: Response) => {
    res.json({ providers });
  });

  /**
   * @openapi
   * /plugin-api/object-storage/summary:
   *   get:
   *     summary: Totals for the dashboard card
   *     tags:
   *       - Object Storage
   *     responses:
   *       200:
   *         description: Logins, buckets, stored bytes and buckets close to their limit
   */
  router.get(
    "/summary",
    view,
    handle(() => service.summary()),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts:
   *   get:
   *     summary: List the storage logins, without their keys
   *     tags:
   *       - Object Storage
   *     responses:
   *       200:
   *         description: The accounts
   */
  router.get(
    "/accounts",
    view,
    handle(async () => ({ accounts: await service.accounts() })),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts:
   *   post:
   *     summary: Add a storage login
   *     tags:
   *       - Object Storage
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               provider:
   *                 type: string
   *               name:
   *                 type: string
   *               endpoint:
   *                 type: string
   *               region:
   *                 type: string
   *               pathStyle:
   *                 type: boolean
   *               accessKeyId:
   *                 type: string
   *               secretAccessKey:
   *                 type: string
   *     responses:
   *       201:
   *         description: Account added
   *       400:
   *         description: Missing or invalid fields
   *       409:
   *         description: An account with that name exists
   */
  router.post(
    "/accounts",
    manage,
    handle(async (req, res) => {
      const id = await service.createAccount(
        body(req) as never,
        ctx.currentActor() as string,
      );
      res.status(201).json({ id });
    }),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}:
   *   put:
   *     summary: Change a storage login. Empty keys keep the saved ones.
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Saved
   *       404:
   *         description: Account not found
   */
  router.put(
    "/accounts/:accountId",
    manage,
    handle(async (req) => service.updateAccount(account(req), body(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}:
   *   delete:
   *     summary: Remove a storage login and its saved readings
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Removed
   *       404:
   *         description: Account not found
   */
  router.delete(
    "/accounts/:accountId",
    manage,
    handle(async (req) => service.removeAccount(account(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/test:
   *   post:
   *     summary: Check that the keys work
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The number of buckets found
   *       403:
   *         description: The keys were refused
   */
  router.post(
    "/accounts/:accountId/test",
    manage,
    handle(async (req) => service.testAccount(account(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets:
   *   get:
   *     summary: List the buckets of a login with their last size reading
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The buckets
   */
  router.get(
    "/accounts/:accountId/buckets",
    view,
    handle(async (req) => ({ buckets: await service.buckets(account(req)) })),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets:
   *   post:
   *     summary: Create a bucket
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *     responses:
   *       201:
   *         description: Bucket created
   *       400:
   *         description: Invalid bucket name
   *       409:
   *         description: The name is taken
   */
  router.post(
    "/accounts/:accountId/buckets",
    manage,
    handle(async (req, res) => {
      const result = await service.createBucket(account(req), body(req).name);
      res.status(201).json(result);
    }),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}:
   *   delete:
   *     summary: Delete an empty bucket
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Bucket deleted
   *       409:
   *         description: The bucket is not empty
   */
  router.delete(
    base,
    manage,
    handle(async (req) => service.deleteBucket(account(req), bucket(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/limit:
   *   put:
   *     summary: Set the size and object limits that raise an alert
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               maxBytes:
   *                 type: integer
   *                 nullable: true
   *               maxObjects:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Saved
   */
  router.put(
    `${base}/limit`,
    manage,
    handle(async (req) =>
      service.setLimit(account(req), bucket(req), body(req)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/usage:
   *   get:
   *     summary: The saved size readings of a bucket, one per day
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The readings
   */
  router.get(
    `${base}/usage`,
    view,
    handle(async (req) => ({
      points: await service.history(account(req), bucket(req)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/scan:
   *   post:
   *     summary: Count the objects and bytes of a bucket now
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The new reading
   */
  router.post(
    `${base}/scan`,
    edit,
    handle(async (req) => service.scanBucket(account(req), bucket(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/objects:
   *   get:
   *     summary: List the folders and objects under a prefix
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: prefix
   *         schema:
   *           type: string
   *       - in: query
   *         name: token
   *         schema:
   *           type: string
   *       - in: query
   *         name: search
   *         description: List every object under the prefix, with no folders
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: One page of the listing
   */
  router.get(
    `${base}/objects`,
    view,
    handle(async (req) =>
      service.listObjects(account(req), bucket(req), {
        prefix: query(req, "prefix"),
        token: query(req, "token") || undefined,
        search: !!query(req, "search"),
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/head:
   *   get:
   *     summary: Size, type and metadata of one object
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The object details
   *       404:
   *         description: Object not found
   */
  router.get(
    `${base}/head`,
    view,
    handle(async (req) =>
      service.head(account(req), bucket(req), query(req, "key")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/download:
   *   get:
   *     summary: Stream an object, with range support
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: inline
   *         description: Show images and text in the browser instead of downloading
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The object bytes
   *       206:
   *         description: The requested range
   *       404:
   *         description: Object not found
   */
  router.get(
    "/accounts/:accountId/buckets/:bucket/download",
    view,
    async (req: Request, res: Response) => {
      const abort = new AbortController();
      res.on("close", () => abort.abort());
      try {
        const key = query(req, "key");
        const upstream = await service.download(
          account(req),
          bucket(req),
          key,
          typeof req.headers.range === "string" ? req.headers.range : undefined,
          abort.signal,
        );
        const type = upstream.headers.get("content-type") ?? "";
        const inline = !!query(req, "inline") && INLINE_TYPES.test(type);
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          inline ? type : "application/octet-stream",
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "sandbox");
        res.setHeader(
          "Content-Disposition",
          contentDisposition(key.split("/").pop() || "download", inline),
        );
        for (const name of [
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
          "last-modified",
        ]) {
          const value = upstream.headers.get(name);
          if (value) res.setHeader(name, value);
        }
        if (!upstream.body) return res.end();
        Readable.fromWeb(upstream.body as never)
          .on("error", () => res.destroy())
          .pipe(res);
      } catch (error) {
        fail(res, error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/upload:
   *   post:
   *     summary: Upload files as a multipart form, large files go in parts
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: prefix
   *         description: Folder the files are saved in
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: The saved object names
   *       400:
   *         description: No file was sent
   */
  router.post(`${base}/upload`, edit, (req: Request, res: Response) => {
    const prefix = query(req, "prefix").replace(/^\/+/, "");
    const targetAccount = account(req);
    const targetBucket = bucket(req);
    let busboy: ReturnType<typeof Busboy>;
    try {
      busboy = Busboy({
        headers: req.headers,
        preservePath: true,
        defParamCharset: "utf8",
      });
    } catch {
      return fail(res, new StorageError(400, "Send the files as a form"));
    }
    const saved: string[] = [];
    const jobs: Promise<void>[] = [];
    let failure: unknown = null;
    busboy.on("file", (_field, stream, info) => {
      const name = info.filename.replace(/^\/+/, "").replace(/\.\.\//g, "");
      if (!name) {
        stream.resume();
        return;
      }
      const key = `${prefix}${name}`;
      jobs.push(
        service
          .upload(
            targetAccount,
            targetBucket,
            key,
            stream,
            info.mimeType || "application/octet-stream",
          )
          .then(() => {
            saved.push(key);
          })
          .catch((error) => {
            failure ??= error;
            stream.resume();
          }),
      );
    });
    busboy.on("error", (error) => {
      failure ??= error;
    });
    busboy.on("close", () => {
      void Promise.all(jobs).then(() => {
        if (failure) return fail(res, failure);
        if (!saved.length) {
          return fail(res, new StorageError(400, "No file was sent"));
        }
        res.json({ saved });
      });
    });
    req.pipe(busboy);
  });

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/folder:
   *   post:
   *     summary: Create an empty folder
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               prefix:
   *                 type: string
   *     responses:
   *       200:
   *         description: Folder created
   */
  router.post(
    `${base}/folder`,
    edit,
    handle(async (req) =>
      service.makeFolder(account(req), bucket(req), body(req).prefix),
    ),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/delete:
   *   post:
   *     summary: Delete objects and whole folders
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               keys:
   *                 type: array
   *                 items:
   *                   type: string
   *               prefixes:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: How many were deleted and which failed
   */
  router.post(
    `${base}/delete`,
    edit,
    handle(async (req) =>
      service.removeObjects(account(req), bucket(req), body(req)),
    ),
  );

  for (const action of ["copy", "move"] as const) {
    /**
     * @openapi
     * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/copy:
     *   post:
     *     summary: Copy an object or a folder, or move it (the same body at /move)
     *     tags:
     *       - Object Storage
     *     parameters:
     *       - in: path
     *         name: accountId
     *         required: true
     *         schema:
     *           type: integer
     *       - in: path
     *         name: bucket
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               from:
     *                 type: string
     *               to:
     *                 type: string
     *               folder:
     *                 type: boolean
     *               toBucket:
     *                 type: string
     *     responses:
     *       200:
     *         description: How many objects were copied or moved
     */
    router.post(
      `${base}/${action}`,
      edit,
      handle(async (req) =>
        service[action](account(req), bucket(req), body(req) as never),
      ),
    );
  }

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/share:
   *   post:
   *     summary: Make a temporary link to an object
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               key:
   *                 type: string
   *               seconds:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The link and when it stops working
   */
  router.post(
    `${base}/share`,
    edit,
    handle(async (req) =>
      service.share(
        account(req),
        bucket(req),
        body(req).key,
        body(req).seconds,
        req,
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/settings:
   *   get:
   *     summary: Read versioning, lifecycle, CORS, policy, tags, encryption and public access
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The settings, each marked supported or not
   */
  router.get(
    `${base}/settings`,
    manage,
    handle(async (req) => service.settings(account(req), bucket(req))),
  );

  /**
   * @openapi
   * /plugin-api/object-storage/accounts/{accountId}/buckets/{bucket}/settings/{kind}:
   *   put:
   *     summary: Save one bucket setting. An empty list removes it.
   *     tags:
   *       - Object Storage
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: bucket
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: kind
   *         required: true
   *         schema:
   *           type: string
   *           enum: [versioning, lifecycle, cors, policy, tags, encryption, publicAccess]
   *     responses:
   *       200:
   *         description: Saved
   *       400:
   *         description: Unknown setting or invalid value
   */
  router.put(
    `${base}/settings/:kind`,
    manage,
    handle(async (req) => {
      const kind = String(req.params.kind) as SettingKind;
      if (!SETTING_KINDS.includes(kind)) {
        throw new StorageError(400, "Unknown setting");
      }
      return service.saveSetting(account(req), bucket(req), kind, body(req));
    }),
  );
}
