import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { body, createHttp, str, type Handler } from "./http.js";
import { cleanLogSource, type WebService } from "./service.js";
import { registerSummary, type SummaryCache } from "./summary.js";
import { cleanAction, cleanKind, cleanSiteName } from "./validate.js";
import type { WatchStore } from "./watches.js";

/**
 * Mounts the Web Servers routes, served at /plugin-api/web-servers with auth
 * and the web-servers.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: { service: WebService; summary: SummaryCache; watches: WatchStore },
): void {
  const { service, summary, watches } = deps;
  const { read, write, canEdit } = createHttp(router, ctx);
  registerSummary(router, ctx, summary);

  const site = (req: Request) => ({
    server: cleanKind(req.params.server),
    name: cleanSiteName(req.params.name),
  });
  const siteName = (req: Request) =>
    `${str(req.params.server)}:${str(req.params.name)}`;
  /** Runs a change and drops the cached summary for the host. */
  const fresh =
    (run: Handler): Handler =>
    async (hostId, req, s) => {
      try {
        return await run(hostId, req, s);
      } finally {
        summary.forget(hostId);
      }
    };

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/status:
   *   get:
   *     summary: Web servers on a host
   *     description: Which of nginx, Apache and Caddy are installed, their versions and state, certbot, php-fpm sockets and whether the caller gets alerts for this host.
   *     tags:
   *       - Web Servers
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
    "/:hostId/status",
    read(async (hostId, _req, s) => ({
      ...(await service.status(hostId, s)),
      watching: await watches.isWatching(
        String(ctx.currentActor() ?? ""),
        hostId,
      ),
      canEdit: await canEdit(hostId, s),
      readOnly: s.readOnly,
    })),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites:
   *   get:
   *     summary: Every site
   *     description: The site files of each installed server with their domains, ports, web root or app, HTTPS and certificate expiry.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The sites.
   */
  router.get(
    "/:hostId/sites",
    read(async (hostId, _req, s) => service.sites(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites/preview:
   *   post:
   *     summary: Show the config a site form makes
   *     description: Nothing is saved.
   *     tags:
   *       - Web Servers
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
   *             required: [server, name, spec]
   *             properties:
   *               server:
   *                 type: string
   *                 enum: [nginx, apache, caddy]
   *               name:
   *                 type: string
   *               spec:
   *                 type: object
   *     responses:
   *       200:
   *         description: The config text.
   */
  router.post(
    "/:hostId/sites/preview",
    read(async (hostId, req, s) => {
      const b = body(req);
      return service.preview(hostId, s, b.server, b.name, b.spec);
    }),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites:
   *   post:
   *     summary: Add a site
   *     description: Send spec to build the config from the site form, or content for your own text. The whole config is tested first and the server is reloaded only when the test passes.
   *     tags:
   *       - Web Servers
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
   *             required: [server, name]
   *             properties:
   *               server:
   *                 type: string
   *                 enum: [nginx, apache, caddy]
   *               name:
   *                 type: string
   *               spec:
   *                 type: object
   *               content:
   *                 type: string
   *     responses:
   *       200:
   *         description: The end of the test output.
   */
  router.post(
    "/:hostId/sites",
    write(
      "site.create",
      fresh(async (hostId, req, s) =>
        service.saveSite(
          hostId,
          s,
          body(req) as { server: unknown; name: unknown },
          true,
        ),
      ),
      (req) => `${str(body(req).server)}:${str(body(req).name)}`,
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites/{server}/{name}:
   *   get:
   *     summary: One site's file
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: server
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
   *         description: The path, text and site form values when it was made in Termix.
   */
  router.get(
    "/:hostId/sites/:server/:name",
    read(async (hostId, req, s) => {
      const { server, name } = site(req);
      return service.readSite(hostId, s, server, name);
    }),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites/{server}/{name}:
   *   put:
   *     summary: Change a site
   *     description: Send spec or content, like when adding one. A broken config is put back and the server keeps running the old one.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: server
   *         required: true
   *         schema:
   *           type: string
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
   *               spec:
   *                 type: object
   *               content:
   *                 type: string
   *     responses:
   *       200:
   *         description: The end of the test output.
   */
  router.put(
    "/:hostId/sites/:server/:name",
    write(
      "site.update",
      fresh(async (hostId, req, s) => {
        const b = body(req);
        return service.saveSite(
          hostId,
          s,
          {
            server: req.params.server,
            name: req.params.name,
            spec: b.spec,
            content: b.content,
          },
          false,
        );
      }),
      siteName,
    ),
  );

  for (const on of [true, false]) {
    const verb = on ? "enable" : "disable";
    /**
     * @openapi
     * /plugin-api/web-servers/{hostId}/sites/{server}/{name}/enable:
     *   post:
     *     summary: Turn a site on
     *     description: Links it into sites-enabled, or drops the .disabled ending. Tested before the reload.
     *     tags:
     *       - Web Servers
     *     parameters:
     *       - in: path
     *         name: hostId
     *         required: true
     *         schema:
     *           type: integer
     *       - in: path
     *         name: server
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
     *         description: The end of the test output.
     * /plugin-api/web-servers/{hostId}/sites/{server}/{name}/disable:
     *   post:
     *     summary: Turn a site off
     *     description: Removes its link from sites-enabled, or adds a .disabled ending. The file stays.
     *     tags:
     *       - Web Servers
     *     parameters:
     *       - in: path
     *         name: hostId
     *         required: true
     *         schema:
     *           type: integer
     *       - in: path
     *         name: server
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
     *         description: The end of the test output.
     */
    router.post(
      `/:hostId/sites/:server/:name/${verb}`,
      write(
        `site.${verb}`,
        fresh(async (hostId, req, s) => {
          const { server, name } = site(req);
          return service.toggleSite(hostId, s, server, name, on);
        }),
        siteName,
      ),
    );
  }

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites/{server}/{name}:
   *   delete:
   *     summary: Delete a site
   *     description: The file is kept as a backup in /var/lib/termix-web-servers/backups.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: server
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
   *         description: The end of the test output.
   */
  router.delete(
    "/:hostId/sites/:server/:name",
    write(
      "site.delete",
      fresh(async (hostId, req, s) => {
        const { server, name } = site(req);
        return service.deleteSite(hostId, s, server, name);
      }),
      siteName,
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/sites/{server}/{name}/certificate:
   *   post:
   *     summary: Get a Let's Encrypt certificate for a site
   *     description: Runs certbot with its nginx or Apache plugin for the site's domains and reloads the server when the certificate renews. A site made in the site form switches to HTTPS with it.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: server
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: name
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *               staging:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The end of certbot's output.
   */
  router.post(
    "/:hostId/sites/:server/:name/certificate",
    write(
      "site.certificate",
      fresh(async (hostId, req, s) => {
        const { server, name } = site(req);
        return service.issueCert(hostId, s, server, name, body(req));
      }),
      siteName,
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/files:
   *   get:
   *     summary: Config files of a server
   *     description: Every file under the server's folder in /etc.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: server
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Paths with their size.
   */
  router.get(
    "/:hostId/files",
    read(async (hostId, req, s) => service.files(hostId, s, req.query.server)),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/file:
   *   get:
   *     summary: Read a config file
   *     description: Only files under the server's folder. Lists the backups Termix kept of it too.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: server
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: path
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The text and backups.
   */
  router.get(
    "/:hostId/file",
    read(async (hostId, req, s) =>
      service.readFile(hostId, s, req.query.server, req.query.path),
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/file:
   *   put:
   *     summary: Save a config file
   *     description: Saves the text, or a backup when backup is set, then tests the whole config. A broken config is put back.
   *     tags:
   *       - Web Servers
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
   *             required: [server, path]
   *             properties:
   *               server:
   *                 type: string
   *               path:
   *                 type: string
   *               content:
   *                 type: string
   *               backup:
   *                 type: string
   *     responses:
   *       200:
   *         description: The end of the test output.
   */
  router.put(
    "/:hostId/file",
    write(
      "file.save",
      fresh(async (hostId, req, s) => {
        const b = body(req);
        return service.writeFile(
          hostId,
          s,
          b.server,
          b.path,
          b.content,
          b.backup,
        );
      }),
      (req) => str(body(req).path),
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/test:
   *   post:
   *     summary: Test a server's config
   *     description: Runs nginx -t, apachectl -t or caddy validate. Changes nothing.
   *     tags:
   *       - Web Servers
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
   *             required: [server]
   *             properties:
   *               server:
   *                 type: string
   *     responses:
   *       200:
   *         description: Whether it passed, with the output.
   */
  router.post(
    "/:hostId/test",
    read(async (hostId, req, s) => service.test(hostId, s, body(req).server)),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/service:
   *   post:
   *     summary: Start, stop, restart or reload a server
   *     description: enable and disable choose whether it starts at boot. Start, restart and reload test the config first.
   *     tags:
   *       - Web Servers
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
   *             required: [server, action]
   *             properties:
   *               server:
   *                 type: string
   *               action:
   *                 type: string
   *                 enum: [start, stop, restart, reload, enable, disable]
   *     responses:
   *       200:
   *         description: The service manager's output.
   */
  router.post(
    "/:hostId/service",
    write(
      "service",
      fresh(async (hostId, req, s) => {
        const b = body(req);
        return service.act(
          hostId,
          s,
          cleanKind(b.server),
          cleanAction(b.action),
        );
      }),
      (req) => `${str(body(req).server)} ${str(body(req).action)}`,
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/install:
   *   post:
   *     summary: Install a web server
   *     description: Uses the host's package manager and starts it at boot.
   *     tags:
   *       - Web Servers
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
   *             required: [server]
   *             properties:
   *               server:
   *                 type: string
   *                 enum: [nginx, apache, caddy]
   *     responses:
   *       200:
   *         description: The end of the package manager's output.
   */
  router.post(
    "/:hostId/install",
    write(
      "install",
      fresh(async (hostId, req, s) =>
        service.install(hostId, s, body(req).server),
      ),
      (req) => str(body(req).server),
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/install-certbot:
   *   post:
   *     summary: Install certbot
   *     description: With its plugin for each installed nginx or Apache.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The end of the package manager's output.
   */
  router.post(
    "/:hostId/install-certbot",
    write("install-certbot", async (hostId, _req, s) =>
      service.installCertbot(hostId, s),
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/logs:
   *   get:
   *     summary: Log files
   *     description: The files in each installed server's log folder.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Paths with their size.
   */
  router.get(
    "/:hostId/logs",
    read(async (hostId, _req, s) => service.logFiles(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/log:
   *   get:
   *     summary: The end of a log
   *     description: A file under /var/log, or a server's journal. Access logs also get counts by status, path and client.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: kind
   *         schema:
   *           type: string
   *           enum: [file, journal]
   *       - in: query
   *         name: path
   *         schema:
   *           type: string
   *       - in: query
   *         name: server
   *         schema:
   *           type: string
   *       - in: query
   *         name: lines
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The lines and counts.
   */
  router.get(
    "/:hostId/log",
    read(async (hostId, req, s) =>
      service.readLog(
        hostId,
        s,
        cleanLogSource({
          kind: req.query.kind,
          path: req.query.path,
          server: req.query.server,
        }),
        req.query.lines,
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/web-servers/{hostId}/watch:
   *   post:
   *     summary: Get alerts when a web server on this host stops
   *     description: Checks every minute as the caller and sends one alert when a server stops and one when it runs again.
   *     tags:
   *       - Web Servers
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               on:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/:hostId/watch",
    read(async (hostId, req) => {
      const on = body(req).on === true;
      await watches.set(String(ctx.currentActor() ?? ""), hostId, on);
      return { watching: on };
    }),
  );
}
