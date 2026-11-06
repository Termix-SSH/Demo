import express, { type Request, type Response, type Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { AccessRequest, RequestStore } from "./store.js";
import { APPROVE_PERMISSION, type AccessService } from "./access.js";
import { WorkflowError, type Workflow } from "./workflow.js";

const CSV_COLUMNS: Array<keyof AccessRequest> = [
  "id",
  "createdAt",
  "status",
  "hostId",
  "hostName",
  "username",
  "hours",
  "reason",
  "ticket",
  "decidedByName",
  "decidedAt",
  "comment",
  "startsAt",
  "expiresAt",
  "endedAt",
];

/** One CSV cell, with spreadsheet formulas made harmless. */
export function csvCell(value: unknown): string {
  let out = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  return /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

function idParam(req: Request): number | null {
  const id = Number.parseInt(String(req.params.id), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function registerRoutes(deps: {
  ctx: PluginContext;
  store: RequestStore;
  access: AccessService;
  workflow: Workflow;
}): Router {
  const { ctx, store, access, workflow } = deps;
  const router = express.Router();
  router.use(ctx.rbac.require("request") as never);

  const actor = (res: Response): string | null => {
    const userId = ctx.currentActor();
    if (!userId) res.status(401).json({ error: "Not signed in" });
    return userId ?? null;
  };
  const canApprove = () => ctx.rbac.has(APPROVE_PERMISSION);
  const failed = (res: Response, error: unknown, what: string) => {
    if (error instanceof WorkflowError) {
      return res.status(error.status).json({ error: error.message });
    }
    ctx.log.error(
      `Failed to ${what}`,
      error instanceof Error ? error : new Error(String(error)),
    );
    return res.status(500).json({ error: `Failed to ${what}` });
  };

  /**
   * @openapi
   * /plugin-api/privileged-access/hosts:
   *   get:
   *     summary: Privileged hosts the caller can reach
   *     description: Each with its limits and the caller's current access, for the request form.
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: The hosts.
   */
  router.get("/hosts", async (_req: Request, res: Response) => {
    const userId = actor(res);
    if (!userId) return;
    try {
      const hosts = [];
      for (const host of await ctx.hosts.list()) {
        const settings = await access.hostSettings(host.id);
        if (!settings.privileged) continue;
        hosts.push({
          id: host.id,
          name: host.name || host.ip,
          maxHours: settings.maxHours,
          requireReason: settings.requireReason,
          requireTicket: settings.requireTicket,
          accessUntil: access.grantUntil(userId, host.id),
        });
      }
      res.json({ hosts });
    } catch (error) {
      failed(res, error, "list hosts");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/requests:
   *   get:
   *     summary: List access requests
   *     description: scope=mine (default) is the caller's own. pending, active and all need privileged-access.approve; pending only lists requests the caller may decide.
   *     tags:
   *       - Privileged Access
   *     parameters:
   *       - in: query
   *         name: scope
   *         schema: { type: string, enum: [mine, pending, active, all] }
   *     responses:
   *       200:
   *         description: The requests, newest first.
   *       403:
   *         description: Needs privileged-access.approve.
   *   post:
   *     summary: Ask for access to a privileged host
   *     description: hostId, hours, and a reason and ticket when the host asks for them. An open request for the same host is returned instead of a new one.
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: The request.
   *       400:
   *         description: The request is not valid for this host.
   *       404:
   *         description: Host not found.
   */
  router.get("/requests", async (req: Request, res: Response) => {
    const userId = actor(res);
    if (!userId) return;
    const scope = String(req.query.scope ?? "mine");
    try {
      if (scope === "mine") {
        return res.json({ requests: await store.forUser(userId) });
      }
      if (!(await canApprove())) {
        return res.status(403).json({ error: "You can't approve requests" });
      }
      if (scope === "pending") {
        const pending = await store.byStatus(["pending"]);
        const mine = [];
        for (const row of pending) {
          if (!(await access.approveRefusal(userId, row))) mine.push(row);
        }
        return res.json({ requests: mine });
      }
      if (scope === "active") {
        return res.json({ requests: await store.byStatus(["approved"]) });
      }
      res.json({ requests: await store.all() });
    } catch (error) {
      failed(res, error, "list requests");
    }
  });

  router.post("/requests", async (req: Request, res: Response) => {
    if (!actor(res)) return;
    try {
      res.json({ request: await workflow.request(req.body ?? {}, req) });
    } catch (error) {
      failed(res, error, "save the request");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/requests/{id}/approve:
   *   post:
   *     summary: Approve an access request
   *     description: Needs privileged-access.approve and, when the host names approver roles, one of them. Nobody approves their own request.
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: The approved request.
   *       403:
   *         description: Not allowed to decide this request.
   *       409:
   *         description: Already decided.
   */
  router.post("/requests/:id/approve", async (req: Request, res: Response) => {
    if (!actor(res)) return;
    const id = idParam(req);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
      res.json({
        request: await workflow.decide(id, true, req.body?.comment, req),
      });
    } catch (error) {
      failed(res, error, "approve the request");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/requests/{id}/deny:
   *   post:
   *     summary: Deny an access request
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: The denied request.
   *       403:
   *         description: Not allowed to decide this request.
   */
  router.post("/requests/:id/deny", async (req: Request, res: Response) => {
    if (!actor(res)) return;
    const id = idParam(req);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
      res.json({
        request: await workflow.decide(id, false, req.body?.comment, req),
      });
    } catch (error) {
      failed(res, error, "deny the request");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/requests/{id}/end:
   *   post:
   *     summary: Withdraw a request or end access early
   *     description: The requester, or someone who may approve it. Ending approved access closes the user's open sessions on the host.
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: The closed request.
   *       403:
   *         description: Not allowed.
   */
  router.post("/requests/:id/end", async (req: Request, res: Response) => {
    if (!actor(res)) return;
    const id = idParam(req);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    try {
      res.json({ request: await workflow.end(id, req.body?.comment, req) });
    } catch (error) {
      failed(res, error, "end the access");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/report.csv:
   *   get:
   *     summary: Every request as CSV
   *     description: Needs privileged-access.approve. Audited.
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: CSV file.
   */
  router.get("/report.csv", async (req: Request, res: Response) => {
    if (!actor(res)) return;
    if (!(await canApprove())) {
      return res.status(403).json({ error: "You can't see the report" });
    }
    try {
      const rows = await store.all(10_000);
      const lines = [
        CSV_COLUMNS.join(","),
        ...rows.map((row) =>
          CSV_COLUMNS.map((column) => csvCell(row[column])).join(","),
        ),
      ];
      await ctx.audit
        .record({
          action: "privileged_access_report",
          resourceType: "plugin",
          details: `${rows.length} requests`,
          success: true,
          request: req,
        })
        .catch(() => {});
      res.type("text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="privileged-access.csv"',
      );
      res.send(`${lines.join("\r\n")}\r\n`);
    } catch (error) {
      failed(res, error, "build the report");
    }
  });

  /**
   * @openapi
   * /plugin-api/privileged-access/summary:
   *   get:
   *     summary: Counts for the dashboard card
   *     tags:
   *       - Privileged Access
   *     responses:
   *       200:
   *         description: pending (to decide), active (the caller's grants) and the newest pending requests.
   */
  router.get("/summary", async (_req: Request, res: Response) => {
    const userId = actor(res);
    if (!userId) return;
    try {
      const approver = await canApprove();
      const pending = [];
      if (approver) {
        for (const row of await store.byStatus(["pending"])) {
          if (!(await access.approveRefusal(userId, row))) pending.push(row);
        }
      }
      const now = Date.now();
      const active = (await store.forUser(userId, 50)).filter(
        (row) =>
          row.status === "approved" &&
          !!row.expiresAt &&
          Date.parse(row.expiresAt) > now,
      );
      res.json({
        approver,
        pending: pending.length,
        latest: pending.slice(0, 5),
        active,
      });
    } catch (error) {
      failed(res, error, "read the summary");
    }
  });

  return router;
}
