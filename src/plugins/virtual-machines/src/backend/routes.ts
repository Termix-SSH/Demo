import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostSummary, Inventory } from "../shared/types.js";
import { VmError } from "./errors.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import type { InventoryStore } from "./inventory.js";
import type { Jobs } from "./jobs.js";
import { CLOUD_IMAGES } from "./libvirt/create.js";
import type { NetworkKind } from "./libvirt/domain-xml.js";
import type { NetworkAction, PoolAction } from "./libvirt/storage.js";
import { snapshotKey } from "./operations.js";
import type { Target, VmProvider } from "./provider.js";
import {
  parseCidr,
  parseNewVm,
  requireInt,
  requireInterface,
  requireMac,
  requireName,
  requireNewName,
  requirePath,
  requireTarget,
  requireUrl,
  requireUuid,
} from "./validate.js";
import type { WatchStore } from "./watches.js";

export interface Deps {
  provider: VmProvider;
  inventory: InventoryStore;
  jobs: Jobs;
  watches: WatchStore;
}

/** remote-desktop.console v1, when Remote Desktop runs. */
interface RemoteConsole {
  open: (request: {
    hostId: number;
    address: string;
    port: number;
    password?: string;
  }) => Promise<{ token: string }>;
}

type Level = "connect" | "edit";

/** Hosts read at once by the summary route. */
const CONCURRENCY = 4;
const POOL_ACTIONS: PoolAction[] = [
  "start",
  "stop",
  "autostart",
  "noautostart",
];
const NETWORK_ACTIONS: NetworkAction[] = POOL_ACTIONS;
const POWER_ACTIONS: Record<string, string> = {
  start: "start",
  shutdown: "shutdown",
  reboot: "reboot",
  stop: "force-stop",
  suspend: "suspend",
  resume: "resume",
};

/** Runs `fn` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof VmError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(`Virtual Machines request failed: ${message(error)}`);
  res.status(500).json({ error: "Something went wrong" });
}

export function summarize(
  hostId: number,
  hostName: string,
  inventory: Inventory,
): HostSummary {
  const { vms, pools, checkedAt } = inventory;
  const count = (test: (state: string) => boolean) =>
    vms.filter((vm) => test(vm.state)).length;
  return {
    hostId,
    hostName,
    total: vms.length,
    running: count((s) => s === "running"),
    stopped: count((s) => s === "shutoff"),
    crashed: count((s) => s === "crashed"),
    vms,
    pools,
    error: "",
    checkedAt,
  };
}

/**
 * Mounts the routes on the plugin's router, which core serves at
 * /plugin-api/virtual-machines with auth in front. Reads need connect access
 * to the host, changes need edit access and a host that is not read only.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  { provider, inventory, jobs, watches }: Deps,
): void {
  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const actor = () => String(ctx.currentActor() ?? "");
  const param = (req: Request, key: string) => String(req.params[key] ?? "");
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const uuidOf = (req: Request) => requireUuid(param(req, "uuid"));

  async function gate(hostId: number, level: Level): Promise<HostSettings> {
    if (!Number.isInteger(hostId) || hostId < 1) {
      throw new VmError("The host id is not valid");
    }
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level === "edit" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new VmError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new VmError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new VmError(
        "Virtual Machines is not turned on for this host",
        403,
        { code: "disabled" },
      );
    }
    if (level === "edit" && settings.readOnly) {
      throw new VmError("This host is read only", 403, { code: "readOnly" });
    }
    return settings;
  }

  const read =
    (run: (target: Target, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const hostId = Number(req.params.hostId);
        const settings = await gate(hostId, "connect");
        res.json(await run({ hostId, settings }, req));
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  function audit(
    action: string,
    hostId: number,
    name: string | undefined,
    error?: unknown,
  ) {
    void ctx.audit.record({
      action: `virtual-machines.${action}`,
      resourceType: "host",
      resourceId: String(hostId),
      resourceName: name,
      success: !error,
      errorMessage: error ? message(error) : undefined,
    });
  }

  /** A change: needs edit access and is written to the audit log. */
  const write =
    (
      action: string,
      run: (target: Target, req: Request) => Promise<unknown>,
      name?: (req: Request) => string,
    ) =>
    async (req: Request, res: Response) => {
      const hostId = Number(req.params.hostId);
      const label = name?.(req);
      try {
        const settings = await gate(hostId, "edit");
        const result = await run({ hostId, settings }, req);
        inventory.invalidate(hostId);
        audit(action, hostId, label);
        res.json(result ?? { ok: true });
      } catch (error) {
        audit(action, hostId, label, error);
        fail(ctx, res, error);
      }
    };

  /** Through the same gate as every surface, so it lands in history. */
  async function operation(
    id: string,
    hostId: number,
    options: { resourceKey?: string; input?: Record<string, unknown> },
  ): Promise<unknown> {
    const outcome = await ctx.operations.run(`virtual-machines.${id}`, {
      hostId,
      confirmed: true,
      ...options,
    });
    if (outcome.status !== "success") {
      throw new VmError(outcome.error ?? outcome.status);
    }
    return outcome.data ?? { ok: true };
  }

  /**
   * @openapi
   * /plugin-api/virtual-machines/images:
   *   get:
   *     summary: Cloud images a new VM can start from
   *     tags:
   *       - Virtual Machines
   *     responses:
   *       200:
   *         description: The built-in image list.
   */
  router.get("/images", (_req, res) => {
    res.json(CLOUD_IMAGES);
  });

  /**
   * @openapi
   * /plugin-api/virtual-machines/summary:
   *   get:
   *     summary: VMs on every host you can reach
   *     description: One cached read per host with Virtual Machines turned on, at most 4 hosts at a time.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: query
   *         name: refresh
   *         schema:
   *           type: string
   *         description: Set to 1 to skip the cache.
   *     responses:
   *       200:
   *         description: One entry per host.
   */
  router.get("/summary", async (req, res) => {
    try {
      const fresh = req.query.refresh === "1";
      const enabled: Array<{
        id: number;
        name: string;
        settings: HostSettings;
      }> = [];
      for (const host of await ctx.hosts.list()) {
        const settings = await readHostSettings(ctx, host.id);
        if (settings.enabled) {
          enabled.push({
            id: host.id,
            name: host.name || host.ip || `#${host.id}`,
            settings,
          });
        }
      }
      res.json(
        await mapLimit(enabled, CONCURRENCY, async (host) => {
          try {
            return summarize(
              host.id,
              host.name,
              await inventory.get(
                { hostId: host.id, settings: host.settings },
                { fresh },
              ),
            );
          } catch (error) {
            return {
              hostId: host.id,
              hostName: host.name,
              total: 0,
              running: 0,
              stopped: 0,
              crashed: 0,
              vms: [],
              pools: [],
              error: error instanceof VmError ? error.message : "Unreachable",
              checkedAt: new Date().toISOString(),
            } satisfies HostSummary;
          }
        }),
      );
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/status:
   *   get:
   *     summary: Whether this host can run VMs
   *     description: Reports libvirt, KVM, the service, and the tools a new VM needs.
   *     tags:
   *       - Virtual Machines
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
    "/hosts/:hostId/status",
    read((target) => provider.status(target)),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/install:
   *   post:
   *     summary: Install libvirt and QEMU on this host
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Installed.
   */
  router.post(
    "/hosts/:hostId/install",
    write("install", (target) => provider.install(target)),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/inventory:
   *   get:
   *     summary: VMs, pools and host resources
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: fresh
   *         schema:
   *           type: string
   *         description: Set to 1 to skip the cache.
   *     responses:
   *       200:
   *         description: The inventory.
   */
  router.get(
    "/hosts/:hostId/inventory",
    read((target, req) =>
      inventory.get(target, { fresh: req.query.fresh === "1" }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms:
   *   post:
   *     summary: Make a new VM
   *     description: Starts a job on the host that downloads the image when needed, makes the disks and defines the VM.
   *     tags:
   *       - Virtual Machines
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
   *     responses:
   *       200:
   *         description: The job.
   */
  router.post(
    "/hosts/:hostId/vms",
    write(
      "create",
      async (target, req) => {
        const vm = parseNewVm(body(req));
        return jobs.start(
          target,
          "create",
          await provider.planCreate(target, vm),
        );
      },
      (req) => String(body(req).name ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}:
   *   get:
   *     summary: One VM with its devices
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The VM.
   */
  router.get(
    "/hosts/:hostId/vms/:uuid",
    read(async (target, req) => {
      const uuid = uuidOf(req);
      const detail = await provider.detail(target, uuid);
      return {
        ...detail,
        watched: await watches.has(actor(), target.hostId, uuid),
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/stats:
   *   get:
   *     summary: Live counters for one VM
   *     description: Raw CPU, disk and network counters. The client works out rates.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The counters.
   */
  router.get(
    "/hosts/:hostId/vms/:uuid/stats",
    read((target, req) => provider.stats(target, uuidOf(req))),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/power/{action}:
   *   post:
   *     summary: Start, shut down, reboot, stop, suspend or resume a VM
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *           enum: [start, shutdown, reboot, stop, suspend, resume]
   *     responses:
   *       200:
   *         description: Done.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/power/:action",
    write(
      "power",
      async (target, req) => {
        const id = POWER_ACTIONS[param(req, "action")];
        if (!id) throw new VmError("Unknown action");
        return operation(id, target.hostId, { resourceKey: uuidOf(req) });
      },
      (req) => `${param(req, "uuid")} ${param(req, "action")}`,
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/autostart:
   *   post:
   *     summary: Turn autostart on or off
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Done.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/autostart",
    write("autostart", (target, req) =>
      operation("set-autostart", target.hostId, {
        resourceKey: uuidOf(req),
        input: { enabled: body(req).enabled !== false },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/clone:
   *   post:
   *     summary: Copy a shut down VM
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               name:
   *                 type: string
   *     responses:
   *       200:
   *         description: The job id.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/clone",
    write("clone", (target, req) =>
      operation("clone", target.hostId, {
        resourceKey: uuidOf(req),
        input: { name: requireNewName(body(req).name, "VM name") },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}:
   *   delete:
   *     summary: Delete a VM
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: deleteDisks
   *         schema:
   *           type: string
   *         description: Set to 1 to delete the disks no other VM uses.
   *     responses:
   *       200:
   *         description: What was removed and kept.
   */
  router.delete(
    "/hosts/:hostId/vms/:uuid",
    write("delete", (target, req) =>
      operation("delete-vm", target.hostId, {
        resourceKey: uuidOf(req),
        input: { deleteDisks: req.query.deleteDisks === "1" },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/hardware:
   *   patch:
   *     summary: Change CPUs or memory for the next start
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               vcpus:
   *                 type: integer
   *               memoryMib:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.patch(
    "/hosts/:hostId/vms/:uuid/hardware",
    write("hardware", async (target, req) => {
      const input = body(req);
      await provider.setHardware(target, uuidOf(req), {
        ...(input.vcpus !== undefined
          ? { vcpus: requireInt(input.vcpus, 1, 256, "CPUs") }
          : {}),
        ...(input.memoryMib !== undefined
          ? { memoryMib: requireInt(input.memoryMib, 64, 4_194_304, "Memory") }
          : {}),
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/disks:
   *   post:
   *     summary: Add a new disk
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               pool:
   *                 type: string
   *               gib:
   *                 type: integer
   *     responses:
   *       200:
   *         description: The new disk's name.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/disks",
    write("disk.add", async (target, req) => ({
      target: await provider.addDisk(
        target,
        uuidOf(req),
        requireName(body(req).pool, "storage pool"),
        requireInt(body(req).gib, 1, 65_536, "Disk size"),
      ),
    })),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/disks/{target}:
   *   delete:
   *     summary: Detach a disk
   *     description: The volume stays in its pool.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: target
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Detached.
   */
  router.delete(
    "/hosts/:hostId/vms/:uuid/disks/:target",
    write("disk.remove", (target, req) =>
      provider.removeDisk(
        target,
        uuidOf(req),
        requireTarget(param(req, "target")),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/media:
   *   post:
   *     summary: Insert or eject an ISO
   *     description: An empty volume ejects.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               pool:
   *                 type: string
   *               volume:
   *                 type: string
   *     responses:
   *       200:
   *         description: Done.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/media",
    write("media", (target, req) => {
      const volume = body(req).volume ? String(body(req).volume) : "";
      return provider.setMedia(
        target,
        uuidOf(req),
        volume ? requireName(body(req).pool, "storage pool") : "",
        volume ? requireName(volume, "ISO") : "",
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/nics:
   *   post:
   *     summary: Add a network card
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               type:
   *                 type: string
   *                 enum: [network, bridge]
   *               source:
   *                 type: string
   *     responses:
   *       200:
   *         description: Added.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/nics",
    write("nic.add", (target, req) => {
      const type = body(req).type === "bridge" ? "bridge" : "network";
      return provider.addNic(
        target,
        uuidOf(req),
        type,
        type === "bridge"
          ? requireInterface(body(req).source)
          : requireName(body(req).source, "network"),
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/nics/{mac}:
   *   delete:
   *     summary: Remove a network card
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: mac
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Removed.
   */
  router.delete(
    "/hosts/:hostId/vms/:uuid/nics/:mac",
    write("nic.remove", (target, req) =>
      provider.removeNic(target, uuidOf(req), requireMac(param(req, "mac"))),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/xml:
   *   get:
   *     summary: The VM's config as XML
   *     description: Needs edit access, since it holds the display password.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The XML.
   */
  router.get(
    "/hosts/:hostId/vms/:uuid/xml",
    write("xml.read", async (target, req) => ({
      xml: await provider.readConfig(target, uuidOf(req)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/xml:
   *   put:
   *     summary: Save the VM's config
   *     description: The host checks the XML first and keeps a backup of the old config.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               xml:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.put(
    "/hosts/:hostId/vms/:uuid/xml",
    write("xml.write", (target, req) =>
      provider.writeConfig(target, uuidOf(req), String(body(req).xml ?? "")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/use-vnc:
   *   post:
   *     summary: Switch a SPICE display to VNC
   *     description: Takes effect the next time the VM starts.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/use-vnc",
    write("use-vnc", (target, req) => provider.useVnc(target, uuidOf(req))),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/console:
   *   post:
   *     summary: Open the VM's graphical console
   *     description: Tunnels the VNC port through the host with SSH and returns a Remote Desktop display token.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The token.
   *       409:
   *         description: Remote Desktop is off, the VM is not running or it has no VNC display.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/console",
    ctx.rbac.require("console") as never,
    write("console", async (target, req) => {
      if (!ctx.services.providers("remote-desktop.console").includes("")) {
        throw new VmError(
          "Turn on Remote Desktop 1.4.0 or later to see this VM's display",
          409,
          { code: "no-remote-desktop" },
        );
      }
      const service = ctx.services.get<Partial<RemoteConsole>>(
        "remote-desktop.console",
      );
      if (typeof service.open !== "function") {
        throw new VmError("Remote Desktop can't open this display", 409, {
          code: "no-remote-desktop",
        });
      }
      const display = await provider.display(target, uuidOf(req));
      return service.open({ hostId: target.hostId, ...display });
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/watch:
   *   put:
   *     summary: Get alerts when this VM stops
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               on:
   *                 type: boolean
   *               name:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.put(
    "/hosts/:hostId/vms/:uuid/watch",
    read(async (target, req) => {
      await watches.set(
        {
          userId: actor(),
          hostId: target.hostId,
          uuid: uuidOf(req),
          name: String(body(req).name ?? "").slice(0, 128),
        },
        body(req).on === true,
      );
      return { ok: true };
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/snapshots:
   *   get:
   *     summary: A VM's snapshots
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The snapshots.
   */
  router.get(
    "/hosts/:hostId/vms/:uuid/snapshots",
    read((target, req) => provider.snapshots(target, uuidOf(req))),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/snapshots:
   *   post:
   *     summary: Take a snapshot
   *     description: A running VM keeps its memory in the snapshot too.
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *     responses:
   *       200:
   *         description: Taken.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/snapshots",
    write("snapshot", (target, req) =>
      operation("snapshot", target.hostId, {
        resourceKey: uuidOf(req),
        input: {
          name: requireNewName(body(req).name, "snapshot name"),
          description: String(body(req).description ?? ""),
        },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/snapshots/{name}/revert:
   *   post:
   *     summary: Put a VM back to a snapshot
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *         description: Reverted.
   */
  router.post(
    "/hosts/:hostId/vms/:uuid/snapshots/:name/revert",
    write("snapshot.revert", (target, req) =>
      operation("revert-snapshot", target.hostId, {
        resourceKey: snapshotKey(
          uuidOf(req),
          requireName(param(req, "name"), "snapshot"),
        ),
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/vms/{uuid}/snapshots/{name}:
   *   delete:
   *     summary: Delete a snapshot
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: uuid
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
   *         description: Deleted.
   */
  router.delete(
    "/hosts/:hostId/vms/:uuid/snapshots/:name",
    write("snapshot.delete", (target, req) =>
      operation("delete-snapshot", target.hostId, {
        resourceKey: snapshotKey(
          uuidOf(req),
          requireName(param(req, "name"), "snapshot"),
        ),
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools:
   *   post:
   *     summary: Add a folder storage pool
   *     tags:
   *       - Virtual Machines
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
   *             properties:
   *               name:
   *                 type: string
   *               path:
   *                 type: string
   *     responses:
   *       200:
   *         description: Added.
   */
  router.post(
    "/hosts/:hostId/pools",
    write("pool.create", (target, req) =>
      provider.createPool(
        target,
        requireNewName(body(req).name, "pool name"),
        requirePath(body(req).path),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}/volumes:
   *   get:
   *     summary: Volumes in a pool
   *     tags:
   *       - Virtual Machines
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
   *         description: The volumes.
   */
  router.get(
    "/hosts/:hostId/pools/:name/volumes",
    read((target, req) =>
      provider.volumes(target, requireName(param(req, "name"), "pool")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}/volumes:
   *   post:
   *     summary: Make an empty qcow2 volume
   *     tags:
   *       - Virtual Machines
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
   *             properties:
   *               name:
   *                 type: string
   *               gib:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Made.
   */
  router.post(
    "/hosts/:hostId/pools/:name/volumes",
    write("volume.create", (target, req) =>
      provider.createVolume(
        target,
        requireName(param(req, "name"), "pool"),
        requireNewName(body(req).name, "volume name"),
        requireInt(body(req).gib, 1, 65_536, "Size"),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}/volumes/{volume}:
   *   delete:
   *     summary: Delete a volume no VM uses
   *     tags:
   *       - Virtual Machines
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
   *         name: volume
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/hosts/:hostId/pools/:name/volumes/:volume",
    write("volume.delete", (target, req) =>
      provider.deleteVolume(
        target,
        requireName(param(req, "name"), "pool"),
        requireName(param(req, "volume"), "volume"),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}/download:
   *   post:
   *     summary: Download a file into a pool
   *     description: The host downloads it in a job, so it survives a Termix restart.
   *     tags:
   *       - Virtual Machines
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
   *             properties:
   *               url:
   *                 type: string
   *               name:
   *                 type: string
   *     responses:
   *       200:
   *         description: The job.
   */
  router.post(
    "/hosts/:hostId/pools/:name/download",
    write("volume.download", (target, req) =>
      jobs.start(
        target,
        "download",
        provider.planDownload(
          target,
          requireName(param(req, "name"), "pool"),
          requireNewName(body(req).name, "file name"),
          requireUrl(body(req).url),
        ),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}/{action}:
   *   post:
   *     summary: Start or stop a pool, or set its autostart
   *     tags:
   *       - Virtual Machines
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
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *           enum: [start, stop, autostart, noautostart]
   *     responses:
   *       200:
   *         description: Done.
   */
  router.post(
    "/hosts/:hostId/pools/:name/:action",
    write("pool.action", (target, req) => {
      const action = param(req, "action") as PoolAction;
      if (!POOL_ACTIONS.includes(action)) {
        throw new VmError("Unknown action");
      }
      return provider.poolAction(
        target,
        requireName(param(req, "name"), "pool"),
        action,
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/pools/{name}:
   *   delete:
   *     summary: Forget a pool
   *     description: Files in its folder stay on the disk.
   *     tags:
   *       - Virtual Machines
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
   *         description: Removed.
   */
  router.delete(
    "/hosts/:hostId/pools/:name",
    write("pool.delete", (target, req) =>
      provider.deletePool(target, requireName(param(req, "name"), "pool")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/networks:
   *   get:
   *     summary: Virtual networks
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The networks.
   */
  router.get(
    "/hosts/:hostId/networks",
    read((target) => provider.networks(target)),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/networks:
   *   post:
   *     summary: Make a virtual network
   *     tags:
   *       - Virtual Machines
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
   *             properties:
   *               name:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [nat, isolated, bridge]
   *               subnet:
   *                 type: string
   *               bridge:
   *                 type: string
   *     responses:
   *       200:
   *         description: Made.
   */
  router.post(
    "/hosts/:hostId/networks",
    write("network.create", (target, req) => {
      const input = body(req);
      const kind: NetworkKind =
        input.type === "bridge"
          ? { type: "bridge", bridge: requireInterface(input.bridge) }
          : {
              type: input.type === "isolated" ? "isolated" : "nat",
              ip: parseCidr(input.subnet),
            };
      return provider.createNetwork(
        target,
        requireNewName(input.name, "network name"),
        kind,
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/networks/{name}/leases:
   *   get:
   *     summary: DHCP leases on a network
   *     tags:
   *       - Virtual Machines
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
   *         description: The leases.
   */
  router.get(
    "/hosts/:hostId/networks/:name/leases",
    read((target, req) =>
      provider.leases(target, requireName(param(req, "name"), "network")),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/networks/{name}/{action}:
   *   post:
   *     summary: Start or stop a network, or set its autostart
   *     tags:
   *       - Virtual Machines
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
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *           enum: [start, stop, autostart, noautostart]
   *     responses:
   *       200:
   *         description: Done.
   */
  router.post(
    "/hosts/:hostId/networks/:name/:action",
    write("network.action", (target, req) => {
      const action = param(req, "action") as NetworkAction;
      if (!NETWORK_ACTIONS.includes(action)) {
        throw new VmError("Unknown action");
      }
      return provider.networkAction(
        target,
        requireName(param(req, "name"), "network"),
        action,
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/networks/{name}:
   *   delete:
   *     summary: Delete a network
   *     tags:
   *       - Virtual Machines
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
    "/hosts/:hostId/networks/:name",
    write("network.delete", (target, req) =>
      provider.deleteNetwork(
        target,
        requireName(param(req, "name"), "network"),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/jobs:
   *   get:
   *     summary: Recent jobs on this host
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The jobs.
   */
  router.get(
    "/hosts/:hostId/jobs",
    read((target) => jobs.list(target.hostId)),
  );

  /**
   * @openapi
   * /plugin-api/virtual-machines/hosts/{hostId}/jobs/{id}/cancel:
   *   post:
   *     summary: Stop a running job
   *     tags:
   *       - Virtual Machines
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Stopped.
   */
  router.post(
    "/hosts/:hostId/jobs/:id/cancel",
    write("job.cancel", (target, req) =>
      jobs.cancel(target, Number(param(req, "id"))),
    ),
  );
}
