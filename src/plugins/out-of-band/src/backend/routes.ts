import type { Request, RequestHandler, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  BootTarget,
  Device,
  DeviceInput,
  PowerAction,
} from "../shared/types.js";
import { drivers, DriverError } from "./drivers/index.js";
import { ServiceError, type Service } from "./service.js";

type Level = "connect" | "edit";

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

/** Turns thrown errors into JSON, so one bad BMC never trips the plugin's error limit. */
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
  const power = ctx.rbac.require("power") as never;
  const media = ctx.rbac.require("media") as never;
  const manage = ctx.rbac.require("manage") as never;
  const actor = () => ctx.currentActor() as string;

  async function hostAllows(hostId: number, level: Level): Promise<boolean> {
    const access = await ctx.hosts.checkAccess(hostId, level);
    return access.hasAccess;
  }

  /** A device linked to a host follows that host's sharing. */
  async function load(req: Request, level: Level): Promise<Device> {
    const device = await service.get(deviceId(req));
    if (device.hostId !== null && !(await hostAllows(device.hostId, level))) {
      // Same answer as a missing device, so nothing leaks about hidden hosts
      throw new ServiceError(
        level === "connect"
          ? "Device not found"
          : "You need edit access to this host",
        level === "connect" ? 404 : 403,
      );
    }
    return device;
  }

  async function checkLinks(input: DeviceInput) {
    if (
      typeof input.hostId === "number" &&
      !(await hostAllows(input.hostId, "edit"))
    ) {
      throw new ServiceError("You need edit access to the linked host", 403);
    }
    const relay = input.options?.relayHostId;
    if (typeof relay === "number" && !(await hostAllows(relay, "connect"))) {
      throw new ServiceError("You cannot use that relay host", 403);
    }
  }

  /**
   * @openapi
   * /plugin-api/out-of-band/drivers:
   *   get:
   *     summary: List the BMC types and the login each one needs
   *     tags:
   *       - Out-of-band
   *     responses:
   *       200:
   *         description: The BMC types
   */
  router.get("/drivers", view, (_req, res) => {
    res.json({ drivers: Object.values(drivers).map((driver) => driver.info) });
  });

  /**
   * @openapi
   * /plugin-api/out-of-band/devices:
   *   get:
   *     summary: List BMCs with their last reading
   *     tags:
   *       - Out-of-band
   *     responses:
   *       200:
   *         description: The BMCs you can see. Logins are never included.
   */
  router.get(
    "/devices",
    view,
    safe(async (_req, res) => {
      const out: Device[] = [];
      for (const device of await service.list()) {
        if (
          device.hostId === null ||
          (await hostAllows(device.hostId, "connect"))
        ) {
          out.push(device);
        }
      }
      res.json({ devices: out });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/by-host/{hostId}:
   *   get:
   *     summary: Get the BMC linked to a host
   *     tags:
   *       - Out-of-band
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The BMC, or null when the host has none
   */
  router.get(
    "/devices/by-host/:hostId",
    view,
    safe(async (req, res) => {
      const hostId = Number(req.params.hostId);
      if (!Number.isInteger(hostId)) throw new ServiceError("Bad host id");
      if (!(await hostAllows(hostId, "connect"))) {
        return res.json({ device: null });
      }
      res.json({ device: await service.byHost(hostId) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices:
   *   post:
   *     summary: Add a BMC
   *     tags:
   *       - Out-of-band
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: The new BMC
   *       400:
   *         description: Missing or wrong fields
   *       409:
   *         description: The name is taken
   */
  router.post(
    "/devices",
    manage,
    safe(async (req, res) => {
      const input = (req.body ?? {}) as DeviceInput;
      await checkLinks(input);
      res.status(201).json({ device: await service.create(input, actor()) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/test:
   *   post:
   *     summary: Try a BMC's address and login without saving it
   *     tags:
   *       - Out-of-band
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: What the BMC reported
   *       502:
   *         description: The BMC did not answer or refused the login
   */
  router.post(
    "/devices/test",
    manage,
    safe(async (req, res) => {
      const input = (req.body ?? {}) as DeviceInput;
      await checkLinks(input);
      res.json({ reading: await service.test(input) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}:
   *   put:
   *     summary: Change a BMC. The login is replaced only when sent.
   *     tags:
   *       - Out-of-band
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
   *         description: The changed BMC
   *       404:
   *         description: No such BMC
   */
  router.put(
    "/devices/:id",
    manage,
    safe(async (req, res) => {
      const input = (req.body ?? {}) as DeviceInput;
      await checkLinks(input);
      res.json({ device: await service.update(deviceId(req), input) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}:
   *   delete:
   *     summary: Remove a BMC
   *     tags:
   *       - Out-of-band
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
   *         description: No such BMC
   */
  router.delete(
    "/devices/:id",
    manage,
    safe(async (req, res) => {
      await service.remove(deviceId(req));
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/poll:
   *   post:
   *     summary: Read the BMC now
   *     tags:
   *       - Out-of-band
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The BMC with its new reading
   */
  router.post(
    "/devices/:id/poll",
    view,
    safe(async (req, res) => {
      const device = await load(req, "connect");
      res.json({ device: await service.poll(device.id) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/power:
   *   post:
   *     summary: Change the power of the machine behind a BMC
   *     tags:
   *       - Out-of-band
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
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [on, off, graceful-shutdown, cycle, reset]
   *     responses:
   *       200:
   *         description: The BMC accepted the change
   *       400:
   *         description: Unknown action
   */
  router.post(
    "/devices/:id/power",
    power,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      const action = String(req.body?.action ?? "") as PowerAction;
      await service.power(device.id, action);
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/log:
   *   get:
   *     summary: Read the hardware event log
   *     tags:
   *       - Out-of-band
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The newest entries first
   */
  router.get(
    "/devices/:id/log",
    view,
    safe(async (req, res) => {
      const device = await load(req, "connect");
      res.json({ entries: await service.eventLog(device.id) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/log:
   *   delete:
   *     summary: Clear the hardware event log
   *     tags:
   *       - Out-of-band
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Cleared
   */
  router.delete(
    "/devices/:id/log",
    manage,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.clearLog(device.id);
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/boot:
   *   post:
   *     summary: Choose what the machine boots from next time
   *     tags:
   *       - Out-of-band
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
   *             properties:
   *               device:
   *                 type: string
   *                 enum: [none, pxe, disk, cd, usb, bios]
   *               uefi:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Set for the next boot only
   */
  router.post(
    "/devices/:id/boot",
    power,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.bootOnce(
        device.id,
        String(req.body?.device ?? "") as BootTarget,
        req.body?.uefi === true,
      );
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/media:
   *   get:
   *     summary: List virtual media slots
   *     tags:
   *       - Out-of-band
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The slots and what is mounted
   */
  router.get(
    "/devices/:id/media",
    media,
    safe(async (req, res) => {
      const device = await load(req, "connect");
      res.json({ slots: await service.mediaList(device.id) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/media/mount:
   *   post:
   *     summary: Mount an ISO from a web address
   *     tags:
   *       - Out-of-band
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
   *             properties:
   *               slot:
   *                 type: string
   *               url:
   *                 type: string
   *     responses:
   *       200:
   *         description: Mounted
   */
  router.post(
    "/devices/:id/media/mount",
    media,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.mediaMount(
        device.id,
        String(req.body?.slot ?? ""),
        String(req.body?.url ?? ""),
      );
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/out-of-band/devices/{id}/media/eject:
   *   post:
   *     summary: Eject virtual media
   *     tags:
   *       - Out-of-band
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
   *             properties:
   *               slot:
   *                 type: string
   *     responses:
   *       200:
   *         description: Ejected
   */
  router.post(
    "/devices/:id/media/eject",
    media,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.mediaEject(device.id, String(req.body?.slot ?? ""));
      res.json({ ok: true });
    }),
  );
}
