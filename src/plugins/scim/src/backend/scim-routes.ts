import type { NextFunction, Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { ScimError } from "./scim/errors.js";
import {
  listResponse,
  resourceTypes,
  schemas,
  serviceProviderConfig,
} from "./scim/resources.js";
import type { Service, Request as ScimRequest } from "./service.js";
import type { ConnectionRow, Store } from "./store.js";
import { bearerToken, createFailureLimiter, tokenMatches } from "./token.js";

const SCIM_TYPE = "application/scim+json";
const BASE = "/v2/:connection";

/** Every path the identity provider calls. All are public and check a token. */
export const SCIM_PATHS = [
  `${BASE}/ServiceProviderConfig`,
  `${BASE}/ResourceTypes`,
  `${BASE}/ResourceTypes/:id`,
  `${BASE}/Schemas`,
  `${BASE}/Schemas/:id`,
  `${BASE}/Users`,
  `${BASE}/Users/:id`,
  `${BASE}/Groups`,
  `${BASE}/Groups/:id`,
];

type Locals = { scim: ScimRequest };

function send(res: Response, status: number, body?: unknown) {
  res.status(status).setHeader("Cache-Control", "no-store");
  if (body === undefined) {
    res.end();
    return;
  }
  res.type(SCIM_TYPE).send(JSON.stringify(body));
}

function sendError(res: Response, error: ScimError) {
  send(res, error.status, error.toJSON());
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}

export function connectionBaseUrl(
  ctx: PluginContext,
  req: unknown,
  publicId: string,
): string {
  return `${ctx.http.baseUrl(req)}/plugin-api/${ctx.manifest.id}/v2/${publicId}`;
}

export function registerScimRoutes(deps: {
  router: Router;
  ctx: PluginContext;
  store: Store;
  service: () => Service | null;
  docsUrl: string;
}): void {
  const { router, ctx, store, service, docsUrl } = deps;
  const limiter = createFailureLimiter();

  async function authenticate(
    req: Request,
    res: Response,
  ): Promise<ScimRequest | null> {
    const publicId = param(req, "connection");
    const key = `${req.ip ?? ""}|${publicId}`;
    if (limiter.locked(key)) {
      sendError(
        res,
        new ScimError(429, "Too many failed attempts, try again later"),
      );
      return null;
    }
    const connection: ConnectionRow | null = publicId
      ? await store.connections.byPublicId(publicId)
      : null;
    const token = bearerToken(req.headers.authorization);
    if (
      !connection ||
      !connection.enabled ||
      !token ||
      !tokenMatches(token, connection.tokenHash)
    ) {
      limiter.fail(key);
      res.setHeader("WWW-Authenticate", 'Bearer realm="Termix SCIM"');
      sendError(res, new ScimError(401, "Bad or missing bearer token"));
      return null;
    }
    limiter.clear(key);
    void store.connections.touch(connection.id).catch(() => undefined);
    return {
      connection,
      baseUrl: connectionBaseUrl(ctx, req, connection.publicId),
    };
  }

  /** Runs a handler behind the token check with SCIM error answers. */
  function handle(
    run: (req: Request, res: Response, scim: ScimRequest) => Promise<void>,
    needsUsers = true,
  ) {
    return async (req: Request, res: Response, _next: NextFunction) => {
      try {
        const scim = await authenticate(req, res);
        if (!scim) return;
        (res.locals as Locals).scim = scim;
        if (needsUsers && !service()) {
          sendError(
            res,
            new ScimError(
              503,
              "This Termix version cannot manage accounts yet. Update Termix.",
            ),
          );
          return;
        }
        await run(req, res, scim);
      } catch (error) {
        if (error instanceof ScimError) {
          sendError(res, error);
          return;
        }
        ctx.log.error(
          "SCIM request failed",
          error instanceof Error ? error : new Error(String(error)),
        );
        sendError(res, new ScimError(500, "Internal error"));
      }
    };
  }

  const svc = () => service()!;
  const query = (req: Request) => req.query as Record<string, unknown>;

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/ServiceProviderConfig:
   *   get:
   *     summary: SCIM service provider config
   *     description: What this SCIM server supports. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: The config.
   *       401:
   *         description: Bad or missing token.
   */
  router.get(
    `${BASE}/ServiceProviderConfig`,
    handle(
      async (_req, res, scim) =>
        send(res, 200, serviceProviderConfig(scim.baseUrl, docsUrl)),
      false,
    ),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/ResourceTypes:
   *   get:
   *     summary: SCIM resource types
   *     description: The User and Group resource types. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Resource types.
   *       401:
   *         description: Bad or missing token.
   */
  router.get(
    `${BASE}/ResourceTypes`,
    handle(async (_req, res, scim) => {
      const types = resourceTypes(scim.baseUrl);
      send(res, 200, listResponse(types, types.length, 1));
    }, false),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/ResourceTypes/{id}:
   *   get:
   *     summary: One SCIM resource type
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The resource type.
   *       404:
   *         description: No such type.
   */
  router.get(
    `${BASE}/ResourceTypes/:id`,
    handle(async (req, res, scim) => {
      const found = resourceTypes(scim.baseUrl).find(
        (type) => type.id === param(req, "id"),
      );
      if (!found) throw new ScimError(404, "Resource type not found");
      send(res, 200, found);
    }, false),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Schemas:
   *   get:
   *     summary: SCIM schemas
   *     description: The User, Enterprise User and Group schemas. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Schemas.
   *       401:
   *         description: Bad or missing token.
   */
  router.get(
    `${BASE}/Schemas`,
    handle(async (_req, res, scim) => {
      const list = schemas(scim.baseUrl);
      send(res, 200, listResponse(list, list.length, 1));
    }, false),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Schemas/{id}:
   *   get:
   *     summary: One SCIM schema
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The schema.
   *       404:
   *         description: No such schema.
   */
  router.get(
    `${BASE}/Schemas/:id`,
    handle(async (req, res, scim) => {
      const found = schemas(scim.baseUrl).find(
        (schema) => schema.id === param(req, "id"),
      );
      if (!found) throw new ScimError(404, "Schema not found");
      send(res, 200, found);
    }, false),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Users:
   *   get:
   *     summary: List SCIM users
   *     description: Users this connection manages, with filter, startIndex and count. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: A list response.
   *       400:
   *         description: Bad filter.
   *   post:
   *     summary: Create a SCIM user
   *     description: Creates a Termix account, or takes over an existing one when the connection allows it. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       201:
   *         description: The new user.
   *       409:
   *         description: The userName, externalId or email is taken.
   */
  router.get(
    `${BASE}/Users`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().listUsers(scim, query(req))),
    ),
  );
  router.post(
    `${BASE}/Users`,
    handle(async (req, res, scim) => {
      const user = await svc().createUser(scim, req.body);
      res.setHeader(
        "Location",
        String((user.meta as { location: string }).location),
      );
      send(res, 201, user);
    }),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Users/{id}:
   *   get:
   *     summary: Get a SCIM user
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The user.
   *       404:
   *         description: Not a user of this connection.
   *   put:
   *     summary: Replace a SCIM user
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The user.
   *   patch:
   *     summary: Change a SCIM user
   *     description: Setting active to false turns the Termix account off and ends its sessions. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The user.
   *   delete:
   *     summary: Delete a SCIM user
   *     description: Turns the account off, or deletes it when the connection is set to. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       204:
   *         description: Done.
   */
  router.get(
    `${BASE}/Users/:id`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().getUser(scim, param(req, "id"), query(req))),
    ),
  );
  router.put(
    `${BASE}/Users/:id`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().replaceUser(scim, param(req, "id"), req.body)),
    ),
  );
  router.patch(
    `${BASE}/Users/:id`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().patchUser(scim, param(req, "id"), req.body)),
    ),
  );
  router.delete(
    `${BASE}/Users/:id`,
    handle(async (req, res, scim) => {
      await svc().deleteUser(scim, param(req, "id"));
      send(res, 204);
    }),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Groups:
   *   get:
   *     summary: List SCIM groups
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: A list response.
   *   post:
   *     summary: Create a SCIM group
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       201:
   *         description: The new group.
   *       409:
   *         description: The displayName is taken.
   */
  router.get(
    `${BASE}/Groups`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().listGroups(scim, query(req))),
    ),
  );
  router.post(
    `${BASE}/Groups`,
    handle(async (req, res, scim) => {
      const group = await svc().createGroup(scim, req.body);
      res.setHeader(
        "Location",
        String((group.meta as { location: string }).location),
      );
      send(res, 201, group);
    }),
  );

  /**
   * @openapi
   * /plugin-api/scim/v2/{connection}/Groups/{id}:
   *   get:
   *     summary: Get a SCIM group
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The group.
   *   put:
   *     summary: Replace a SCIM group
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The group.
   *   patch:
   *     summary: Change a SCIM group
   *     description: Adds and removes members. Members of a group mapped to a role get or lose that role. Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       204:
   *         description: Done.
   *   delete:
   *     summary: Delete a SCIM group
   *     description: Needs the connection's bearer token.
   *     tags:
   *       - SCIM
   *     responses:
   *       204:
   *         description: Done.
   */
  router.get(
    `${BASE}/Groups/:id`,
    handle(async (req, res, scim) =>
      send(res, 200, await svc().getGroup(scim, param(req, "id"), query(req))),
    ),
  );
  router.put(
    `${BASE}/Groups/:id`,
    handle(async (req, res, scim) =>
      send(
        res,
        200,
        await svc().replaceGroup(scim, param(req, "id"), req.body),
      ),
    ),
  );
  router.patch(
    `${BASE}/Groups/:id`,
    handle(async (req, res, scim) => {
      const group = await svc().patchGroup(
        scim,
        param(req, "id"),
        req.body,
        query(req),
      );
      if (group) send(res, 200, group);
      else send(res, 204);
    }),
  );
  router.delete(
    `${BASE}/Groups/:id`,
    handle(async (req, res, scim) => {
      await svc().deleteGroup(scim, param(req, "id"));
      send(res, 204);
    }),
  );
}
