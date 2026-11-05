import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type { JobBody } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import { cleanFileName, cleanUser } from "./scripts.js";
import type { CronService } from "./service.js";

const ID_RE = /^[0-9a-f]{8}(-\d+)?$/;

function jobId(req: Request): string {
  const id = String(req.params.id ?? "");
  if (!ID_RE.test(id)) throw new HostScriptError("The job id is not valid");
  return id;
}

/**
 * Mounts the Cron routes, served at /plugin-api/cron with auth and the
 * cron.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: CronService,
): void {
  const { read, write, canEdit } = createHttp(router, ctx);

  // Another user's crontab can hold secrets, so reading one needs edit access.
  const userFrom = async (hostId: number, value: unknown) => {
    const user = cleanUser(value);
    if (user && !(await ctx.hosts.checkAccess(hostId, "edit")).hasAccess) {
      throw new HostScriptError("You need edit access to this host", 403, {
        code: "HOST_EDIT_REQUIRED",
      });
    }
    return user;
  };
  const target = (req: Request) =>
    [str(body(req).user) || str(req.query.user), req.params.id]
      .filter(Boolean)
      .join("/");

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/status:
   *   get:
   *     summary: Cron status on a host
   *     description: The login user, whether cron is installed and running, the host time zone and the users whose crontab can be picked.
   *     tags:
   *       - Cron
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
    read(async (hostId, _req, s) => {
      const status = await service.status(hostId, s);
      const edit = await canEdit(hostId, s);
      return {
        ...status,
        users: edit ? status.users : [],
        canEdit: edit,
        readOnly: s.readOnly,
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs:
   *   get:
   *     summary: List the jobs in a crontab
   *     description: The login user's crontab, or another user's with ?user= (needs edit access and root or sudo).
   *     tags:
   *       - Cron
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: user
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The jobs and the raw crontab.
   */
  router.get(
    "/:hostId/jobs",
    read(async (hostId, req, s) =>
      service.crontab(hostId, s, await userFrom(hostId, req.query.user)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs:
   *   post:
   *     summary: Add a job
   *     tags:
   *       - Cron
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
   *             required: [schedule, command]
   *             properties:
   *               user:
   *                 type: string
   *               schedule:
   *                 type: string
   *               command:
   *                 type: string
   *               label:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The crontab after the change.
   *       400:
   *         description: The schedule or command is not valid.
   */
  router.post(
    "/:hostId/jobs",
    write(
      "add",
      async (hostId, req, s) =>
        service.add(
          hostId,
          s,
          cleanUser(body(req).user),
          body(req) as unknown as JobBody,
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs/{id}:
   *   put:
   *     summary: Change a job
   *     tags:
   *       - Cron
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
   *           type: string
   *     responses:
   *       200:
   *         description: The crontab after the change.
   *       409:
   *         description: The job changed on the host since it was read.
   */
  router.put(
    "/:hostId/jobs/:id",
    write(
      "update",
      async (hostId, req, s) =>
        service.update(
          hostId,
          s,
          cleanUser(body(req).user),
          jobId(req),
          body(req) as unknown as JobBody,
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs/{id}/state:
   *   post:
   *     summary: Turn a job on or off
   *     description: An off job stays in the crontab as a comment.
   *     tags:
   *       - Cron
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
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               user:
   *                 type: string
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The crontab after the change.
   */
  router.post(
    "/:hostId/jobs/:id/state",
    write(
      "toggle",
      async (hostId, req, s) =>
        service.setEnabled(
          hostId,
          s,
          cleanUser(body(req).user),
          jobId(req),
          body(req).enabled === true,
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs/{id}:
   *   delete:
   *     summary: Delete a job
   *     tags:
   *       - Cron
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
   *           type: string
   *       - in: query
   *         name: user
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The crontab after the change.
   */
  router.delete(
    "/:hostId/jobs/:id",
    write(
      "delete",
      async (hostId, req, s) =>
        service.remove(hostId, s, cleanUser(req.query.user), jobId(req)),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/jobs/{id}/run:
   *   post:
   *     summary: Run a job now
   *     description: Runs the job's command once as the crontab's user and returns its output. Stops after 2 minutes.
   *     tags:
   *       - Cron
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
   *           type: string
   *     responses:
   *       200:
   *         description: The output and exit code.
   */
  router.post(
    "/:hostId/jobs/:id/run",
    write(
      "run",
      async (hostId, req, s) =>
        service.runNow(hostId, s, cleanUser(body(req).user), jobId(req)),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/crontab:
   *   put:
   *     summary: Replace a whole crontab
   *     description: crontab checks the text on the host and refuses it when it has errors.
   *     tags:
   *       - Cron
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
   *             required: [text]
   *             properties:
   *               user:
   *                 type: string
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: The crontab after the change.
   */
  router.put(
    "/:hostId/crontab",
    write(
      "save",
      async (hostId, req, s) =>
        service.saveRaw(
          hostId,
          s,
          cleanUser(body(req).user),
          str(body(req).text).replace(/\r\n/g, "\n"),
        ),
      target,
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/system:
   *   get:
   *     summary: System cron jobs
   *     description: /etc/crontab, the files in /etc/cron.d, the scripts in /etc/cron.hourly, daily, weekly and monthly, and the number of systemd timers.
   *     tags:
   *       - Cron
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The system jobs.
   */
  router.get(
    "/:hostId/system",
    read(async (hostId, _req, s) => service.system(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/system/{name}:
   *   put:
   *     summary: Create or replace a file in /etc/cron.d
   *     description: Every line is checked first. The old file is kept in /var/lib/termix-cron/backup.
   *     tags:
   *       - Cron
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
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.put(
    "/:hostId/system/:name",
    write(
      "system.save",
      async (hostId, req, s) => {
        await service.saveSystemFile(
          hostId,
          s,
          cleanFileName(req.params.name),
          str(body(req).text),
        );
        return { ok: true };
      },
      (req) => String(req.params.name ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/system/{name}:
   *   delete:
   *     summary: Delete a file in /etc/cron.d
   *     description: A copy is kept in /var/lib/termix-cron/backup.
   *     tags:
   *       - Cron
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
    "/:hostId/system/:name",
    write(
      "system.delete",
      async (hostId, req, s) => {
        await service.deleteSystemFile(
          hostId,
          s,
          cleanFileName(req.params.name),
        );
        return { ok: true };
      },
      (req) => String(req.params.name ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/cron/{hostId}/logs:
   *   get:
   *     summary: Recent cron log lines
   *     description: From the journal, /var/log/cron or syslog, whichever the host has.
   *     tags:
   *       - Cron
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
   *         description: The log text and where it came from.
   */
  router.get(
    "/:hostId/logs",
    read(async (hostId, req, s) =>
      service.logs(hostId, s, Number(req.query.lines) || 200),
    ),
  );
}
