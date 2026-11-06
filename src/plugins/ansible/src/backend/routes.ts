import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { RunBody } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import type { Service } from "./service.js";

/**
 * Mounts the Ansible routes, served at /plugin-api/ansible with auth and the
 * ansible.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: Service,
): void {
  const { read, reveal, write, canEdit } = createHttp(router, ctx);
  const file = (req: Request) => str(req.query.path) || str(body(req).path);

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/status:
   *   get:
   *     summary: Ansible status on a control host
   *     description: Whether Ansible is installed, its version, the project folder and whether sshpass exists.
   *     tags:
   *       - Ansible
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
    read(async (hostId, _req, s) => ({
      ...(await service.status(hostId, s)),
      canEdit: await canEdit(hostId, s),
      readOnly: s.readOnly,
    })),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/files:
   *   get:
   *     summary: List the files in the project folder
   *     description: Playbooks, roles, variables and templates, up to four folders deep. Playbooks are flagged.
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The files.
   */
  router.get(
    "/:hostId/files",
    read((hostId, _req, s) => service.files(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/file:
   *   get:
   *     summary: Read a project file
   *     description: Needs edit access to the host.
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The path and its text.
   */
  router.get(
    "/:hostId/file",
    reveal(async (hostId, req, s) => ({
      path: file(req),
      text: await service.readFile(hostId, s, file(req)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/file:
   *   put:
   *     summary: Save a project file
   *     description: A playbook is syntax checked on a temporary copy first, and the old file stays when the check fails.
   *     tags:
   *       - Ansible
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
   *             required: [path, text]
   *             properties:
   *               path:
   *                 type: string
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: Saved.
   *       400:
   *         description: The path is not valid or the syntax check failed.
   */
  router.put(
    "/:hostId/file",
    write(
      "file.save",
      async (hostId, req, s) => {
        await service.writeFile(hostId, s, file(req), str(body(req).text));
      },
      file,
    ),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/file:
   *   delete:
   *     summary: Delete a project file
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/:hostId/file",
    write(
      "file.delete",
      async (hostId, req, s) => {
        await service.deleteFile(hostId, s, file(req));
      },
      file,
    ),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/targets:
   *   get:
   *     summary: Hosts that can be used as the inventory
   *     description: Termix hosts the caller has edit access to, with their folder and tags.
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The hosts.
   */
  router.get(
    "/:hostId/targets",
    reveal(async () => ({ targets: await service.targets() })),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs:
   *   get:
   *     summary: List recent runs
   *     description: The newest 60 runs kept on the control host.
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The runs.
   */
  router.get(
    "/:hostId/runs",
    read(async (hostId) => ({ runs: await service.runs(hostId) })),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs:
   *   post:
   *     summary: Start a run
   *     description: Runs a playbook, an ad-hoc module or a facts gather on the control host. Needs edit access to the control host and to every Termix host picked as a target.
   *     tags:
   *       - Ansible
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
   *             required: [kind]
   *             properties:
   *               kind:
   *                 type: string
   *                 enum: [playbook, adhoc, facts]
   *               playbook:
   *                 type: string
   *               hostIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               limit:
   *                 type: string
   *               tags:
   *                 type: string
   *               check:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The run that was started.
   *       400:
   *         description: A value is not valid, or Ansible is missing.
   */
  router.post(
    "/:hostId/runs",
    write(
      "run",
      (hostId, req, s) =>
        service.start(hostId, s, body(req) as unknown as RunBody),
      (req) => str(body(req).playbook) || str(body(req).module),
    ),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs/{runId}:
   *   get:
   *     summary: A run with its output
   *     description: The newest 200 KB of output and the recap per host. Needs edit access.
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The run.
   *       404:
   *         description: No such run.
   */
  router.get(
    "/:hostId/runs/:runId",
    reveal((hostId, req) => service.run(hostId, String(req.params.runId))),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs/{runId}/facts:
   *   get:
   *     summary: Facts from a finished facts run
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: One entry per host.
   */
  router.get(
    "/:hostId/runs/:runId/facts",
    reveal(async (hostId, req) => ({
      hosts: await service.facts(hostId, String(req.params.runId)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs/{runId}/cancel:
   *   post:
   *     summary: Stop a running run
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Stop was sent.
   */
  router.post(
    "/:hostId/runs/:runId/cancel",
    write(
      "cancel",
      async (hostId, req) => {
        await service.cancel(hostId, String(req.params.runId));
      },
      (req) => String(req.params.runId),
    ),
  );

  /**
   * @openapi
   * /plugin-api/ansible/{hostId}/runs/{runId}:
   *   delete:
   *     summary: Delete a finished run
   *     tags:
   *       - Ansible
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: runId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/:hostId/runs/:runId",
    write(
      "run.delete",
      async (hostId, req) => {
        await service.remove(hostId, String(req.params.runId));
      },
      (req) => String(req.params.runId),
    ),
  );
}
