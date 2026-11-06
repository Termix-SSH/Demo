import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HistoryRange, HostSummary, Reading } from "../shared/types.js";
import { overall } from "./conditions.js";
import type { Engine, HostState } from "./engine.js";
import { StorageError } from "./errors.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import type { History } from "./history.js";
import type { Service } from "./service.js";
import type { Store } from "./store.js";
import { parseConfig, requireHostId } from "./validate.js";

export interface Deps {
  store: Store;
  engine: Engine;
  history: History;
  service: Service;
}

type Level = "connect" | "edit";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof StorageError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(`Storage Health request failed: ${message(error)}`);
  res.status(500).json({ error: "Something went wrong" });
}

const RANGES: HistoryRange[] = ["24h", "7d", "30d"];

function problemCount(state: HostState | undefined): number {
  if (!state) return 0;
  return [...state.active].filter((key) => !key.startsWith("raid-rebuilding"))
    .length;
}

function hottest(reading: Reading | null): number | null {
  const temps = (reading?.devices ?? [])
    .map((d) => d.tempC)
    .filter((t): t is number => typeof t === "number");
  return temps.length ? Math.max(...temps) : null;
}

/**
 * Mounts the routes on the plugin's router, which core serves at
 * /plugin-api/storage-health with auth in front. Reads need connect access to
 * the host, changes need edit access and a host that is not read only.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { store, engine, history, service } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const hostOf = (req: Request) => requireHostId(req.params.hostId);

  async function gate(hostId: number, level: Level): Promise<HostSettings> {
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level === "edit" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new StorageError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new StorageError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new StorageError(
        "Storage Health is turned off for this host",
        403,
        {
          code: "disabled",
        },
      );
    }
    if (level === "edit" && settings.readOnly) {
      throw new StorageError("This host is read only", 403, {
        code: "readOnly",
      });
    }
    return settings;
  }

  /**
   * @openapi
   * /summary:
   *   get:
   *     summary: Health of every host the user can see
   *     description: Uses the readings the background timer already took, so it never opens an SSH connection.
   *     responses:
   *       200:
   *         description: One row per watched host.
   */
  router.get("/summary", async (_req, res) => {
    try {
      const rows = await store.all();
      const out: HostSummary[] = [];
      await Promise.all(
        rows.map(async (row) => {
          try {
            const access = await ctx.hosts.checkAccess(row.hostId, "connect");
            if (!access.hasAccess) return;
            if (!(await readHostSettings(ctx, row.hostId)).enabled) return;
          } catch {
            return;
          }
          const state = engine.state(row.hostId);
          const host = (await ctx.hosts.get(row.hostId).catch(() => null)) as {
            name?: string;
            ip?: string;
          } | null;
          out.push({
            hostId: row.hostId,
            status: overall(state?.reading ?? null),
            label: host?.name || host?.ip || `Host ${row.hostId}`,
            drives: state?.reading?.devices.length ?? 0,
            problems: problemCount(state),
            hottestC: hottest(state?.reading ?? null),
            error: state?.error ?? "",
          });
        }),
      );
      out.sort((a, b) => a.label.localeCompare(b.label));
      res.json(out);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  async function view(hostId: number, force: boolean) {
    const settings = await gate(hostId, "connect");
    const { row, state } = await service.fresh(hostId, force);
    const canEdit =
      !settings.readOnly &&
      (
        await ctx.hosts.checkAccess(hostId, "edit").catch(() => ({
          hasAccess: false,
        }))
      ).hasAccess;
    return {
      hostId,
      canEdit,
      useSudo: settings.useSudo,
      config: {
        hostId,
        alerts: row.alerts,
        intervalMin: row.intervalMin,
        tempWarnC: row.tempWarnC,
        tempCritC: row.tempCritC,
        wearWarnPct: row.wearWarnPct,
        thinWarnPct: row.thinWarnPct,
      },
      status: overall(state.reading),
      reading: state.reading,
      error: state.error,
      readAt: state.readAt,
      active: [...state.active],
    };
  }

  /**
   * @openapi
   * /{hostId}:
   *   get:
   *     summary: Drives, pools, arrays and volumes on a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The latest reading, read again when it is older than a minute.
   */
  router.get("/:hostId", async (req, res) => {
    try {
      res.json(await view(hostOf(req), false));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/refresh:
   *   post:
   *     summary: Read the host now
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The new reading.
   */
  router.post("/:hostId/refresh", async (req, res) => {
    try {
      res.json(await view(hostOf(req), true));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/config:
   *   put:
   *     summary: Change alerts, interval and thresholds for a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The saved settings.
   */
  router.put("/:hostId/config", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const row = await service.row(hostId);
      const config = parseConfig(body(req), row);
      await store.update(hostId, config);
      res.json({ hostId, ...config });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/history:
   *   get:
   *     summary: Temperature, wear and hours for one drive over time
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: device
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: range
   *         schema: { type: string, enum: [24h, 7d, 30d] }
   *     responses:
   *       200:
   *         description: Points, oldest first.
   */
  router.get("/:hostId/history", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      const device = String(req.query.device ?? "");
      if (!device) throw new StorageError("Choose a drive");
      const range = RANGES.includes(req.query.range as HistoryRange)
        ? (req.query.range as HistoryRange)
        : "24h";
      res.json({ range, points: history.range(hostId, device, range) });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/events:
   *   get:
   *     summary: Problems found and cleared, self tests and scrubs
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Newest first.
   */
  router.get("/:hostId/events", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      res.json(await store.events(hostId));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/selftest:
   *   post:
   *     summary: Start or stop a SMART self test
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               device: { type: string }
   *               action: { type: string, enum: [short, long, abort] }
   *     responses:
   *       200:
   *         description: What was done.
   */
  router.post(
    "/:hostId/selftest",
    ctx.rbac.require("run-tests") as never,
    async (req, res) => {
      try {
        const hostId = hostOf(req);
        await gate(hostId, "edit");
        const { device, action } = body(req);
        if (action !== "short" && action !== "long" && action !== "abort") {
          throw new StorageError("Choose short, long or abort");
        }
        const text = await service.selfTest(
          hostId,
          String(device ?? ""),
          action,
        );
        res.json({ ok: true, message: text });
      } catch (error) {
        fail(ctx, res, error);
      }
    },
  );

  /**
   * @openapi
   * /{hostId}/scrub:
   *   post:
   *     summary: Start or stop a scrub, or an array check
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               target: { type: string }
   *               stop: { type: boolean }
   *     responses:
   *       200:
   *         description: What was done.
   */
  router.post(
    "/:hostId/scrub",
    ctx.rbac.require("run-tests") as never,
    async (req, res) => {
      try {
        const hostId = hostOf(req);
        await gate(hostId, "edit");
        const { target, stop } = body(req);
        const text = await service.scrub(
          hostId,
          String(target ?? ""),
          stop === true,
        );
        res.json({ ok: true, message: text });
      } catch (error) {
        fail(ctx, res, error);
      }
    },
  );
}
