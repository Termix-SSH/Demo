import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Drift } from "./drift.js";
import { handleMcp } from "./mcp.js";
import type { Rollouts } from "./rollouts.js";
import { toRule, validRule, type RuleStore } from "./rules.js";
import { parseTargets } from "./targets.js";

interface Deps {
  rules: RuleStore;
  rollouts: Rollouts;
  drift: Drift;
}

function actor(ctx: PluginContext, res: Response): string | null {
  const userId = ctx.currentActor();
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}

function idOf(req: Request): number {
  return Number(req.params.id);
}

const ACTION_ID = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;

/**
 * Wraps a handler: known errors answer 400, unknown ones 500. A thrown error
 * here is the caller's input almost always, so its message is shown.
 */
function handle(
  ctx: PluginContext,
  fn: (req: Request, res: Response, userId: string) => Promise<unknown>,
) {
  return async (req: Request, res: Response) => {
    const userId = actor(ctx, res);
    if (!userId) return;
    try {
      const result = await fn(req, res, userId);
      if (!res.headersSent) res.json(result ?? { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.status(message.endsWith("not found") ? 404 : 400).json({
          error: message,
        });
      }
    }
  };
}

export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  { rules, rollouts, drift }: Deps,
): void {
  router.use(ctx.rbac.require("use") as never);

  /**
   * @openapi
   * /plugin-api/operations-center/rules:
   *   get:
   *     summary: List approval rules
   *     description: Checked in order, the first rule that matches decides whether an action runs, waits for approval or is refused.
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: The rules.
   */
  router.get(
    "/rules",
    handle(ctx, async () => ({ rules: await rules.all() })),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/rules:
   *   post:
   *     summary: Add or change an approval rule
   *     description: Needs the operations-center.rules permission.
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: Saved.
   *       400:
   *         description: The rule is not valid.
   */
  router.post(
    "/rules",
    ctx.rbac.require("rules") as never,
    handle(ctx, async (req, _res, userId) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const problem = validRule(body);
      if (problem) throw new Error(problem);
      const rule = toRule(body);
      await rules.save(
        { ...rule, id: rule.id > 0 ? rule.id : undefined },
        userId,
      );
      return { rules: await rules.all() };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/rules/{id}:
   *   delete:
   *     summary: Delete an approval rule
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/rules/:id",
    ctx.rbac.require("rules") as never,
    handle(ctx, async (req) => {
      await rules.remove(idOf(req));
      return { rules: await rules.all() };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/rollouts:
   *   get:
   *     summary: List your rollouts
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: Rollouts with a count of hosts per state.
   */
  router.get(
    "/rollouts",
    handle(ctx, async (_req, _res, userId) => ({
      rollouts: await rollouts.list(userId),
    })),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/rollouts:
   *   post:
   *     summary: Create a rollout
   *     description: One action across hosts picked by id, tag or fleet, with a canary, batches, a pause between them and a failure limit. Starts right away when start is true.
   *     tags:
   *       - Operations Center
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [actionId, targets]
   *             properties:
   *               name:
   *                 type: string
   *               actionId:
   *                 type: string
   *               resourceKey:
   *                 type: string
   *               input:
   *                 type: object
   *               targets:
   *                 type: object
   *               dryRun:
   *                 type: boolean
   *               canary:
   *                 type: integer
   *               batchSize:
   *                 type: integer
   *               pauseSeconds:
   *                 type: integer
   *               stopAfterFailures:
   *                 type: integer
   *               start:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The rollout.
   *       400:
   *         description: No hosts match, or the request is not valid.
   */
  router.post(
    "/rollouts",
    handle(ctx, async (req, _res, userId) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const actionId = String(body.actionId ?? "");
      if (!ACTION_ID.test(actionId)) throw new Error("Unknown action");
      const batch = await rollouts.create(userId, {
        name: String(body.name ?? actionId),
        actionId,
        resourceKey:
          typeof body.resourceKey === "string" ? body.resourceKey : undefined,
        input:
          body.input && typeof body.input === "object"
            ? (body.input as Record<string, unknown>)
            : undefined,
        targets: parseTargets(body.targets),
        dryRun: body.dryRun === true,
        canary: body.canary as number,
        batchSize: body.batchSize as number,
        pauseSeconds: body.pauseSeconds as number,
        stopAfterFailures: body.stopAfterFailures as number,
      });
      if (body.start === true) await rollouts.start(userId, batch.id);
      return { rollout: batch };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/rollouts/{id}:
   *   get:
   *     summary: A rollout and each host's result
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The rollout.
   *       404:
   *         description: Not found.
   */
  router.get(
    "/rollouts/:id",
    handle(ctx, async (req, res, userId) => {
      const found = await rollouts.get(userId, idOf(req));
      if (!found) res.status(404).json({ error: "Rollout not found" });
      return found;
    }),
  );

  for (const verb of ["start", "pause", "stop", "retry"] as const) {
    /**
     * @openapi
     * /plugin-api/operations-center/rollouts/{id}/{verb}:
     *   post:
     *     summary: Start, pause, stop or retry a rollout
     *     description: retry runs the hosts that failed again.
     *     tags:
     *       - Operations Center
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *       - in: path
     *         name: verb
     *         required: true
     *         schema:
     *           type: string
     *           enum: [start, pause, stop, retry]
     *     responses:
     *       200:
     *         description: Done.
     */
    router.post(
      `/rollouts/:id/${verb}`,
      handle(ctx, async (req, _res, userId) => {
        await rollouts[verb](userId, idOf(req));
        return rollouts.get(userId, idOf(req));
      }),
    );
  }

  /**
   * @openapi
   * /plugin-api/operations-center/rollouts/{id}:
   *   delete:
   *     summary: Delete a rollout
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/rollouts/:id",
    handle(ctx, async (req, _res, userId) => {
      await rollouts.remove(userId, idOf(req));
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/baselines:
   *   get:
   *     summary: List your drift baselines
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: Baselines with a count of hosts per state.
   */
  router.get(
    "/baselines",
    handle(ctx, async (_req, _res, userId) => ({
      baselines: await drift.list(userId),
    })),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/baselines:
   *   post:
   *     summary: Add or change a drift baseline
   *     description: A read action that proves hosts are as they should be, checked on a schedule, with an optional fix action.
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post(
    "/baselines",
    handle(ctx, async (req, _res, userId) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const checkActionId = String(body.checkActionId ?? "");
      if (!ACTION_ID.test(checkActionId)) throw new Error("Unknown action");
      const fix =
        typeof body.fixActionId === "string" && body.fixActionId
          ? body.fixActionId
          : null;
      if (fix && !ACTION_ID.test(fix)) throw new Error("Unknown fix action");
      await drift.save(userId, {
        id: Number(body.id) > 0 ? Number(body.id) : undefined,
        name: String(body.name ?? checkActionId),
        checkActionId,
        resourceKey:
          typeof body.resourceKey === "string" ? body.resourceKey : null,
        input:
          body.input && typeof body.input === "object"
            ? (body.input as Record<string, unknown>)
            : undefined,
        targets: parseTargets(body.targets),
        intervalMinutes: Number(body.intervalMinutes),
        fixActionId: fix,
        autoFix: body.autoFix === true,
        enabled: body.enabled !== false,
      });
      return { baselines: await drift.list(userId) };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/baselines/{id}/results:
   *   get:
   *     summary: Each host's state for a baseline
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Results.
   */
  router.get(
    "/baselines/:id/results",
    handle(ctx, async (req, res, userId) => {
      const results = await drift.results(userId, idOf(req));
      if (!results) res.status(404).json({ error: "Baseline not found" });
      return { results };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/baselines/{id}/run:
   *   post:
   *     summary: Check a baseline now
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Started.
   */
  router.post(
    "/baselines/:id/run",
    handle(ctx, async (req, _res, userId) => {
      await drift.runNow(userId, idOf(req));
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/baselines/{id}:
   *   delete:
   *     summary: Delete a baseline
   *     tags:
   *       - Operations Center
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/baselines/:id",
    handle(ctx, async (req, _res, userId) => {
      await drift.remove(userId, idOf(req));
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/attention:
   *   get:
   *     summary: What needs a look from this plugin
   *     description: Drifted hosts, rollouts that stopped and how many are running. Approvals and failed runs come from core's /operations routes.
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: Counts.
   */
  router.get(
    "/attention",
    handle(ctx, async (_req, _res, userId) => {
      const list = await rollouts.list(userId);
      return {
        drifted: await drift.driftedFor(userId),
        running: list.filter((batch) => batch.status === "running").length,
        rollouts: list
          .filter((batch) => batch.status === "paused")
          .map((batch) => ({
            id: batch.id,
            name: batch.name,
            reason: batch.pausedReason,
          })),
      };
    }),
  );

  /**
   * @openapi
   * /plugin-api/operations-center/mcp:
   *   post:
   *     summary: MCP server
   *     description: Model Context Protocol over HTTP, for AI tools. Use an API key limited to operations. Only actions marked safe for MCP are offered, and changes follow the approval rules.
   *     tags:
   *       - Operations Center
   *     responses:
   *       200:
   *         description: A JSON-RPC answer.
   *       202:
   *         description: A notification was received.
   */
  router.post(
    "/mcp",
    ctx.rbac.require("mcp") as never,
    async (req: Request, res: Response) => {
      if (!actor(ctx, res)) return;
      const body = req.body;
      const messages = Array.isArray(body) ? body : [body];
      const answers = [];
      for (const message of messages) {
        const answer = await handleMcp(ctx, message ?? {}).catch((error) => ({
          jsonrpc: "2.0",
          id: message?.id ?? null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        }));
        if (answer) answers.push(answer);
      }
      if (answers.length === 0) {
        res.status(202).end();
        return;
      }
      res.json(Array.isArray(body) ? answers : answers[0]);
    },
  );

  /**
   * @openapi
   * /plugin-api/operations-center/mcp:
   *   get:
   *     summary: MCP event stream
   *     description: Not offered. Answers 405 as the protocol expects.
   *     tags:
   *       - Operations Center
   *     responses:
   *       405:
   *         description: No stream.
   */
  router.get("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").end();
  });
}
