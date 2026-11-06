import type { Request, RequestHandler, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { drivers, DriverError } from "./drivers/index.js";
import { ServiceError, type Service } from "./service.js";

function fail(res: Response, error: unknown) {
  if (error instanceof ServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof DriverError) {
    return res.status(502).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ error: message });
}

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Turns thrown errors into JSON, so one bad device never trips the plugin's error limit. */
function safe(handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      fail(res, error);
    }
  };
}

function deviceId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new ServiceError("Bad id");
  return id;
}

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: Service,
): void {
  const view = ctx.rbac.require("view") as never;
  const manage = ctx.rbac.require("manage") as never;
  const actor = () => ctx.currentActor() as string;

  /**
   * @openapi
   * /plugin-api/network-devices/drivers:
   *   get:
   *     summary: List the device types and the keys each one needs
   *     tags:
   *       - Network Devices
   *     responses:
   *       200:
   *         description: The device types
   */
  router.get("/drivers", view, (_req, res) => {
    res.json({ drivers: Object.values(drivers).map((driver) => driver.info) });
  });

  /**
   * @openapi
   * /plugin-api/network-devices/devices:
   *   get:
   *     summary: List devices with their last reading
   *     tags:
   *       - Network Devices
   *     responses:
   *       200:
   *         description: The devices. Keys are never included.
   */
  router.get(
    "/devices",
    view,
    safe(async (_req, res) => {
      res.json({ devices: await service.list() });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices:
   *   post:
   *     summary: Add a device
   *     tags:
   *       - Network Devices
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: The new device
   *       400:
   *         description: Missing or wrong fields
   *       409:
   *         description: The name is taken
   */
  router.post(
    "/devices",
    manage,
    safe(async (req, res) => {
      const device = await service.create(req.body ?? {}, actor());
      res.status(201).json({ device });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/test:
   *   post:
   *     summary: Try a device's address and keys without saving it
   *     tags:
   *       - Network Devices
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: What the device reported
   *       502:
   *         description: The device did not answer or refused the keys
   */
  router.post(
    "/devices/test",
    manage,
    safe(async (req, res) => {
      res.json({ info: await service.test(req.body ?? {}) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}:
   *   put:
   *     summary: Change a device. Keys are replaced only when sent.
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: The device
   *       404:
   *         description: No such device
   */
  router.put(
    "/devices/:id",
    manage,
    safe(async (req, res) => {
      res.json({ device: await service.update(deviceId(req), req.body ?? {}) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}:
   *   delete:
   *     summary: Remove a device
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Removed
   *       404:
   *         description: No such device
   */
  router.delete(
    "/devices/:id",
    manage,
    safe(async (req, res) => {
      await service.remove(deviceId(req));
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/poll:
   *   post:
   *     summary: Read the device now
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The device with its new reading
   *       404:
   *         description: No such device
   */
  router.post(
    "/devices/:id/poll",
    view,
    safe(async (req, res) => {
      res.json({ device: await service.poll(deviceId(req)) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/clients:
   *   get:
   *     summary: Clients the device knows about
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Clients from DHCP, ARP, Wi-Fi or the MAC table
   *       502:
   *         description: The device did not answer
   */
  router.get(
    "/devices/:id/clients",
    view,
    safe(async (req, res) => {
      res.json({ clients: await service.clients(deviceId(req)) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/neighbors:
   *   get:
   *     summary: Neighbors the device sees over LLDP or discovery
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The neighbors
   *       502:
   *         description: The device did not answer
   */
  router.get(
    "/devices/:id/neighbors",
    view,
    safe(async (req, res) => {
      res.json({ neighbors: await service.neighbors(deviceId(req)) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/ports/{port}/state:
   *   post:
   *     summary: Turn a port on or off
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: port
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
   *               up:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Changed
   *       400:
   *         description: This device type cannot do that
   */
  router.post(
    "/devices/:id/ports/:port/state",
    manage,
    safe(async (req, res) => {
      if (typeof req.body?.up !== "boolean") {
        throw new ServiceError("up must be true or false");
      }
      await service.setPort(
        deviceId(req),
        String(req.params.port),
        req.body.up,
      );
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/ports/{port}/poe-cycle:
   *   post:
   *     summary: Turn PoE off and on again for a port
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: port
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Done
   *       400:
   *         description: This device type cannot do that
   */
  router.post(
    "/devices/:id/ports/:port/poe-cycle",
    manage,
    safe(async (req, res) => {
      await service.poeCycle(deviceId(req), String(req.params.port));
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/devices/{id}/reboot:
   *   post:
   *     summary: Restart the device
   *     tags:
   *       - Network Devices
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The restart was started
   *       400:
   *         description: This device type cannot do that
   */
  router.post(
    "/devices/:id/reboot",
    manage,
    safe(async (req, res) => {
      await service.reboot(deviceId(req));
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/network-devices/discover:
   *   post:
   *     summary: Look for SNMP devices in an address range
   *     tags:
   *       - Network Devices
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               cidr:
   *                 type: string
   *               community:
   *                 type: string
   *               version:
   *                 type: string
   *     responses:
   *       200:
   *         description: Devices that answered
   *       400:
   *         description: The range is not valid or too large
   */
  router.post(
    "/discover",
    manage,
    safe(async (req, res) => {
      const body = req.body ?? {};
      const version = body.version === "1" ? "1" : "2c";
      res.json({
        results: await service.discover(
          String(body.cidr ?? ""),
          String(body.community ?? ""),
          version,
        ),
      });
    }),
  );
}
