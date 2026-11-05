import type { Request, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { IssueBody } from "../shared/types.js";
import { body, createHttp, str } from "./http.js";
import { parseKey } from "./scripts.js";
import type { CertService } from "./service.js";
import { registerSummary, type SummaryCache } from "./summary.js";
import type { WatchStore } from "./watches.js";

/**
 * Mounts the Certificates routes, served at /plugin-api/certificates with
 * auth and the certificates.use permission in front.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: { service: CertService; summary: SummaryCache; watches: WatchStore },
): void {
  const { service, summary, watches } = deps;
  const { read, write, canEdit } = createHttp(router, ctx);
  registerSummary(router, ctx, summary);
  const keyOf = (req: Request) => parseKey(body(req).key);
  const keyName = (req: Request) => str(body(req).key);

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/status:
   *   get:
   *     summary: Certificate tools on a host
   *     description: Whether certbot, acme.sh and openssl are installed, how renewal is set up and whether the caller gets expiry alerts for this host.
   *     tags:
   *       - Certificates
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
      warnDays: s.warnDays,
      canEdit: await canEdit(hostId, s),
      readOnly: s.readOnly,
    })),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/certificates:
   *   get:
   *     summary: Certificates from certbot and acme.sh
   *     description: Sorted by days left, soonest first.
   *     tags:
   *       - Certificates
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The certificates.
   */
  router.get(
    "/:hostId/certificates",
    read(async (hostId, _req, s) => service.list(hostId, s)),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/inspect:
   *   get:
   *     summary: Read a certificate file or a TLS server's chain
   *     description: Pass path for a PEM or DER file on the host, or address and port to fetch the chain a server sends, as seen from the host.
   *     tags:
   *       - Certificates
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: path
   *         schema:
   *           type: string
   *       - in: query
   *         name: address
   *         schema:
   *           type: string
   *       - in: query
   *         name: port
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Each certificate with its names, dates, issuer and fingerprint.
   */
  router.get(
    "/:hostId/inspect",
    read(async (hostId, req, s) =>
      req.query.path
        ? service.inspectFile(hostId, s, req.query.path)
        : service.inspectRemote(hostId, s, req.query.address, req.query.port),
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/issue:
   *   post:
   *     summary: Get a new certificate
   *     description: Runs certbot or acme.sh as root with the standalone, webroot or DNS challenge. DNS API tokens must already be set up on the host.
   *     tags:
   *       - Certificates
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
   *             required: [client, domains, challenge]
   *             properties:
   *               client:
   *                 type: string
   *                 enum: [certbot, acme.sh]
   *               domains:
   *                 type: array
   *                 items:
   *                   type: string
   *               challenge:
   *                 type: string
   *                 enum: [standalone, webroot, dns]
   *               webroot:
   *                 type: string
   *               dnsProvider:
   *                 type: string
   *               credentials:
   *                 type: string
   *               email:
   *                 type: string
   *               staging:
   *                 type: boolean
   *               keyType:
   *                 type: string
   *                 enum: [ecdsa, rsa]
   *     responses:
   *       200:
   *         description: The end of the client's output.
   */
  router.post(
    "/:hostId/issue",
    write(
      "issue",
      async (hostId, req, s) => {
        try {
          return await service.issue(
            hostId,
            s,
            body(req) as unknown as IssueBody,
          );
        } finally {
          summary.forget(hostId);
        }
      },
      (req) => {
        const domains = body(req).domains;
        return Array.isArray(domains) ? domains.join(" ").slice(0, 200) : "";
      },
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/renew:
   *   post:
   *     summary: Renew one certificate or all of them
   *     description: Leave out key to renew everything that is due. dryRun tests the renewal with certbot without saving anything.
   *     tags:
   *       - Certificates
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
   *               key:
   *                 type: string
   *               client:
   *                 type: string
   *               dryRun:
   *                 type: boolean
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The end of the client's output.
   */
  router.post(
    "/:hostId/renew",
    write(
      "renew",
      async (hostId, req, s) => {
        const b = body(req);
        const options = { dryRun: b.dryRun === true, force: b.force === true };
        try {
          if (b.key) {
            const { client, name } = keyOf(req);
            return await service.renew(hostId, s, client, name, options);
          }
          const client = b.client === "acme.sh" ? "acme.sh" : "certbot";
          return await service.renew(hostId, s, client, null, options);
        } finally {
          summary.forget(hostId);
        }
      },
      (req) => keyName(req) || `all ${str(body(req).client)}`.trim(),
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/revoke:
   *   post:
   *     summary: Revoke and remove a certificate
   *     tags:
   *       - Certificates
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
   *             required: [key]
   *             properties:
   *               key:
   *                 type: string
   *     responses:
   *       200:
   *         description: The end of the client's output.
   */
  router.post(
    "/:hostId/revoke",
    write(
      "revoke",
      async (hostId, req, s) => {
        const { client, name } = keyOf(req);
        try {
          return await service.revoke(hostId, s, client, name);
        } finally {
          summary.forget(hostId);
        }
      },
      keyName,
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/delete:
   *   post:
   *     summary: Stop managing a certificate without revoking it
   *     tags:
   *       - Certificates
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
   *             required: [key]
   *             properties:
   *               key:
   *                 type: string
   *     responses:
   *       200:
   *         description: The end of the client's output.
   */
  router.post(
    "/:hostId/delete",
    write(
      "delete",
      async (hostId, req, s) => {
        const { client, name } = keyOf(req);
        try {
          return await service.remove(hostId, s, client, name);
        } finally {
          summary.forget(hostId);
        }
      },
      keyName,
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/install:
   *   post:
   *     summary: Install certbot
   *     description: Uses the host's package manager.
   *     tags:
   *       - Certificates
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
    "/:hostId/install",
    write("install", async (hostId, _req, s) =>
      service.installCertbot(hostId, s),
    ),
  );

  /**
   * @openapi
   * /plugin-api/certificates/{hostId}/watch:
   *   post:
   *     summary: Get alerts before certificates on this host expire
   *     description: Checks every 6 hours as the caller and sends one alert when a certificate gets close to expiring and one when it expires.
   *     tags:
   *       - Certificates
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
