import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { WireguardError } from "./errors.js";
import type { InterfaceManager } from "./interfaces.js";
import { SERVICE_ACTIONS, type WireguardService } from "./service.js";
import type {
  CreateInterfaceBody,
  UpdateInterfaceBody,
} from "../shared/types.js";

export interface Deps {
  service: WireguardService;
  interfaces: InterfaceManager;
}

type Level = "connect" | "edit";

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof WireguardError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(
    `WireGuard request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  res.status(500).json({ error: "Something went wrong" });
}

/**
 * Mounts the WireGuard routes on the plugin's router, which core serves at
 * /plugin-api/wireguard with auth and the wireguard.use permission in front.
 * Reads need connect access to the host, changes need edit access.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { service, interfaces } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  async function gate(hostId: number, level: Level): Promise<void> {
    if (!Number.isInteger(hostId) || hostId < 1) {
      throw new WireguardError("The host id is not valid");
    }
    if ((await ctx.hosts.checkAccess(hostId, level)).hasAccess) return;
    if (
      level === "edit" &&
      (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
    ) {
      throw new WireguardError("You need edit access to this host", 403, {
        code: "HOST_EDIT_REQUIRED",
      });
    }
    throw new WireguardError("Host not found", 404);
  }

  const read =
    (run: (hostId: number, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const hostId = Number(req.params.hostId);
        await gate(hostId, "connect");
        res.json(await run(hostId, req));
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  /** A change, or a read of secrets: needs edit access and is audited. */
  const write =
    (
      action: string,
      run: (hostId: number, req: Request) => Promise<unknown>,
      target?: (req: Request) => string | undefined,
    ) =>
    async (req: Request, res: Response) => {
      const hostId = Number(req.params.hostId);
      const name = target?.(req);
      try {
        await gate(hostId, "edit");
        const result = await run(hostId, req);
        void ctx.audit.record({
          action: `wireguard.${action}`,
          resourceType: "host",
          resourceId: String(hostId),
          resourceName: name,
          success: true,
        });
        res.json(result ?? { ok: true });
      } catch (error) {
        void ctx.audit.record({
          action: `wireguard.${action}`,
          resourceType: "host",
          resourceId: String(hostId),
          resourceName: name,
          success: false,
          errorMessage: error instanceof Error ? error.message : undefined,
        });
        fail(ctx, res, error);
      }
    };

  const param = (req: Request, key: string) => String(req.params[key] ?? "");
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const target = (req: Request) =>
    [param(req, "iface"), req.params.name].filter(Boolean).join("/");

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/status:
   *   get:
   *     summary: WireGuard status on a host
   *     description: Reports whether WireGuard is installed, the package manager, firewall, IP forwarding and whether root or passwordless sudo is available.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The WireGuard status.
   */
  router.get(
    "/:hostId/status",
    read((hostId) => service.status(hostId)),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/install:
   *   post:
   *     summary: Install WireGuard
   *     description: Installs the WireGuard tools with the host's package manager.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: WireGuard is installed.
   */
  router.post(
    "/:hostId/install",
    write("install", (hostId) => service.install(hostId)),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/logs:
   *   get:
   *     summary: WireGuard logs
   *     description: Returns the latest journal lines of the wg-quick units.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: lines
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The log text.
   */
  router.get(
    "/:hostId/logs",
    read(async (hostId, req) => ({
      text: await service.logs(hostId, Number(req.query.lines)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces:
   *   get:
   *     summary: List interfaces
   *     description: Lists the WireGuard interfaces on the host, except the ones the Tunnels plugin owns.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: A list of interfaces.
   */
  router.get(
    "/:hostId/interfaces",
    read((hostId) => interfaces.list(hostId)),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces:
   *   post:
   *     summary: Create an interface
   *     description: Makes a server interface with new keys, and can set up NAT, IP forwarding and the firewall port.
   *     tags:
   *       - WireGuard
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
   *             required: [name, address, listenPort]
   *             properties:
   *               name:
   *                 type: string
   *               address:
   *                 type: string
   *               listenPort:
   *                 type: integer
   *               endpoint:
   *                 type: string
   *               dns:
   *                 type: string
   *               allowedIps:
   *                 type: string
   *               keepalive:
   *                 type: integer
   *               nat:
   *                 type: boolean
   *               forwarding:
   *                 type: boolean
   *               openFirewall:
   *                 type: boolean
   *               start:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The interface was created.
   */
  router.post(
    "/:hostId/interfaces",
    write(
      "interface.create",
      async (hostId, req) => {
        await interfaces.create(
          hostId,
          body(req) as unknown as CreateInterfaceBody,
        );
      },
      (req) => String(body(req).name ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}:
   *   put:
   *     summary: Update an interface
   *     description: Changes the listen port and the defaults used for new clients.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [listenPort]
   *             properties:
   *               listenPort:
   *                 type: integer
   *               endpoint:
   *                 type: string
   *               dns:
   *                 type: string
   *               allowedIps:
   *                 type: string
   *               keepalive:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The interface was updated.
   */
  router.put(
    "/:hostId/interfaces/:iface",
    write(
      "interface.update",
      async (hostId, req) => {
        await interfaces.update(
          hostId,
          param(req, "iface"),
          body(req) as unknown as UpdateInterfaceBody,
        );
      },
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}:
   *   delete:
   *     summary: Delete an interface
   *     description: Stops the interface and removes its config, keys and saved client files from the host.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The interface was deleted.
   */
  router.delete(
    "/:hostId/interfaces/:iface",
    write(
      "interface.delete",
      (hostId, req) => interfaces.remove(hostId, param(req, "iface")),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/service/{action}:
   *   post:
   *     summary: Control an interface
   *     description: Starts, stops, restarts, enables or disables the wg-quick unit of an interface.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *           enum: [start, stop, restart, enable, disable]
   *     responses:
   *       200:
   *         description: The action ran.
   */
  router.post(
    "/:hostId/interfaces/:iface/service/:action",
    write(
      "service",
      async (hostId, req) => {
        const action = param(req, "action");
        if (!(SERVICE_ACTIONS as readonly string[]).includes(action)) {
          throw new WireguardError("Unknown action");
        }
        await service.act(
          hostId,
          param(req, "iface"),
          action as (typeof SERVICE_ACTIONS)[number],
        );
      },
      (req) => `${param(req, "iface")}/${param(req, "action")}`,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/config:
   *   get:
   *     summary: Read an interface config
   *     description: Returns the raw config. Private and preshared keys are hidden.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The config text.
   */
  router.get(
    "/:hostId/interfaces/:iface/config",
    read((hostId, req) => interfaces.readConfig(hostId, param(req, "iface"))),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/config:
   *   put:
   *     summary: Save an interface config
   *     description: Checks the config with wg-quick on a copy, keeps a backup, saves it and applies peer changes to a running interface.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: The config was saved.
   */
  router.put(
    "/:hostId/interfaces/:iface/config",
    write(
      "config",
      async (hostId, req) => {
        await interfaces.writeConfig(
          hostId,
          param(req, "iface"),
          body(req).text as string,
        );
      },
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients:
   *   get:
   *     summary: List clients
   *     description: Lists the peers of an interface with their live handshake and traffic.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: A list of clients.
   */
  router.get(
    "/:hostId/interfaces/:iface/clients",
    read((hostId, req) => interfaces.clients(hostId, param(req, "iface"))),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients:
   *   post:
   *     summary: Add a client
   *     description: Makes keys on the host, picks a free address, adds the peer and returns the client config.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
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
   *               allowedIps:
   *                 type: string
   *     responses:
   *       200:
   *         description: The new client and its config.
   */
  router.post(
    "/:hostId/interfaces/:iface/clients",
    write(
      "client.add",
      (hostId, req) =>
        interfaces.addClient(hostId, param(req, "iface"), {
          name: String(body(req).name ?? ""),
          allowedIps:
            typeof body(req).allowedIps === "string"
              ? (body(req).allowedIps as string)
              : undefined,
        }),
      (req) => `${param(req, "iface")}/${String(body(req).name ?? "")}`,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients/{name}:
   *   delete:
   *     summary: Remove a client
   *     description: Removes the peer and its saved config file.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The client was removed.
   */
  router.delete(
    "/:hostId/interfaces/:iface/clients/:name",
    write(
      "client.remove",
      (hostId, req) =>
        interfaces.removeClient(
          hostId,
          param(req, "iface"),
          param(req, "name"),
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients/{name}/state:
   *   post:
   *     summary: Turn a client on or off
   *     description: Comments the peer out of the config, or brings it back, and applies it.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
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
   *             required: [enabled]
   *             properties:
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The state was changed.
   */
  router.post(
    "/:hostId/interfaces/:iface/clients/:name/state",
    write(
      "client.state",
      (hostId, req) =>
        interfaces.setClientEnabled(
          hostId,
          param(req, "iface"),
          param(req, "name"),
          body(req).enabled === true,
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients/{name}/rotate:
   *   post:
   *     summary: Give a client new keys
   *     description: Makes new keys for a client made here, keeps its address and returns the new config.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The client and its new config.
   */
  router.post(
    "/:hostId/interfaces/:iface/clients/:name/rotate",
    write(
      "client.rotate",
      (hostId, req) =>
        interfaces.rotateClient(
          hostId,
          param(req, "iface"),
          param(req, "name"),
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/wireguard/{hostId}/interfaces/{iface}/clients/{name}/config:
   *   get:
   *     summary: Get a client config
   *     description: Returns the saved client config, which holds the client's private key. Needs edit access and is audited.
   *     tags:
   *       - WireGuard
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: iface
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The client config.
   */
  router.get(
    "/:hostId/interfaces/:iface/clients/:name/config",
    write(
      "client.config",
      (hostId, req) =>
        interfaces.clientConfig(
          hostId,
          param(req, "iface"),
          param(req, "name"),
        ),
      target,
    ),
  );
}
