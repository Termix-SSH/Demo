import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostChoice } from "../shared/types.js";
import { providerInfo } from "./providers/index.js";
import { DnsError, type DnsService } from "./service.js";

function fail(res: Response, error: unknown) {
  if (error instanceof DnsError) {
    return res.status(error.status).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ error: message });
}

const num = (value: unknown) => Number(value);
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  service: DnsService,
): void {
  const view = ctx.rbac.require("view") as never;
  const edit = ctx.rbac.require("edit") as never;
  const manage = ctx.rbac.require("manage") as never;

  /** Wraps a handler so a thrown error becomes an answer. */
  const handle =
    (run: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const result = await run(req, res);
        if (!res.headersSent) res.json(result ?? { success: true });
      } catch (error) {
        fail(res, error);
      }
    };

  const zoneIds = (req: Request) => ({
    accountId: num(req.params.accountId),
    zoneId: String(req.params.zoneId),
  });

  /**
   * @openapi
   * /plugin-api/dns/providers:
   *   get:
   *     summary: List the supported providers and the keys each one needs
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: The providers with their credential fields and features
   */
  router.get("/providers", view, (_req: Request, res: Response) => {
    res.json({ providers: providerInfo() });
  });

  /**
   * @openapi
   * /plugin-api/dns/summary:
   *   get:
   *     summary: Counts for the dashboard card
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: Accounts, domains close to expiry and failing links
   */
  router.get(
    "/summary",
    view,
    handle(() => service.summary()),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts:
   *   get:
   *     summary: List the DNS and registrar logins, without their keys
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: The accounts
   */
  router.get(
    "/accounts",
    view,
    handle(async () => ({ accounts: await service.accounts() })),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts:
   *   post:
   *     summary: Add a DNS or registrar login
   *     tags:
   *       - DNS
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               provider:
   *                 type: string
   *               name:
   *                 type: string
   *               credentials:
   *                 type: object
   *                 additionalProperties:
   *                   type: string
   *     responses:
   *       201:
   *         description: Account added
   *       400:
   *         description: Missing or invalid fields
   *       409:
   *         description: An account with that name exists
   */
  router.post(
    "/accounts",
    manage,
    handle(async (req, res) => {
      const id = await service.createAccount(
        body(req) as never,
        ctx.currentActor() as string,
      );
      res.status(201).json({ id });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{id}:
   *   put:
   *     summary: Change an account. Keys left empty keep their saved value.
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Account saved
   *       404:
   *         description: Account not found
   */
  router.put(
    "/accounts/:id",
    manage,
    handle(async (req) =>
      service.updateAccount(num(req.params.id), body(req) as never),
    ),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{id}:
   *   delete:
   *     summary: Remove an account with its copies, links and domains
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Account removed
   *       404:
   *         description: Account not found
   */
  router.delete(
    "/accounts/:id",
    manage,
    handle(async (req) => service.deleteAccount(num(req.params.id))),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{id}/test:
   *   post:
   *     summary: Check the saved keys by listing zones
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: How many zones and domains the login can see
   *       502:
   *         description: The provider refused the keys
   */
  router.post(
    "/accounts/:id/test",
    manage,
    handle(async (req) => service.testAccount(num(req.params.id))),
  );

  /**
   * @openapi
   * /plugin-api/dns/zones:
   *   get:
   *     summary: List every zone of every login
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: The zones and the logins that failed
   */
  router.get(
    "/zones",
    view,
    handle(() => service.zones()),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/records:
   *   get:
   *     summary: List the records of a zone
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The records
   */
  router.get(
    "/accounts/:accountId/zones/:zoneId/records",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      const fresh = req.query.fresh === "1";
      return { records: await service.records(accountId, zoneId, fresh) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/records:
   *   post:
   *     summary: Add a record
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: Record added
   *       400:
   *         description: The record is not valid
   */
  router.post(
    "/accounts/:accountId/zones/:zoneId/records",
    edit,
    handle(async (req, res) => {
      const { accountId, zoneId } = zoneIds(req);
      await service.saveRecord(accountId, zoneId, body(req) as never);
      res.status(201).json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/records/{recordId}:
   *   put:
   *     summary: Change a record
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: recordId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Record saved
   *       404:
   *         description: Record not found
   */
  router.put(
    "/accounts/:accountId/zones/:zoneId/records/:recordId",
    edit,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      await service.saveRecord(
        accountId,
        zoneId,
        body(req) as never,
        String(req.params.recordId),
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/records/{recordId}:
   *   delete:
   *     summary: Delete a record
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *       - in: path
   *         name: recordId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Record deleted
   *       404:
   *         description: Record not found
   */
  router.delete(
    "/accounts/:accountId/zones/:zoneId/records/:recordId",
    edit,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      await service.deleteRecord(
        accountId,
        zoneId,
        String(req.params.recordId),
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/snapshots:
   *   get:
   *     summary: List the saved copies of a zone
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The copies, newest first
   */
  router.get(
    "/accounts/:accountId/zones/:zoneId/snapshots",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      return { snapshots: await service.snapshots(accountId, zoneId) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/snapshots:
   *   post:
   *     summary: Save a copy of a zone now
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       201:
   *         description: The copy
   */
  router.post(
    "/accounts/:accountId/zones/:zoneId/snapshots",
    edit,
    handle(async (req, res) => {
      const { accountId, zoneId } = zoneIds(req);
      const label = String(body(req).label ?? "").trim() || "Manual copy";
      const snapshot = await service.takeSnapshot(
        accountId,
        zoneId,
        label,
        "manual",
      );
      res.status(201).json({ snapshot });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/snapshots/{id}/diff:
   *   get:
   *     summary: What restoring a copy would change
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The differences between the copy and the live zone
   */
  router.get(
    "/snapshots/:id/diff",
    view,
    handle(async (req) => ({
      diff: await service.diffSnapshot(num(req.params.id)),
    })),
  );

  /**
   * @openapi
   * /plugin-api/dns/snapshots/{id}/restore:
   *   post:
   *     summary: Put a zone back to a saved copy
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The changes that were made
   */
  router.post(
    "/snapshots/:id/restore",
    manage,
    handle(async (req) => service.restore(num(req.params.id), { apply: true })),
  );

  /**
   * @openapi
   * /plugin-api/dns/snapshots/{id}:
   *   delete:
   *     summary: Delete a saved copy
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Copy deleted
   */
  router.delete(
    "/snapshots/:id",
    edit,
    handle(async (req) => service.deleteSnapshot(num(req.params.id))),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/export:
   *   get:
   *     summary: The zone as a BIND file
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The file text and zone name
   */
  router.get(
    "/accounts/:accountId/zones/:zoneId/export",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      return service.exportZone(accountId, zoneId);
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/import:
   *   post:
   *     summary: Preview or apply a BIND file
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
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
   *               text:
   *                 type: string
   *               apply:
   *                 type: boolean
   *               replace:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The changes, and whether they were made
   */
  router.post(
    "/accounts/:accountId/zones/:zoneId/import",
    edit,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      const input = body(req);
      return service.importZone(accountId, zoneId, String(input.text ?? ""), {
        apply: input.apply === true,
        replace: input.replace === true,
      });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/health:
   *   get:
   *     summary: The last health report of a zone
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The report, or null when none ran yet
   */
  router.get(
    "/accounts/:accountId/zones/:zoneId/health",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      return { report: await service.lastHealth(accountId, zoneId) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/health:
   *   post:
   *     summary: Check delegation, DNSSEC, mail records and broken names now
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: The new report
   */
  router.post(
    "/accounts/:accountId/zones/:zoneId/health",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      return { report: await service.health(accountId, zoneId) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/accounts/{accountId}/zones/{zoneId}/propagation:
   *   post:
   *     summary: Ask public resolvers whether the records resolve
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: accountId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zoneId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: One row per record and resolver
   */
  router.post(
    "/accounts/:accountId/zones/:zoneId/propagation",
    view,
    handle(async (req) => {
      const { accountId, zoneId } = zoneIds(req);
      return { rows: await service.propagation(accountId, zoneId) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/domains:
   *   get:
   *     summary: List registered and watched domains with their expiry
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: The domains, soonest expiry first
   */
  router.get(
    "/domains",
    view,
    handle(async () => ({ domains: await service.domains() })),
  );

  /**
   * @openapi
   * /plugin-api/dns/domains:
   *   post:
   *     summary: Watch a domain through RDAP
   *     tags:
   *       - DNS
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
   *       201:
   *         description: Domain added
   *       409:
   *         description: Already listed
   */
  router.post(
    "/domains",
    manage,
    handle(async (req, res) => {
      const domain = await service.watchDomain(String(body(req).name ?? ""));
      res.status(201).json({ domain });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/domains/refresh:
   *   post:
   *     summary: Read every registrar login and watched domain again
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: How many domains there are and how many lookups failed
   */
  router.post(
    "/domains/refresh",
    edit,
    handle(() => service.refreshDomains()),
  );

  /**
   * @openapi
   * /plugin-api/dns/domains/{id}:
   *   delete:
   *     summary: Stop watching a domain
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Domain removed
   */
  router.delete(
    "/domains/:id",
    manage,
    handle(async (req) => service.removeDomain(num(req.params.id))),
  );

  /**
   * @openapi
   * /plugin-api/dns/hosts:
   *   get:
   *     summary: Hosts the user can link a record to
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: Hosts with their address
   */
  router.get(
    "/hosts",
    manage,
    handle(async () => {
      const hosts = await ctx.hosts.list();
      const choices: HostChoice[] = hosts.map((host) => ({
        id: host.id,
        name: host.name || host.ip,
        ip: host.ip,
      }));
      return { hosts: choices };
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/links:
   *   get:
   *     summary: List the records Termix keeps up to date
   *     tags:
   *       - DNS
   *     responses:
   *       200:
   *         description: The links
   */
  router.get(
    "/links",
    view,
    handle(async () => ({ links: await service.links() })),
  );

  /**
   * @openapi
   * /plugin-api/dns/links:
   *   post:
   *     summary: Keep a record pointed at a host or this server's public address
   *     tags:
   *       - DNS
   *     responses:
   *       201:
   *         description: Link added
   *       409:
   *         description: That record already has a link
   */
  router.post(
    "/links",
    manage,
    handle(async (req, res) => {
      await service.saveLink(body(req) as never, ctx.currentActor() as string);
      res.status(201).json({ success: true });
    }),
  );

  /**
   * @openapi
   * /plugin-api/dns/links/{id}:
   *   put:
   *     summary: Change a link
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Link saved
   */
  router.put(
    "/links/:id",
    manage,
    handle(async (req) =>
      service.saveLink(
        body(req) as never,
        ctx.currentActor() as string,
        num(req.params.id),
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/dns/links/{id}:
   *   delete:
   *     summary: Remove a link. The record stays where it is.
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Link removed
   */
  router.delete(
    "/links/:id",
    manage,
    handle(async (req) => service.deleteLink(num(req.params.id))),
  );

  /**
   * @openapi
   * /plugin-api/dns/links/{id}/sync:
   *   post:
   *     summary: Update a linked record now
   *     tags:
   *       - DNS
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether the record changed
   *       502:
   *         description: The address or the provider failed
   */
  router.post(
    "/links/:id/sync",
    edit,
    handle(async (req) => service.syncLinkById(num(req.params.id))),
  );
}
