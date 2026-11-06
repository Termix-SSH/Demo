import type { Request, RequestHandler, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Device, DeviceInput, PowerAction } from "../shared/types.js";
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

/** Turns thrown errors into JSON, so one bad KVM never trips the plugin's error limit. */
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

const POWER_ACTIONS: PowerAction[] = [
  "on",
  "graceful-shutdown",
  "off",
  "reset",
];

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: Service,
): void {
  const view = ctx.rbac.require("view") as never;
  const power = ctx.rbac.require("power") as never;
  const consolePerm = ctx.rbac.require("console") as never;
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
  }

  /**
   * @openapi
   * /plugin-api/ip-kvm/drivers:
   *   get:
   *     summary: List the KVM types and the login each one needs
   *     tags:
   *       - IP-KVM
   *     responses:
   *       200:
   *         description: The KVM types
   */
  router.get("/drivers", view, (_req, res) => {
    res.json({ drivers: Object.values(drivers).map((driver) => driver.info) });
  });

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices:
   *   get:
   *     summary: List KVMs with their last reading
   *     tags:
   *       - IP-KVM
   *     responses:
   *       200:
   *         description: The KVMs you can see. Logins are never included.
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
   * /plugin-api/ip-kvm/devices/by-host/{hostId}:
   *   get:
   *     summary: Get the KVM linked to a host
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The KVM, or null when the host has none
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
   * /plugin-api/ip-kvm/devices:
   *   post:
   *     summary: Add a KVM
   *     tags:
   *       - IP-KVM
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: The new KVM
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
   * /plugin-api/ip-kvm/devices/test:
   *   post:
   *     summary: Try a KVM address and login without saving it
   *     tags:
   *       - IP-KVM
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: What the KVM reported
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
   * /plugin-api/ip-kvm/devices/certificate:
   *   post:
   *     summary: Read the certificate a KVM shows, so it can be pinned
   *     tags:
   *       - IP-KVM
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               address:
   *                 type: string
   *               port:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Fingerprint, names and dates of the certificate
   */
  router.post(
    "/devices/certificate",
    manage,
    safe(async (req, res) => {
      const body = (req.body ?? {}) as { address?: unknown; port?: unknown };
      res.json({
        certificate: await service.certificate(
          String(body.address ?? ""),
          Number(body.port ?? 443),
        ),
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}:
   *   put:
   *     summary: Change a KVM. The login is replaced only when sent.
   *     tags:
   *       - IP-KVM
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
   *         description: The changed KVM
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
   * /plugin-api/ip-kvm/devices/{id}:
   *   delete:
   *     summary: Remove a KVM
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Removed
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
   * /plugin-api/ip-kvm/devices/{id}/poll:
   *   post:
   *     summary: Read the KVM now
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The KVM with its new reading
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
   * /plugin-api/ip-kvm/devices/{id}/power:
   *   post:
   *     summary: Change the power of the machine behind a KVM
   *     tags:
   *       - IP-KVM
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
   *         description: Sent
   */
  router.post(
    "/devices/:id/power",
    power,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      const action = String(req.body?.action) as PowerAction;
      if (!POWER_ACTIONS.includes(action)) {
        throw new ServiceError("Bad power action");
      }
      await service.power(device.id, action);
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/wake:
   *   post:
   *     summary: Send a Wake-on-LAN packet for the machine behind a KVM
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Sent
   */
  router.post(
    "/devices/:id/wake",
    power,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.wake(device.id);
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/snapshot:
   *   get:
   *     summary: A JPEG of the current screen
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The JPEG
   */
  router.get(
    "/devices/:id/snapshot",
    consolePerm,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      const jpeg = await service.snapshot(device.id);
      res.set("content-type", "image/jpeg").set("cache-control", "no-store");
      res.send(jpeg);
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/paste:
   *   post:
   *     summary: Type text on the machine behind a KVM
   *     tags:
   *       - IP-KVM
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
   *         description: Typed
   */
  router.post(
    "/devices/:id/paste",
    consolePerm,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.paste(device.id, String(req.body?.text ?? ""));
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/session:
   *   post:
   *     summary: Pass a browser WebRTC offer to a JetKVM and return its answer
   *     tags:
   *       - IP-KVM
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
   *         description: The answer
   */
  router.post(
    "/devices/:id/session",
    consolePerm,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      res.json({
        sd: await service.relay(device.id, String(req.body?.sd ?? "")),
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/media:
   *   get:
   *     summary: List the images on a KVM and what is mounted
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The images
   */
  router.get(
    "/devices/:id/media",
    media,
    safe(async (req, res) => {
      const device = await load(req, "connect");
      res.json({ media: await service.mediaList(device.id) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/media/mount:
   *   post:
   *     summary: Mount an image as a USB drive or CD
   *     tags:
   *       - IP-KVM
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
   *         description: Mounted
   */
  router.post(
    "/devices/:id/media/mount",
    media,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.mediaMount(
        device.id,
        String(req.body?.image ?? ""),
        req.body?.cdrom !== false,
      );
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/media/eject:
   *   post:
   *     summary: Eject the mounted image
   *     tags:
   *       - IP-KVM
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Ejected
   */
  router.post(
    "/devices/:id/media/eject",
    media,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.mediaEject(device.id);
      res.json({ ok: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/ip-kvm/devices/{id}/media/fetch:
   *   post:
   *     summary: Make the KVM download an image from a web address
   *     tags:
   *       - IP-KVM
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
   *         description: Downloaded
   */
  router.post(
    "/devices/:id/media/fetch",
    media,
    safe(async (req, res) => {
      const device = await load(req, "edit");
      await service.mediaFromUrl(
        device.id,
        String(req.body?.url ?? ""),
        String(req.body?.name ?? ""),
      );
      res.json({ ok: true });
    }),
  );
}
