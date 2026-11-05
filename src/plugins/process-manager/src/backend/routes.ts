import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { APP_ACTIONS, type WatchView } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import {
  cleanAppKey,
  cleanLines,
  cleanManager,
  cleanPid,
  cleanSignal,
  needsEdit,
  parseTarget,
} from "./scripts.js";
import type { ProcessService } from "./service.js";
import { MAX_WATCHES, type WatchChecker, type WatchStore } from "./watches.js";

export interface RouteDeps {
  service: ProcessService;
  watches: WatchStore;
  checker: WatchChecker;
}

const APP_VERBS = [...APP_ACTIONS, "delete", "flush"] as const;

/**
 * Mounts the Process Manager routes, served at /plugin-api/process-manager
 * with auth and the process-manager.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: RouteDeps,
): void {
  const { service, watches, checker } = deps;
  const { read, write, act, canEdit } = createHttp(router, ctx);
  const actor = () => String(ctx.currentActor() ?? "");
  const watchView = (w: Awaited<ReturnType<WatchStore["list"]>>[number]) =>
    ({
      id: w.id,
      hostId: w.hostId,
      kind: w.kind,
      target: w.target,
      rule: w.rule,
      threshold: w.threshold,
      autoRestart: w.autoRestart,
      state: checker.stateOf(w.id),
    }) satisfies WatchView;

  /**
   * @openapi
   * /plugin-api/process-manager/watches:
   *   get:
   *     summary: Every watch of the signed in user
   *     description: Across all hosts, with the last state seen. Used by the dashboard card.
   *     tags:
   *       - Process Manager
   *     responses:
   *       200:
   *         description: The watches.
   */
  router.get("/watches", async (_req, res) => {
    try {
      const rows = await watches.listForUser(actor());
      res.json({ watches: rows.map(watchView) });
    } catch {
      res.status(500).json({ error: "Something went wrong" });
    }
  });

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/status:
   *   get:
   *     summary: What a host offers
   *     description: The login user, whether ps, pm2, supervisor and systemd are there, and whether the caller may change things.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The status.
   *       404:
   *         description: No access to the host.
   */
  router.get(
    "/:hostId/status",
    read(async (hostId, _req, s) =>
      service.status(hostId, s, await canEdit(hostId, s)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/processes:
   *   get:
   *     summary: List running processes
   *     description: Up to 600 processes sorted by CPU, with the CPU count, load average and zombie count.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The processes.
   */
  router.get(
    "/:hostId/processes",
    read((hostId, _req, s) => service.processes(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/processes/{pid}:
   *   get:
   *     summary: One process in detail
   *     description: Command line, working directory, service, limits, listening ports and the files it writes.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: pid
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The process.
   */
  router.get(
    "/:hostId/processes/:pid",
    read((hostId, req, s) =>
      service.detail(hostId, s, cleanPid(req.params.pid)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/processes/{pid}/signal:
   *   post:
   *     summary: Send a signal to a process
   *     description: Needs edit access. The command guards against a reused pid.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: pid
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [signal]
   *             properties:
   *               signal:
   *                 type: string
   *               command:
   *                 type: string
   *     responses:
   *       200:
   *         description: The signal was sent.
   */
  router.post(
    "/:hostId/processes/:pid/signal",
    act(
      (req) =>
        cleanSignal(body(req).signal) === "KILL"
          ? "process-manager.kill-process"
          : "process-manager.signal-process",
      (req) => ({
        resourceKey: String(cleanPid(req.params.pid)),
        input: {
          signal: cleanSignal(body(req).signal),
          expectedCommand: str(body(req).command),
        },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/processes/{pid}/renice:
   *   post:
   *     summary: Change the priority of a process
   *     description: Needs edit access. Lower than 0 needs root.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: pid
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [nice]
   *             properties:
   *               nice:
   *                 type: integer
   *               command:
   *                 type: string
   *     responses:
   *       200:
   *         description: The priority was changed.
   */
  router.post(
    "/:hostId/processes/:pid/renice",
    act(
      () => "process-manager.renice",
      (req) => ({
        resourceKey: String(cleanPid(req.params.pid)),
        input: {
          nice: Number(body(req).nice),
          expectedCommand: str(body(req).command),
        },
      }),
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/apps:
   *   get:
   *     summary: List pm2 and supervisor apps
   *     description: Which of the two exist on the host and every app they run.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The apps.
   */
  router.get(
    "/:hostId/apps",
    read((hostId, _req, s) => service.managers(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/apps/{manager}/{key}/{action}:
   *   post:
   *     summary: Start, stop, restart, reload, delete or flush logs of an app
   *     description: manager is pm2 or supervisor. Delete is pm2 only. Needs edit access.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: manager
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: key
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: action
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The action ran.
   */
  router.post(
    "/:hostId/apps/:manager/:key/:action",
    act(
      (req) => {
        const verb = String(req.params.action);
        if (!(APP_VERBS as readonly string[]).includes(verb)) {
          throw new HostScriptError("The action is not valid");
        }
        return verb === "flush"
          ? "process-manager.app-flush-logs"
          : `process-manager.app-${verb}`;
      },
      (req) => {
        const manager = cleanManager(req.params.manager);
        return {
          resourceKey: `${manager}:${cleanAppKey(manager, req.params.key)}`,
        };
      },
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/supervisor-refresh:
   *   post:
   *     summary: Read the supervisor config again
   *     description: Runs supervisorctl reread and update. Needs edit access.
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The config was read again.
   */
  router.post(
    "/:hostId/supervisor-refresh",
    write("supervisor-refresh", (hostId, _req, settings) =>
      service.supervisorRefresh(hostId, settings),
    ),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/logs:
   *   post:
   *     summary: Read the end of a log
   *     description: Sources are a service journal, a pid journal, a pm2 app, a supervisor process stream, or a file a process has open for writing. Open files need edit access.
   *     tags:
   *       - Process Manager
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
   *             required: [target]
   *             properties:
   *               target:
   *                 type: object
   *               lines:
   *                 type: integer
   *               grep:
   *                 type: string
   *     responses:
   *       200:
   *         description: The log text.
   */
  router.post(
    "/:hostId/logs",
    read(async (hostId, req, s) => {
      const target = parseTarget(body(req).target);
      if (
        needsEdit(target) &&
        !(await ctx.hosts.checkAccess(hostId, "edit")).hasAccess
      ) {
        throw new HostScriptError(
          "You need edit access to read open files",
          403,
          {
            code: "HOST_EDIT_REQUIRED",
          },
        );
      }
      return service.logs(
        hostId,
        s,
        target,
        cleanLines(body(req).lines),
        str(body(req).grep),
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/watches:
   *   get:
   *     summary: The signed in user's watches on a host
   *     tags:
   *       - Process Manager
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The watches.
   */
  router.get(
    "/:hostId/watches",
    read(async (hostId) => ({
      watches: (await watches.list(actor(), hostId)).map(watchView),
      max: MAX_WATCHES,
    })),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/watches:
   *   post:
   *     summary: Add a watch
   *     description: Alerts when a process, pm2 app or supervisor app goes down, restarts too often or uses too much CPU or memory. An app that goes down can be restarted automatically, at most three times an hour.
   *     tags:
   *       - Process Manager
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
   *             required: [kind, target]
   *             properties:
   *               kind:
   *                 type: string
   *               target:
   *                 type: string
   *               rule:
   *                 type: string
   *               threshold:
   *                 type: integer
   *               autoRestart:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The updated list.
   */
  router.post(
    "/:hostId/watches",
    read(async (hostId, req: Request) => {
      await watches.add(actor(), hostId, body(req) as never);
      return {
        watches: (await watches.list(actor(), hostId)).map(watchView),
        max: MAX_WATCHES,
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/process-manager/{hostId}/watches/{id}:
   *   delete:
   *     summary: Remove a watch
   *     tags:
   *       - Process Manager
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
   *         description: The updated list.
   */
  router.delete(
    "/:hostId/watches/:id",
    read(async (hostId, req: Request) => {
      await watches.remove(actor(), Number(req.params.id));
      return {
        watches: (await watches.list(actor(), hostId)).map(watchView),
        max: MAX_WATCHES,
      };
    }),
  );
}
