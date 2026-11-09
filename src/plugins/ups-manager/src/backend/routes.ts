import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  HistoryRange,
  HostSummary,
  SourceSecrets,
} from "../shared/types.js";
import type { Engine } from "./engine.js";
import { UpsError } from "./errors.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import type { History } from "./history.js";
import { DETECT_SCRIPT, parseDetect, readTarget } from "./reader.js";
import type { Remote } from "./remote.js";
import type { Service } from "./service.js";
import { MAX_SOURCES_PER_HOST, type Store } from "./store.js";
import { parseSource, requireId } from "./validate.js";

export interface Deps {
  store: Store;
  engine: Engine;
  history: History;
  remote: Remote;
  service: Service;
}

type Level = "connect" | "edit";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof UpsError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(`UPS Manager request failed: ${message(error)}`);
  res.status(500).json({ error: "Something went wrong" });
}

const RANGES: HistoryRange[] = ["24h", "7d", "30d"];

/**
 * Mounts the routes on the plugin's router, which core serves at
 * /plugin-api/ups-manager with auth in front. Reads need connect access to
 * the host, changes need edit access and a host that is not read only.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { store, engine, history, remote, service } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const param = (req: Request, key: string) => String(req.params[key] ?? "");
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

  async function gate(hostId: number, level: Level): Promise<HostSettings> {
    if (!Number.isInteger(hostId) || hostId < 1) {
      throw new UpsError("The host id is not valid");
    }
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level === "edit" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new UpsError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new UpsError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new UpsError("UPS Manager is turned off for this host", 403, {
        code: "disabled",
      });
    }
    if (level === "edit" && settings.readOnly) {
      throw new UpsError("This host is read only", 403, { code: "readOnly" });
    }
    return settings;
  }

  const hostOf = (req: Request) => Number(param(req, "hostId"));

  /**
   * @openapi
   * /plugin-api/ups-manager/summary:
   *   get:
   *     summary: Latest reading of every UPS the user can see
   *     description: Uses the readings the background timer already took, so it never opens an SSH connection.
   *     responses:
   *       200:
   *         description: One row per UPS.
   */
  router.get("/summary", async (_req, res) => {
    try {
      const rows = await store.all();
      const hostIds = [...new Set(rows.map((r) => r.hostId))];
      const allowed = new Map<number, boolean>();
      await Promise.all(
        hostIds.map(async (hostId) => {
          try {
            const access = await ctx.hosts.checkAccess(hostId, "connect");
            allowed.set(
              hostId,
              access.hasAccess && (await readHostSettings(ctx, hostId)).enabled,
            );
          } catch {
            allowed.set(hostId, false);
          }
        }),
      );
      const out: HostSummary[] = rows
        .filter((r) => allowed.get(r.hostId) && r.enabled)
        .map((r) => {
          const state = engine.state(r.id);
          return {
            hostId: r.hostId,
            sourceId: r.id,
            label: r.label,
            backend: r.backend,
            state: state?.reading?.state ?? "unknown",
            flags: state?.reading?.flags ?? [],
            chargePct: state?.reading?.chargePct ?? null,
            runtimeSec: state?.reading?.runtimeSec ?? null,
            loadPct: state?.reading?.loadPct ?? null,
            error: state?.error ?? "",
          };
        });
      res.json(out);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/detect:
   *   get:
   *     summary: Which UPS tools and devices the host has
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Installed tools, NUT devices and running services.
   */
  router.get("/:hostId/detect", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      res.json(parseDetect(await remote.run(hostId, DETECT_SCRIPT)));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources:
   *   get:
   *     summary: The UPS devices set up on a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Sources with their latest reading. Secrets are never returned.
   */
  router.get("/:hostId/sources", async (req, res) => {
    try {
      const hostId = hostOf(req);
      const settings = await gate(hostId, "connect");
      const rows = await store.forHost(hostId);
      const canEdit =
        !settings.readOnly &&
        (await ctx.hosts.checkAccess(hostId, "edit")).hasAccess;
      res.json({
        canEdit,
        sources: await Promise.all(rows.map((row) => service.view(row))),
      });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources:
   *   post:
   *     summary: Add a UPS to a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The new source.
   */
  router.post("/:hostId/sources", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const parsed = parseSource(body(req));
      if ((await store.forHost(hostId)).length >= MAX_SOURCES_PER_HOST) {
        throw new UpsError(
          `A host can have up to ${MAX_SOURCES_PER_HOST} UPS devices`,
        );
      }
      const row = await store.create(
        hostId,
        String(ctx.currentActor() ?? ""),
        parsed,
      );
      await engine.refresh(row).catch(() => undefined);
      res.json(await service.view(row));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}:
   *   put:
   *     summary: Change a UPS
   *     description: Secrets left out are kept. Send clearSecrets to remove them.
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The changed source.
   */
  router.put("/:hostId/sources/:id", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      const parsed = parseSource(body(req));
      await store.update(row, parsed, body(req).clearSecrets === true);
      const changed = (await store.get(row.id)) ?? row;
      await engine.refresh(changed).catch(() => undefined);
      res.json(await service.view(changed));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}:
   *   delete:
   *     summary: Remove a UPS and its history
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Removed.
   */
  router.delete("/:hostId/sources/:id", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      await store.remove(row.id);
      engine.forget(row.id);
      res.json({ ok: true });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/test-source:
   *   post:
   *     summary: Read a UPS with the given settings without saving it
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The reading.
   */
  router.post("/:hostId/test-source", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const parsed = parseSource(body(req));
      let secrets: SourceSecrets = parsed.secrets;
      const existing = Number(body(req).id);
      if (Number.isInteger(existing) && existing > 0) {
        const row = await service.source(hostId, existing);
        secrets = { ...(await store.openSecrets(row)), ...parsed.secrets };
      }
      const reading = await readTarget(
        remote,
        {
          hostId,
          backend: parsed.backend,
          target: parsed.target,
          snmpVersion: parsed.snmpVersion,
        },
        secrets,
      );
      res.json({ reading });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}/status:
   *   get:
   *     summary: Read a UPS now
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The source with a fresh reading.
   */
  router.get("/:hostId/sources/:id/status", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      await engine.refresh(row);
      res.json(await service.view(row));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}/history:
   *   get:
   *     summary: Charge, runtime, load and voltage over time
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *       - in: query
   *         name: range
   *         schema: { type: string, enum: ["24h", "7d", "30d"] }
   *     responses:
   *       200:
   *         description: Points, oldest first.
   */
  router.get("/:hostId/sources/:id/history", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      const asked = String(req.query.range ?? "24h") as HistoryRange;
      const range = RANGES.includes(asked) ? asked : "24h";
      res.json({ range, points: history.range(row.id, range) });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}/events:
   *   get:
   *     summary: Power events for a UPS, newest first
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Up to 100 events.
   */
  router.get("/:hostId/sources/:id/events", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      res.json(await store.events(row.id, 100));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}/commands:
   *   get:
   *     summary: Instant commands a NUT UPS supports
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Command names with a risk level.
   */
  router.get("/:hostId/sources/:id/commands", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      res.json(await service.commands(row));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/ups-manager/{hostId}/sources/{id}/commands:
   *   post:
   *     summary: Send an instant command to a NUT UPS
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: What the UPS answered.
   */
  router.post("/:hostId/sources/:id/commands", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const row = await service.source(
        hostId,
        requireId(param(req, "id"), "UPS"),
      );
      const command = String(body(req).command ?? "");
      const output = await service.send(row, command);
      await store.addEvent(row.id, "command", `Ran ${command}`);
      res.json({ ok: true, output });
    } catch (error) {
      fail(ctx, res, error);
    }
  });
}
