import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CreateUserBody, UpdateUserBody } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import type { UserService } from "./service.js";

/**
 * Mounts the Users routes, served at /plugin-api/user-manager with auth and
 * the user-manager.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: UserService,
): void {
  const { read, write, canEdit } = createHttp(router, ctx);
  const name = (req: Request) => String(req.params.name ?? "");

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/status:
   *   get:
   *     summary: User management status on a host
   *     description: The login user, whether root or passwordless sudo works, the sudo group, the allowed shells and whether useradd is installed.
   *     tags:
   *       - Users
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
   * /plugin-api/user-manager/{hostId}/users:
   *   get:
   *     summary: Users and groups
   *     description: Every account and group. Password state needs root or passwordless sudo, otherwise it is unknown.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The users and groups.
   */
  router.get(
    "/:hostId/users",
    read(async (hostId, _req, s) => service.list(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}:
   *   get:
   *     summary: Last login and SSH keys of a user
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The last login and the keys in authorized_keys.
   */
  router.get(
    "/:hostId/users/:name",
    read(async (hostId, req, s) => service.detail(hostId, s, name(req))),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users:
   *   post:
   *     summary: Create a user
   *     description: Runs useradd as root. The password is sent to chpasswd on stdin, never on the command line.
   *     tags:
   *       - Users
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
   *             required: [name]
   *             properties:
   *               name:
   *                 type: string
   *               comment:
   *                 type: string
   *               shell:
   *                 type: string
   *               home:
   *                 type: string
   *               createHome:
   *                 type: boolean
   *               groups:
   *                 type: array
   *                 items:
   *                   type: string
   *               sudo:
   *                 type: boolean
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Created.
   */
  router.post(
    "/:hostId/users",
    write(
      "create",
      async (hostId, req, s) => {
        await service.create(hostId, s, body(req) as unknown as CreateUserBody);
        return { ok: true };
      },
      (req) => str(body(req).name),
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}:
   *   put:
   *     summary: Change a user's full name, shell or groups
   *     description: groups replaces the whole list of extra groups.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.put(
    "/:hostId/users/:name",
    write(
      "update",
      async (hostId, req, s) => {
        await service.update(
          hostId,
          s,
          name(req),
          body(req) as unknown as UpdateUserBody,
        );
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/password:
   *   post:
   *     summary: Set a user's password
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [password]
   *             properties:
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/users/:name/password",
    write(
      "password",
      async (hostId, req, s) => {
        await service.setPassword(hostId, s, name(req), body(req).password);
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/lock:
   *   post:
   *     summary: Lock or unlock an account
   *     description: Locking turns off the password and expires the account, so SSH keys stop working too. Refused for root and the login user.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               locked:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/users/:name/lock",
    write(
      "lock",
      async (hostId, req, s) => {
        await service.lock(hostId, s, name(req), body(req).locked === true);
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/expire-password:
   *   post:
   *     summary: Make a user pick a new password at the next login
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/users/:name/expire-password",
    write(
      "expire-password",
      async (hostId, req, s) => {
        await service.expirePassword(hostId, s, name(req));
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/sudo:
   *   post:
   *     summary: Give or take sudo rights
   *     description: Adds the user to the sudo or wheel group, or removes them.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               sudo:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/users/:name/sudo",
    write(
      "sudo",
      async (hostId, req, s) => {
        await service.setSudo(hostId, s, name(req), body(req).sudo === true);
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}:
   *   delete:
   *     summary: Delete a user
   *     description: Refused for root and the login user. removeHome=1 also deletes the home folder.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: removeHome
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/:hostId/users/:name",
    write(
      "delete",
      async (hostId, req, s) => {
        await service.remove(
          hostId,
          s,
          name(req),
          req.query.removeHome === "1",
        );
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/keys:
   *   post:
   *     summary: Add an SSH key to a user
   *     description: Appends one public key to ~/.ssh/authorized_keys, owned by the user with mode 600.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [key]
   *             properties:
   *               key:
   *                 type: string
   *     responses:
   *       200:
   *         description: The keys after the change.
   */
  router.post(
    "/:hostId/users/:name/keys",
    write(
      "key.add",
      async (hostId, req, s) =>
        service.addKey(hostId, s, name(req), body(req).key),
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/users/{name}/keys/{line}:
   *   delete:
   *     summary: Remove an SSH key from a user
   *     description: fingerprint must match the key on that line, so a key that moved is never removed by mistake.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: line
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: fingerprint
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The keys after the change.
   *       409:
   *         description: The keys changed since they were read.
   */
  router.delete(
    "/:hostId/users/:name/keys/:line",
    write(
      "key.remove",
      async (hostId, req, s) =>
        service.removeKey(
          hostId,
          s,
          name(req),
          Number(req.params.line),
          str(req.query.fingerprint),
        ),
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/sessions:
   *   get:
   *     summary: Who is logged in
   *     description: Current sessions from who and recent logins from last.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The sessions.
   */
  router.get(
    "/:hostId/sessions",
    read(async (hostId, _req, s) => service.sessions(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/groups:
   *   post:
   *     summary: Create a group
   *     tags:
   *       - Users
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
   *             required: [name]
   *             properties:
   *               name:
   *                 type: string
   *     responses:
   *       200:
   *         description: Created.
   */
  router.post(
    "/:hostId/groups",
    write(
      "group.create",
      async (hostId, req, s) => {
        await service.createGroup(hostId, s, str(body(req).name));
        return { ok: true };
      },
      (req) => str(body(req).name),
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/groups/{name}:
   *   delete:
   *     summary: Delete a group
   *     description: Refused while it is a user's main group.
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/:hostId/groups/:name",
    write(
      "group.delete",
      async (hostId, req, s) => {
        await service.deleteGroup(hostId, s, name(req));
        return { ok: true };
      },
      name,
    ),
  );

  /**
   * @openapi
   * /plugin-api/user-manager/{hostId}/groups/{name}/members:
   *   post:
   *     summary: Add a user to a group or remove them
   *     tags:
   *       - Users
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [user]
   *             properties:
   *               user:
   *                 type: string
   *               member:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/groups/:name/members",
    write(
      "group.member",
      async (hostId, req, s) => {
        await service.setMember(
          hostId,
          s,
          name(req),
          body(req).user as string,
          body(req).member !== false,
        );
        return { ok: true };
      },
      (req) => `${name(req)}/${str(body(req).user)}`,
    ),
  );
}
