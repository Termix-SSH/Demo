import { randomBytes } from "node:crypto";
import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  HistoryPoint,
  HistoryRange,
  IncidentView,
  MaintenanceInput,
  MaintenanceView,
  MonitorInput,
  NoteLevel,
  PublicPage,
  ShareGrant,
  StatusGroup,
  StatusPageInput,
  StatusPageView,
} from "../shared/types.js";
import { errorText, type CheckTarget } from "./checks/types.js";
import type { BeatStore } from "./beats.js";
import { hashToken, type Entry, type UptimeEngine } from "./engine.js";
import {
  maintenanceProblem,
  windowActive,
  type MaintenanceWindow,
} from "./maintenance.js";
import type { PageRow, Repository } from "./repository.js";
import { DAY_MS, type RollupStore } from "./rollups.js";
import { AccessError, type MonitorService } from "./service.js";
import { buildPublicPage, pageCsp, renderStatusPage } from "./status-page.js";
import { BlockedTargetError } from "./target-guard.js";
import { InputError, cleanText, parseMonitor, parseSlug } from "./validate.js";
import { accessReader } from "./views.js";

const PAGE_CACHE_MS = 30_000;
const MAX_LIST = 200;

export const PUBLIC_ROUTES = [
  "/push/:token",
  "/status/:slug",
  "/status/:slug/data",
];
export const PUBLIC_RATE_LIMIT = 600;

export interface RouteDeps {
  repo: Repository;
  engine: UptimeEngine;
  monitors: MonitorService;
  rollups: RollupStore;
  beats: BeatStore;
}

function fail(ctx: PluginContext, res: Response, error: unknown) {
  if (error instanceof InputError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof BlockedTargetError) {
    return res.status(403).json({ error: error.message, code: error.code });
  }
  if (error instanceof AccessError) {
    return res.status(error.status).json({ error: error.message });
  }
  ctx.log.error(`Uptime route failed: ${errorText(error)}`);
  return res.status(500).json({ error: "Something went wrong" });
}

function idOf(req: Request, name = "id"): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id < 1) throw new InputError("Bad id");
  return id;
}

function parseGrants(raw: unknown): ShareGrant[] {
  if (!Array.isArray(raw)) throw new InputError("A list of shares is required");
  return raw.map((item) => {
    const grant = item as ShareGrant;
    const level = grant.level === "edit" ? "edit" : "view";
    const userId = typeof grant.userId === "string" ? grant.userId : null;
    const roleId = Number.isInteger(grant.roleId) ? grant.roleId : null;
    if (!userId === !roleId) throw new InputError("Pick a user or a role");
    return { userId, roleId, level };
  });
}

function parseWindow(raw: unknown): MaintenanceInput {
  const body = (raw ?? {}) as MaintenanceInput;
  const input: MaintenanceInput = {
    name: cleanText(body.name, 120),
    scope:
      body.scope === "monitors" || body.scope === "tag" ? body.scope : "all",
    monitorKeys: Array.isArray(body.monitorKeys)
      ? body.monitorKeys.filter((key) => typeof key === "string").slice(0, 500)
      : [],
    tag: cleanText(body.tag, 60),
    kind: body.kind === "weekly" ? "weekly" : "once",
    startsAt: Number(body.startsAt) || undefined,
    endsAt: Number(body.endsAt) || undefined,
    days: Array.isArray(body.days)
      ? [
          ...new Set(
            body.days.filter(
              (day) => Number.isInteger(day) && day >= 0 && day <= 6,
            ),
          ),
        ]
      : [],
    startMinute: Math.min(1439, Math.max(0, Number(body.startMinute) || 0)),
    durationMinutes: Math.min(
      10_080,
      Math.max(0, Number(body.durationMinutes) || 0),
    ),
    timezone: cleanText(body.timezone, 64) || "UTC",
    enabled: body.enabled !== false,
  };
  const problem = maintenanceProblem(input);
  if (problem) throw new InputError(problem);
  return input;
}

function parsePage(raw: unknown): StatusPageInput {
  const body = (raw ?? {}) as StatusPageInput;
  const title = cleanText(body.title, 120);
  if (!title) throw new InputError("A title is required");
  const groups: StatusGroup[] = (Array.isArray(body.groups) ? body.groups : [])
    .slice(0, 30)
    .map((group) => ({
      name: cleanText(group?.name, 120),
      monitorKeys: Array.isArray(group?.monitorKeys)
        ? group.monitorKeys
            .filter((key) => typeof key === "string")
            .slice(0, 200)
        : [],
    }));
  return {
    slug: parseSlug(body.slug),
    title,
    description: cleanText(body.description, 1000),
    published: body.published === true,
    showLatency: body.showLatency === true,
    groups,
  };
}

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: RouteDeps,
): void {
  const { repo, engine, monitors, rollups, beats } = deps;
  const view = ctx.rbac.require("view") as never;
  const manage = ctx.rbac.require("manage") as never;
  const publish = ctx.rbac.require("publish") as never;
  const pageCache = new Map<string, { at: number; data: PublicPage }>();

  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        await handler(req, res);
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  const pagesOn = async () => (await ctx.settings.get("publicPages")) !== false;

  /** Drops monitors the page's author can't edit any more. */
  async function loadPublic(slug: string): Promise<PublicPage | null> {
    if (!(await pagesOn())) return null;
    const cached = pageCache.get(slug);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.data;
    const page = await repo.pageBySlug(slug);
    if (!page?.published) {
      pageCache.delete(slug);
      return null;
    }
    const access = await accessReader(repo, page.userId);
    const lookup = (key: string): Entry | undefined => {
      const entry = engine.byKey(key);
      if (!entry) return undefined;
      const level = access(entry.row);
      return level === "owner" || level === "edit" ? entry : undefined;
    };
    const data = buildPublicPage(
      page,
      await repo.listNotes(page.id),
      lookup,
      rollups,
      Date.now(),
    );
    pageCache.set(slug, { at: Date.now(), data });
    return data;
  }

  /**
   * @openapi
   * /plugin-api/uptime/push/{token}:
   *   get:
   *     summary: Report that a job ran, for a push monitor
   *     tags:
   *       - Uptime
   *     security: []
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [up, down]
   *       - in: query
   *         name: msg
   *         schema:
   *           type: string
   *       - in: query
   *         name: ping
   *         schema:
   *           type: number
   *     responses:
   *       200:
   *         description: Recorded
   *       404:
   *         description: Unknown token
   *   post:
   *     summary: Report that a job ran, for a push monitor
   *     tags:
   *       - Uptime
   *     security: []
   *     parameters:
   *       - in: path
   *         name: token
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Recorded
   *       404:
   *         description: Unknown token
   */
  const pushRoute = wrap(async (req, res) => {
    const entry = engine.byPushHash(hashToken(String(req.params.token)));
    if (!entry || !entry.row.enabled) {
      return res.status(404).json({ error: "Unknown push URL" });
    }
    const input = { ...req.query, ...(req.body ?? {}) } as Record<
      string,
      unknown
    >;
    const ping = Number(input.ping);
    await engine.push(entry, {
      ok: input.status !== "down",
      message: cleanText(input.msg, 200),
      latencyMs: Number.isFinite(ping) && ping >= 0 ? ping : null,
    });
    res.json({ ok: true });
  });
  router.get("/push/:token", pushRoute);
  router.post("/push/:token", pushRoute);

  /**
   * @openapi
   * /plugin-api/uptime/status/{slug}:
   *   get:
   *     summary: A published status page as HTML
   *     tags:
   *       - Uptime
   *     security: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The page
   *       404:
   *         description: No such published page
   */
  router.get(
    "/status/:slug",
    wrap(async (req, res) => {
      const data = await loadPublic(String(req.params.slug));
      if (!data) return res.status(404).type("text/plain").send("Not found");
      const nonce = randomBytes(16).toString("base64");
      res
        .set({
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": pageCsp(nonce),
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        })
        .send(renderStatusPage(data, nonce));
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/status/{slug}/data:
   *   get:
   *     summary: A published status page as JSON
   *     tags:
   *       - Uptime
   *     security: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Names, states and uptime numbers
   *       404:
   *         description: No such published page
   */
  router.get(
    "/status/:slug/data",
    wrap(async (req, res) => {
      const data = await loadPublic(String(req.params.slug));
      if (!data) return res.status(404).json({ error: "Not found" });
      res.json(data);
    }),
  );

  router.use(view);

  /**
   * @openapi
   * /plugin-api/uptime/summary:
   *   get:
   *     summary: Totals for the monitors the user can see
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Counts by status and the 30 day uptime
   */
  router.get(
    "/summary",
    wrap(async (_req, res) => res.json(await monitors.summary())),
  );

  /**
   * @openapi
   * /plugin-api/uptime/permissions:
   *   get:
   *     summary: What the user may do here, and the server limits
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Permission flags and limits
   */
  router.get(
    "/permissions",
    wrap(async (_req, res) => {
      res.json({
        manage: await ctx.rbac.has("manage"),
        privateTargets: await ctx.rbac.has("private-targets"),
        runCommands: await ctx.rbac.has("run-commands"),
        publish: await ctx.rbac.has("publish"),
        publicPages: await pagesOn(),
        ...(await monitors.limits()),
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors:
   *   get:
   *     summary: List the monitors the user owns or was shared
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Monitors with live state
   *   post:
   *     summary: Add a monitor
   *     tags:
   *       - Uptime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: The new monitor. A push monitor's URL is only in this answer
   *       400:
   *         description: Bad input
   *       403:
   *         description: A private address or a host the user can't use
   */
  router.get(
    "/monitors",
    wrap(async (_req, res) => res.json({ monitors: await monitors.list() })),
  );
  router.post(
    "/monitors",
    manage,
    wrap(async (req, res) =>
      res.status(201).json(await monitors.create(req.body, req)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/hosts:
   *   post:
   *     summary: Add a host monitor for each host in a list
   *     tags:
   *       - Uptime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               hostIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       200:
   *         description: How many were added
   */
  router.post(
    "/monitors/hosts",
    manage,
    wrap(async (req, res) => {
      const raw = (req.body?.hostIds ?? []) as unknown[];
      const hostIds = raw.filter((id): id is number => Number.isInteger(id));
      res.json({ added: await monitors.addHosts(hostIds.slice(0, 500)) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/test:
   *   post:
   *     summary: Run a check once without saving it
   *     tags:
   *       - Uptime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: The result
   *       400:
   *         description: Bad input
   *       403:
   *         description: A private address or a host the user can't use
   */
  router.post(
    "/monitors/test",
    manage,
    wrap(async (req, res) => {
      const input: MonitorInput = parseMonitor(
        req.body,
        await monitors.limits(),
      );
      await monitors.authorize(input);
      const storedId = Number(req.body?.monitorId);
      let secrets = input.secrets ?? {};
      if (storedId) {
        const { entry } = await monitors.need(storedId, "edit");
        secrets = { ...entry.secrets, ...input.secrets };
      }
      const target: CheckTarget = {
        id: -Date.now(),
        type: input.type,
        config: input.config,
        secrets,
        hostId: input.hostId ?? null,
        fromHostId: input.fromHostId ?? null,
        intervalSec: input.intervalSec ?? 60,
        timeoutSec: input.timeoutSec ?? 10,
        runAs: ctx.currentActor() as string,
      };
      const signal = AbortSignal.timeout((target.timeoutSec + 15) * 1000);
      res.json(await engine.test(target, signal));
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}:
   *   get:
   *     summary: One monitor with its recent checks
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The monitor
   *       404:
   *         description: Not found
   *   put:
   *     summary: Change a monitor
   *     tags:
   *       - Uptime
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
   *         description: The changed monitor
   *       400:
   *         description: Bad input
   *       403:
   *         description: No edit access, a private address or a host the user can't use
   *   delete:
   *     summary: Delete a monitor and its history
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   *       403:
   *         description: Only the owner can delete it
   */
  router.get(
    "/monitors/:id",
    wrap(async (req, res) => {
      res.json(await monitors.one(idOf(req), 1440));
    }),
  );
  router.put(
    "/monitors/:id",
    manage,
    wrap(async (req, res) => {
      res.json(await monitors.update(idOf(req), req.body));
    }),
  );
  router.delete(
    "/monitors/:id",
    manage,
    wrap(async (req, res) => {
      await monitors.remove(idOf(req));
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/run:
   *   post:
   *     summary: Check a monitor now
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The monitor after the check
   */
  router.post(
    "/monitors/:id/run",
    manage,
    wrap(async (req, res) => {
      const id = idOf(req);
      await monitors.need(id, "edit");
      await engine.runNow(id);
      res.json(await monitors.one(id));
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/pause:
   *   post:
   *     summary: Pause or resume a monitor
   *     tags:
   *       - Uptime
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
   *               paused:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The monitor
   */
  router.post(
    "/monitors/:id/pause",
    manage,
    wrap(async (req, res) => {
      res.json(await monitors.setPaused(idOf(req), req.body?.paused === true));
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/watch:
   *   post:
   *     summary: Turn alerts for a monitor on or off for the user
   *     tags:
   *       - Uptime
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
   *               on:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved
   */
  router.post(
    "/monitors/:id/watch",
    wrap(async (req, res) => {
      const id = idOf(req);
      const { userId } = await monitors.need(id, "view");
      await engine.setWatch(id, userId, req.body?.on === true);
      res.json({ watching: req.body?.on === true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/push-url:
   *   post:
   *     summary: Make a new push URL, which stops the old one working
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The new URL. It is only shown here
   */
  router.post(
    "/monitors/:id/push-url",
    manage,
    wrap(async (req, res) => {
      res.json({ pushUrl: await monitors.newPushToken(idOf(req), req) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/history:
   *   get:
   *     summary: Uptime and response time over a range
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: range
   *         schema:
   *           type: string
   *           enum: [day, week, month, quarter]
   *     responses:
   *       200:
   *         description: Points, oldest first
   */
  router.get(
    "/monitors/:id/history",
    wrap(async (req, res) => {
      const id = idOf(req);
      await monitors.need(id, "view");
      const range = String(req.query.range ?? "day") as HistoryRange;
      const now = Date.now();
      let points: HistoryPoint[];
      if (range === "day") {
        points = beats
          .list(id, 1440, Math.floor((now - DAY_MS) / 1000))
          .map((beat) => ({
            t: beat.t,
            up: beat.s === "up" ? 1 : 0,
            down: beat.s === "down" ? 1 : 0,
            ms: beat.ms,
            min: beat.ms,
            max: beat.ms,
          }));
      } else if (range === "week") {
        points = rollups.history(id, "hour", 7 * DAY_MS, now);
      } else {
        const days = range === "month" ? 30 : 90;
        points = rollups.history(id, "day", days * DAY_MS, now);
      }
      res.json({ range, points });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/monitors/{id}/shares:
   *   get:
   *     summary: Who a monitor is shared with
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The shares
   *   put:
   *     summary: Replace who a monitor is shared with
   *     tags:
   *       - Uptime
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
   *         description: Saved
   *       403:
   *         description: Only the owner can share it
   */
  router.get(
    "/monitors/:id/shares",
    wrap(async (req, res) => {
      const id = idOf(req);
      await monitors.need(id, "owner");
      const grants = await repo.listAllGrants();
      res.json({ shares: grants.filter((grant) => grant.monitorId === id) });
    }),
  );
  router.put(
    "/monitors/:id/shares",
    manage,
    wrap(async (req, res) => {
      const id = idOf(req);
      const { userId } = await monitors.need(id, "owner");
      await repo.setGrants(id, parseGrants(req.body?.shares), userId);
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/share-targets:
   *   get:
   *     summary: Users and roles a monitor can be shared with
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Users and roles
   */
  router.get(
    "/share-targets",
    wrap(async (_req, res) => {
      res.json({
        users: await ctx.hosts.listUsers(),
        roles: await ctx.hosts.listRoles(),
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/hosts/{hostId}/monitors:
   *   get:
   *     summary: Monitors tied to a host
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Monitors
   */
  router.get(
    "/hosts/:hostId/monitors",
    wrap(async (req, res) => {
      res.json({ monitors: await monitors.hostViews(idOf(req, "hostId")) });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/incidents:
   *   get:
   *     summary: Outages of the monitors the user can see, newest first
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: query
   *         name: monitorId
   *         schema:
   *           type: integer
   *       - in: query
   *         name: before
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Incidents
   */
  router.get(
    "/incidents",
    wrap(async (req, res) => {
      const visible = await monitors.list();
      const names = new Map(visible.map((m) => [m.id, m.name]));
      const only = Number(req.query.monitorId);
      const ids = only ? visible.filter((m) => m.id === only) : visible;
      const rows = await repo.listIncidents(
        ids.map((m) => m.id),
        Math.min(Number(req.query.limit) || 50, MAX_LIST),
        Number(req.query.before) || undefined,
      );
      const incidents: IncidentView[] = rows.map((row) => ({
        ...row,
        monitorName: names.get(row.monitorId) ?? "",
      }));
      res.json({ incidents });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/incidents/{id}/ack:
   *   post:
   *     summary: Mark an incident as seen and add a note
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               note:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved
   *       404:
   *         description: Not found
   */
  router.post(
    "/incidents/:id/ack",
    manage,
    wrap(async (req, res) => {
      const incident = await repo.getIncident(idOf(req));
      if (!incident) return res.status(404).json({ error: "Not found" });
      const { userId } = await monitors.need(incident.monitorId, "edit");
      await repo.ackIncident(
        incident.id,
        userId,
        cleanText(req.body?.note, 1000),
      );
      res.json({ success: true });
    }),
  );

  const windowView = (window: MaintenanceWindow): MaintenanceView => ({
    ...window,
    active: windowActive(window, Date.now()),
  });

  /** A window can only cover monitors its author can edit. */
  async function checkWindow(input: MaintenanceInput, userId: string) {
    if (input.scope !== "monitors") return;
    const access = await accessReader(repo, userId);
    for (const key of input.monitorKeys ?? []) {
      const entry = engine.byKey(key);
      const level = entry ? access(entry.row) : null;
      if (level !== "owner" && level !== "edit") {
        throw new AccessError("You can't change one of those monitors", 403);
      }
    }
  }

  /**
   * @openapi
   * /plugin-api/uptime/maintenance:
   *   get:
   *     summary: The user's maintenance windows
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Windows
   *   post:
   *     summary: Add a maintenance window
   *     tags:
   *       - Uptime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: Added
   *       400:
   *         description: Bad input
   */
  router.get(
    "/maintenance",
    wrap(async (_req, res) => {
      const userId = ctx.currentActor();
      res.json({
        windows: engine
          .listWindows()
          .filter((window) => window.userId === userId)
          .map(windowView),
      });
    }),
  );
  router.post(
    "/maintenance",
    manage,
    wrap(async (req, res) => {
      const userId = ctx.currentActor() as string;
      const input = parseWindow(req.body);
      await checkWindow(input, userId);
      await repo.saveWindow(userId, input);
      await engine.refreshWindows();
      res.status(201).json({ success: true });
    }),
  );

  const ownWindow = (req: Request): MaintenanceWindow => {
    const id = idOf(req);
    const window = engine
      .listWindows()
      .find((row) => row.id === id && row.userId === ctx.currentActor());
    if (!window) throw new AccessError("Not found", 404);
    return window;
  };

  /**
   * @openapi
   * /plugin-api/uptime/maintenance/{id}:
   *   put:
   *     summary: Change a maintenance window
   *     tags:
   *       - Uptime
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
   *         description: Saved
   *       404:
   *         description: Not found
   *   delete:
   *     summary: Delete a maintenance window
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   *       404:
   *         description: Not found
   */
  router.put(
    "/maintenance/:id",
    manage,
    wrap(async (req, res) => {
      const window = ownWindow(req);
      const input = parseWindow(req.body);
      await checkWindow(input, window.userId);
      await repo.saveWindow(window.userId, input, window.id);
      await engine.refreshWindows();
      res.json({ success: true });
    }),
  );
  router.delete(
    "/maintenance/:id",
    manage,
    wrap(async (req, res) => {
      await repo.deleteWindow(ownWindow(req).id);
      await engine.refreshWindows();
      res.json({ success: true });
    }),
  );

  const pageView = (req: Request, page: PageRow): StatusPageView => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    published: page.published,
    showLatency: page.showLatency,
    groups: page.groups,
    url: `${ctx.http.baseUrl(req as never)}/plugin-api/uptime/status/${page.slug}`,
  });

  async function checkPageMonitors(input: StatusPageInput, userId: string) {
    const access = await accessReader(repo, userId);
    for (const key of input.groups.flatMap((group) => group.monitorKeys)) {
      const entry = engine.byKey(key);
      const level = entry ? access(entry.row) : null;
      if (level !== "owner" && level !== "edit") {
        throw new AccessError("You can't publish one of those monitors", 403);
      }
    }
  }

  async function ownPage(req: Request): Promise<PageRow> {
    const page = await repo.pageById(idOf(req));
    if (!page || page.userId !== ctx.currentActor()) {
      throw new AccessError("Page not found", 404);
    }
    return page;
  }

  const slugTaken = async (slug: string, id?: number) => {
    const other = await repo.pageBySlug(slug);
    return !!other && other.id !== id;
  };

  /**
   * @openapi
   * /plugin-api/uptime/pages:
   *   get:
   *     summary: The user's status pages
   *     tags:
   *       - Uptime
   *     responses:
   *       200:
   *         description: Pages
   *   post:
   *     summary: Add a status page
   *     tags:
   *       - Uptime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       201:
   *         description: Added
   *       400:
   *         description: Bad input
   *       409:
   *         description: That address is taken
   */
  router.get(
    "/pages",
    publish,
    wrap(async (req, res) => {
      const userId = ctx.currentActor();
      const pages = (await repo.listPages()).filter((p) => p.userId === userId);
      res.json({ pages: pages.map((page) => pageView(req, page)) });
    }),
  );
  router.post(
    "/pages",
    publish,
    wrap(async (req, res) => {
      const userId = ctx.currentActor() as string;
      const input = parsePage(req.body);
      await checkPageMonitors(input, userId);
      if (await slugTaken(input.slug)) {
        return res.status(409).json({ error: "That address is taken" });
      }
      await repo.savePage(userId, input);
      res.status(201).json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/pages/{id}:
   *   put:
   *     summary: Change a status page
   *     tags:
   *       - Uptime
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
   *         description: Saved
   *       404:
   *         description: Not found
   *       409:
   *         description: That address is taken
   *   delete:
   *     summary: Delete a status page and its notes
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   *       404:
   *         description: Not found
   */
  router.put(
    "/pages/:id",
    publish,
    wrap(async (req, res) => {
      const page = await ownPage(req);
      const input = parsePage(req.body);
      await checkPageMonitors(input, page.userId);
      if (await slugTaken(input.slug, page.id)) {
        return res.status(409).json({ error: "That address is taken" });
      }
      await repo.savePage(page.userId, input, page.id);
      pageCache.delete(page.slug);
      pageCache.delete(input.slug);
      res.json({ success: true });
    }),
  );
  router.delete(
    "/pages/:id",
    publish,
    wrap(async (req, res) => {
      const page = await ownPage(req);
      await repo.deletePage(page.id);
      pageCache.delete(page.slug);
      res.json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/pages/{id}/notes:
   *   get:
   *     summary: Notes on a status page, newest first
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Notes
   *   post:
   *     summary: Post a note on a status page
   *     tags:
   *       - Uptime
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
   *       201:
   *         description: Posted
   *       400:
   *         description: Bad input
   */
  router.get(
    "/pages/:id/notes",
    publish,
    wrap(async (req, res) => {
      res.json({ notes: await repo.listNotes((await ownPage(req)).id) });
    }),
  );
  router.post(
    "/pages/:id/notes",
    publish,
    wrap(async (req, res) => {
      const page = await ownPage(req);
      const title = cleanText(req.body?.title, 160);
      if (!title) throw new InputError("A title is required");
      const raw = req.body?.level as NoteLevel;
      const level: NoteLevel =
        raw === "warning" || raw === "critical" ? raw : "info";
      await repo.addNote(page.id, {
        title,
        body: cleanText(req.body?.body, 4000),
        level,
      });
      pageCache.delete(page.slug);
      res.status(201).json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/uptime/pages/{id}/notes/{noteId}:
   *   post:
   *     summary: Mark a note as resolved
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: noteId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Saved
   *   delete:
   *     summary: Delete a note
   *     tags:
   *       - Uptime
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: noteId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted
   */
  router.post(
    "/pages/:id/notes/:noteId",
    publish,
    wrap(async (req, res) => {
      const page = await ownPage(req);
      await repo.resolveNote(page.id, idOf(req, "noteId"));
      pageCache.delete(page.slug);
      res.json({ success: true });
    }),
  );
  router.delete(
    "/pages/:id/notes/:noteId",
    publish,
    wrap(async (req, res) => {
      const page = await ownPage(req);
      await repo.deleteNote(page.id, idOf(req, "noteId"));
      pageCache.delete(page.slug);
      res.json({ success: true });
    }),
  );
}
