import { randomUUID } from "node:crypto";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { connectionBaseUrl } from "./scim-routes.js";
import { parseRoleList, type Service } from "./service.js";
import type { ConnectionRow, Store } from "./store.js";
import type { UsersApi } from "./termix-users.js";
import { hashToken, newToken } from "./token.js";

const MAX_NAME = 100;

function fail(
  ctx: PluginContext,
  res: Response,
  message: string,
  error: unknown,
) {
  ctx.log.error(
    message,
    error instanceof Error ? error : new Error(String(error)),
  );
  res.status(500).json({ error: message });
}

function idParam(req: Request, name = "id"): number | null {
  const value = Number(req.params[name]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

interface ConnectionInput {
  name?: unknown;
  enabled?: unknown;
  onDelete?: unknown;
  adoptExisting?: unknown;
  allowAdmin?: unknown;
  defaultRoles?: unknown;
}

function readInput(
  body: ConnectionInput,
  partial: boolean,
): Partial<ConnectionRow> | string {
  const out: Partial<ConnectionRow> = {};
  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return "A name is required";
    out.name = name.slice(0, MAX_NAME);
  }
  if (body.enabled !== undefined) out.enabled = body.enabled === true;
  if (body.onDelete !== undefined) {
    if (body.onDelete !== "disable" && body.onDelete !== "delete")
      return "onDelete must be disable or delete";
    out.onDelete = body.onDelete;
  }
  if (body.adoptExisting !== undefined)
    out.adoptExisting = body.adoptExisting === true;
  if (body.allowAdmin !== undefined) out.allowAdmin = body.allowAdmin === true;
  if (body.defaultRoles !== undefined) {
    if (typeof body.defaultRoles !== "string")
      return "defaultRoles must be text";
    out.defaultRoles = parseRoleList(body.defaultRoles).join(", ");
  }
  return out;
}

export function registerAdminRoutes(deps: {
  router: Router;
  ctx: PluginContext;
  store: Store;
  service: () => Service | null;
  users: () => UsersApi | null;
}): void {
  const { router, ctx, store, service, users } = deps;
  const manage = ctx.rbac.require("manage") as never;

  async function present(req: Request, row: ConnectionRow) {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      onDelete: row.onDelete,
      adoptExisting: row.adoptExisting,
      allowAdmin: row.allowAdmin,
      defaultRoles: row.defaultRoles,
      lastRequestAt: row.lastRequestAt,
      baseUrl: connectionBaseUrl(ctx, req, row.publicId),
      userCount: await store.users.count(row.id),
      groupCount: (await store.groups.list(row.id)).length,
    };
  }

  async function findConnection(
    req: Request,
    res: Response,
  ): Promise<ConnectionRow | null> {
    const id = idParam(req);
    const row = id ? await store.connections.byId(id) : null;
    if (!row) res.status(404).json({ error: "Connection not found" });
    return row;
  }

  /**
   * @openapi
   * /plugin-api/scim/connections:
   *   get:
   *     summary: List SCIM connections
   *     description: Every identity provider connection with its SCIM base URL. Tokens are never sent. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Connections.
   *       403:
   *         description: Missing permission.
   */
  router.get("/connections", manage, async (req: Request, res: Response) => {
    try {
      const rows = await store.connections.list();
      res.json({
        supported: !!users(),
        connections: await Promise.all(rows.map((row) => present(req, row))),
      });
    } catch (error) {
      fail(ctx, res, "Failed to list SCIM connections", error);
    }
  });

  /**
   * @openapi
   * /plugin-api/scim/connections:
   *   post:
   *     summary: Add a SCIM connection
   *     description: Makes a connection and answers with its bearer token. The token is shown only this once. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               onDelete:
   *                 type: string
   *                 enum: [disable, delete]
   *               adoptExisting:
   *                 type: boolean
   *               allowAdmin:
   *                 type: boolean
   *               defaultRoles:
   *                 type: string
   *     responses:
   *       201:
   *         description: The connection and its token.
   *       400:
   *         description: Bad input.
   *       403:
   *         description: Missing permission.
   */
  router.post("/connections", manage, async (req: Request, res: Response) => {
    try {
      const input = readInput(req.body ?? {}, false);
      if (typeof input === "string") {
        res.status(400).json({ error: input });
        return;
      }
      const token = newToken();
      const row = await store.connections.create({
        publicId: randomUUID(),
        name: input.name!,
        enabled: input.enabled ?? true,
        tokenHash: hashToken(token),
        onDelete: input.onDelete ?? "disable",
        adoptExisting: input.adoptExisting ?? false,
        allowAdmin: input.allowAdmin ?? false,
        defaultRoles: input.defaultRoles ?? "",
      });
      res.status(201).json({ connection: await present(req, row), token });
    } catch (error) {
      fail(ctx, res, "Failed to add the SCIM connection", error);
    }
  });

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}:
   *   put:
   *     summary: Change a SCIM connection
   *     description: Changing default roles or the admin switch syncs the roles of every user of the connection. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The connection.
   *       404:
   *         description: No such connection.
   */
  router.put(
    "/connections/:id",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        const input = readInput(req.body ?? {}, true);
        if (typeof input === "string") {
          res.status(400).json({ error: input });
          return;
        }
        const updated = (await store.connections.update(row.id, input))!;
        const oldRoles = parseRoleList(row.defaultRoles);
        const rolesChanged =
          updated.defaultRoles !== row.defaultRoles ||
          updated.allowAdmin !== row.allowAdmin;
        const svc = service();
        if (rolesChanged && svc) {
          await svc.resyncConnection(
            updated,
            row.allowAdmin ? [...oldRoles, "admin"] : oldRoles,
          );
        }
        res.json({ connection: await present(req, updated) });
      } catch (error) {
        fail(ctx, res, "Failed to save the SCIM connection", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}/token:
   *   post:
   *     summary: Make a new SCIM token
   *     description: The old token stops working at once. The new one is shown only this once. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: The new token.
   *       404:
   *         description: No such connection.
   */
  router.post(
    "/connections/:id/token",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        const token = newToken();
        await store.connections.update(row.id, { tokenHash: hashToken(token) });
        res.json({ token });
      } catch (error) {
        fail(ctx, res, "Failed to make a new SCIM token", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}:
   *   delete:
   *     summary: Remove a SCIM connection
   *     description: The accounts it made stay in Termix. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Removed.
   *       404:
   *         description: No such connection.
   */
  router.delete(
    "/connections/:id",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        await store.connections.remove(row.id);
        res.json({ ok: true });
      } catch (error) {
        fail(ctx, res, "Failed to remove the SCIM connection", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}/groups:
   *   get:
   *     summary: List a connection's groups
   *     description: Groups the identity provider pushed, with the role each one gives. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Groups.
   *       404:
   *         description: No such connection.
   */
  router.get(
    "/connections/:id/groups",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        const groups = await store.groups.list(row.id);
        res.json({
          groups: await Promise.all(
            groups.map(async (group) => ({
              id: group.id,
              displayName: group.displayName,
              roleName: group.roleName,
              memberCount: (await store.members.ofGroup(group.id)).length,
            })),
          ),
        });
      } catch (error) {
        fail(ctx, res, "Failed to list SCIM groups", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}/groups/{groupId}:
   *   put:
   *     summary: Map a group to a role
   *     description: Members get the role, and lose it when they leave the group. Send roleName null to clear it. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               roleName:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       200:
   *         description: Saved.
   *       400:
   *         description: Unknown role.
   *       404:
   *         description: No such group.
   */
  router.put(
    "/connections/:id/groups/:groupId",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        const groupId = idParam(req, "groupId");
        const group = groupId ? await store.groups.byId(groupId) : null;
        if (!group || group.connectionId !== row.id) {
          res.status(404).json({ error: "Group not found" });
          return;
        }
        const svc = service();
        const api = users();
        if (!svc || !api) {
          res
            .status(409)
            .json({ error: "This Termix version cannot manage accounts yet" });
          return;
        }
        const raw = (req.body ?? {}).roleName;
        const roleName =
          typeof raw === "string" && raw.trim() ? raw.trim() : null;
        if (roleName) {
          if (roleName === "admin" && !row.allowAdmin) {
            res
              .status(400)
              .json({ error: "Turn on letting groups make admins first" });
            return;
          }
          const roles = await api.listRoles();
          if (
            !roles.some((role) => role.name === roleName) ||
            roleName === "user"
          ) {
            res.status(400).json({ error: "Unknown role" });
            return;
          }
        }
        await svc.setGroupRole(row, group, roleName);
        res.json({ ok: true });
      } catch (error) {
        fail(ctx, res, "Failed to save the group role", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/connections/{id}/events:
   *   get:
   *     summary: Recent SCIM requests
   *     description: The last changes the identity provider made through this connection. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Events, newest first.
   */
  router.get(
    "/connections/:id/events",
    manage,
    async (req: Request, res: Response) => {
      try {
        const row = await findConnection(req, res);
        if (!row) return;
        res.json({ events: await store.events.list(row.id) });
      } catch (error) {
        fail(ctx, res, "Failed to list SCIM events", error);
      }
    },
  );

  /**
   * @openapi
   * /plugin-api/scim/roles:
   *   get:
   *     summary: Roles a group can map to
   *     description: Termix roles, without the built in user role. Needs scim.manage.
   *     tags:
   *       - SCIM
   *     responses:
   *       200:
   *         description: Roles.
   */
  router.get("/roles", manage, async (_req: Request, res: Response) => {
    try {
      const api = users();
      const roles = api ? await api.listRoles() : [];
      res.json({ roles: roles.filter((role) => role.name !== "user") });
    } catch (error) {
      fail(ctx, res, "Failed to list roles", error);
    }
  });
}
