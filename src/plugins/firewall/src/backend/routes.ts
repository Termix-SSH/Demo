import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  ApplyResult,
  Defaults,
  DriftResult,
  HostSummary,
  RuleSpec,
} from "../shared/types.js";
import type { Change } from "./backends/types.js";
import { FirewallError } from "./errors.js";
import {
  banScript,
  FAIL2BAN_START,
  FAIL2BAN_STATUS,
  parseFail2ban,
} from "./fail2ban.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import type { Manager } from "./manager.js";
import type { Remote } from "./remote.js";
import {
  missingRules,
  parseRuleSetInput,
  type RuleSetStore,
} from "./rulesets.js";
import {
  parseRuleSpec,
  requireIp,
  requireJail,
  requirePolicy,
  requireZone,
} from "./validate.js";
import type { WatchChecker, WatchStore } from "./watches.js";

export interface Deps {
  manager: Manager;
  remote: Remote;
  rulesets: RuleSetStore;
  watches: WatchStore;
  checker: WatchChecker;
}

type Level = "connect" | "edit";

/** Hosts read at once by the summary and rule set routes. */
export const CONCURRENCY = 4;
const SUMMARY_CACHE_MS = 60_000;

/** Runs `fn` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof FirewallError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(`Firewall request failed: ${message(error)}`);
  res.status(500).json({ error: "Something went wrong" });
}

/** A short, language neutral description of a rule for the pending banner. */
export function describe(spec: RuleSpec): string {
  return [
    spec.action,
    spec.direction,
    spec.service ?? (spec.protocol === "any" ? "" : spec.protocol),
    spec.port,
    spec.source ? `from ${spec.source}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

interface FleetsAccess {
  list: () => Promise<Array<{ id: number; name: string }>>;
  members: (fleetId: number) => Promise<Array<{ id: number }>>;
}

/**
 * Mounts the routes on the plugin's router, which core serves at
 * /plugin-api/firewall with auth in front. Reads need connect access to the
 * host, changes need edit access and a host that is not read only.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { manager, remote, rulesets, watches, checker } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const actor = () => String(ctx.currentActor() ?? "");
  const param = (req: Request, key: string) => String(req.params[key] ?? "");
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

  async function canEdit(hostId: number): Promise<boolean> {
    return (await ctx.hosts.checkAccess(hostId, "edit")).hasAccess;
  }

  async function gate(hostId: number, level: Level): Promise<HostSettings> {
    if (!Number.isInteger(hostId) || hostId < 1)
      throw new FirewallError("The host id is not valid");
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level === "edit" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new FirewallError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new FirewallError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new FirewallError("Firewall is not turned on for this host", 403, {
        code: "disabled",
      });
    }
    if (level === "edit" && settings.readOnly) {
      throw new FirewallError("This host is read only", 403, {
        code: "readOnly",
      });
    }
    return settings;
  }

  const read =
    (
      run: (hostId: number, s: HostSettings, req: Request) => Promise<unknown>,
    ) =>
    async (req: Request, res: Response) => {
      try {
        const hostId = Number(req.params.hostId);
        const settings = await gate(hostId, "connect");
        res.json(await run(hostId, settings, req));
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  function audit(
    action: string,
    hostId: number,
    name: string | undefined,
    error?: unknown,
  ) {
    void ctx.audit.record({
      action: `firewall.${action}`,
      resourceType: "host",
      resourceId: String(hostId),
      resourceName: name,
      success: !error,
      errorMessage: error ? message(error) : undefined,
    });
  }

  /** A change: needs edit access and is written to the audit log. */
  const write =
    (
      action: string,
      run: (hostId: number, s: HostSettings, req: Request) => Promise<unknown>,
      target?: (req: Request) => string | undefined,
    ) =>
    async (req: Request, res: Response) => {
      const hostId = Number(req.params.hostId);
      let name: string | undefined;
      try {
        name = target?.(req);
      } catch {
        name = undefined;
      }
      try {
        const settings = await gate(hostId, "edit");
        const result = await run(hostId, settings, req);
        audit(action, hostId, name);
        res.json(result ?? { ok: true });
      } catch (error) {
        audit(action, hostId, name, error);
        fail(ctx, res, error);
      }
    };

  const change = (
    hostId: number,
    settings: HostSettings,
    req: Request,
    next: Change,
    label: string,
  ) =>
    manager.change(hostId, settings, next, {
      label,
      force: body(req).force === true,
    });

  // Rule sets come before the host routes so their paths are not read as a host id.

  /**
   * @openapi
   * /plugin-api/firewall/rulesets:
   *   get:
   *     summary: Your rule sets
   *     description: Named lists of rules the signed in user can apply to many hosts, with the hosts each one is for.
   *     tags:
   *       - Firewall
   *     responses:
   *       200:
   *         description: The rule sets.
   */
  router.get("/rulesets", async (_req, res) => {
    try {
      res.json(await rulesets.list(actor()));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/rulesets:
   *   post:
   *     summary: Create a rule set
   *     tags:
   *       - Firewall
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               rules:
   *                 type: array
   *                 items:
   *                   type: object
   *               hosts:
   *                 type: array
   *                 items:
   *                   type: integer
   *     responses:
   *       200:
   *         description: The new rule set.
   */
  router.post("/rulesets", async (req, res) => {
    try {
      res.json(await rulesets.create(actor(), parseRuleSetInput(req.body)));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/rulesets/{id}:
   *   put:
   *     summary: Change a rule set
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The changed rule set.
   */
  router.put("/rulesets/:id", async (req, res) => {
    try {
      res.json(
        await rulesets.update(
          actor(),
          Number(param(req, "id")),
          parseRuleSetInput(req.body),
        ),
      );
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/rulesets/{id}:
   *   delete:
   *     summary: Delete a rule set
   *     description: Deletes the set only. Rules it already added to hosts stay.
   *     tags:
   *       - Firewall
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
  router.delete("/rulesets/:id", async (req, res) => {
    try {
      await rulesets.remove(actor(), Number(param(req, "id")));
      res.json({ ok: true });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  async function targetsOf(
    setHosts: number[],
    input: Record<string, unknown>,
  ): Promise<number[]> {
    const ids = new Set<number>();
    for (const id of Array.isArray(input.hostIds) ? input.hostIds : []) {
      const n = Number(id);
      if (Number.isInteger(n) && n > 0) ids.add(n);
    }
    if (input.fleetId !== undefined) {
      const fleets = fleetsAccess();
      if (!fleets) throw new FirewallError("The Fleets plugin is not running");
      for (const member of await fleets.members(Number(input.fleetId)))
        ids.add(member.id);
    }
    if (!ids.size) for (const id of setHosts) ids.add(id);
    return [...ids];
  }

  function fleetsAccess(): FleetsAccess | null {
    if (!ctx.services.providers("fleets.access").length) return null;
    try {
      return ctx.services.get<FleetsAccess>("fleets.access");
    } catch {
      return null;
    }
  }

  /**
   * @openapi
   * /plugin-api/firewall/rulesets/{id}/drift:
   *   get:
   *     summary: Rule set drift
   *     description: For each host of the set, the rules it does not have. Reading a host needs connect access.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: One entry per host.
   */
  router.get("/rulesets/:id/drift", async (req, res) => {
    try {
      const set = await rulesets.get(actor(), Number(param(req, "id")));
      const results = await mapLimit(
        set.hosts,
        CONCURRENCY,
        async (hostId): Promise<DriftResult> => {
          try {
            const settings = await gate(hostId, "connect");
            const state = await manager.state(hostId, settings);
            return {
              hostId,
              backend: state.backend,
              active: state.active,
              missing: missingRules(state, set.rules),
            };
          } catch (error) {
            return {
              hostId,
              backend: null,
              active: false,
              missing: [],
              error: message(error),
            };
          }
        },
      );
      res.json(results);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/rulesets/{id}/apply:
   *   post:
   *     summary: Apply a rule set
   *     description: Adds the rules a host is missing, on the picked hosts, a fleet, or the set's own hosts. Never removes rules. Each host needs edit access and gets the lockout check, and the change is kept by itself once Termix can open a new SSH connection, else the host undoes it.
   *     tags:
   *       - Firewall
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
   *               hostIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               fleetId:
   *                 type: integer
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: One result per host.
   */
  router.post("/rulesets/:id/apply", async (req, res) => {
    try {
      const set = await rulesets.get(actor(), Number(param(req, "id")));
      const input = body(req);
      const hosts = await targetsOf(set.hosts, input);
      const results = await mapLimit(
        hosts,
        CONCURRENCY,
        async (hostId): Promise<ApplyResult> => {
          try {
            const settings = await gate(hostId, "edit");
            const state = await manager.state(hostId, settings);
            const missing = missingRules(state, set.rules);
            if (!missing.length)
              return { hostId, added: 0, kept: true, skipped: true };
            const result = await manager.change(
              hostId,
              settings,
              { kind: "addMany", specs: missing },
              {
                label: `ruleset|${set.name}`,
                force: input.force === true,
                autoKeep: true,
              },
            );
            await rulesets.markApplied(set.id, hostId);
            audit("ruleset_apply", hostId, set.name);
            return { hostId, added: missing.length, kept: !result.pending };
          } catch (error) {
            audit("ruleset_apply", hostId, set.name, error);
            const code =
              error instanceof FirewallError
                ? String(error.extra.code ?? "")
                : "";
            return {
              hostId,
              added: 0,
              kept: false,
              error: message(error),
              code: code || undefined,
            };
          }
        },
      );
      res.json(results);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/fleets:
   *   get:
   *     summary: Fleets to apply a rule set to
   *     description: The signed in user's fleets, when the Fleets plugin runs. Empty otherwise.
   *     tags:
   *       - Firewall
   *     responses:
   *       200:
   *         description: The fleets.
   */
  router.get("/fleets", async (_req, res) => {
    try {
      const fleets = fleetsAccess();
      res.json(
        fleets
          ? (await fleets.list()).map((f) => ({ id: f.id, name: f.name }))
          : [],
      );
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  const summaryCache = new Map<string, HostSummary>();

  /**
   * @openapi
   * /plugin-api/firewall/summary:
   *   get:
   *     summary: Firewall state of every host
   *     description: The firewall, whether it is on, the rule count and Fail2ban bans for each host the caller can reach with Firewall turned on. Kept for a minute; refresh=1 reads again.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: query
   *         name: refresh
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: One entry per host.
   */
  router.get("/summary", async (req, res) => {
    try {
      const user = actor();
      const refresh = req.query.refresh === "1";
      const watched = new Set(await watches.listForUser(user));
      const enabled: Array<{ id: number; settings: HostSettings }> = [];
      for (const host of await ctx.hosts.list()) {
        const settings = await readHostSettings(ctx, host.id);
        if (settings.enabled) enabled.push({ id: host.id, settings });
      }
      const now = Date.now();
      const results = await mapLimit(
        enabled,
        CONCURRENCY,
        async ({ id, settings }) => {
          const key = `${user}:${id}`;
          const cached = summaryCache.get(key);
          if (
            !refresh &&
            cached &&
            now - Date.parse(cached.checkedAt) < SUMMARY_CACHE_MS
          ) {
            return { ...cached, watched: watched.has(id) };
          }
          const checkedAt = new Date().toISOString();
          let fresh: HostSummary;
          try {
            const state = await manager.state(id, settings);
            let banned = 0;
            if (state.fail2ban.running) {
              const f2b = parseFail2ban(
                (await remote.root(id, settings.sudo, FAIL2BAN_STATUS)).stdout,
              );
              banned = f2b.jails.reduce(
                (sum, jail) => sum + jail.currentlyBanned,
                0,
              );
            }
            fresh = {
              hostId: id,
              backend: state.backend,
              active: state.active,
              rules: state.rules.length,
              banned,
              pending: !!(await manager.pending(id)),
              watched: watched.has(id),
              checkedAt,
            };
          } catch (error) {
            fresh = {
              hostId: id,
              backend: null,
              active: false,
              rules: 0,
              banned: 0,
              pending: false,
              watched: watched.has(id),
              error: message(error),
              checkedAt,
            };
          }
          summaryCache.set(key, fresh);
          return fresh;
        },
      );
      res.json(results);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/status:
   *   get:
   *     summary: Firewall on a host
   *     description: Which firewall the host uses, whether it is on, the default policies, every rule, firewalld zones, the SSH ports and client address the lockout check uses, Fail2ban and any change waiting for Keep.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The firewall state.
   */
  router.get(
    "/:hostId/status",
    read(async (hostId, settings) =>
      manager.status(hostId, settings, await canEdit(hostId)),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/raw:
   *   get:
   *     summary: The firewall's own output
   *     description: Rules as the firewall prints them (ufw status, firewall-cmd --list-all-zones, nft list ruleset or iptables-save), read only.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The output as text.
   */
  router.get(
    "/:hostId/raw",
    read(async (hostId, settings) => ({
      output: await manager.raw(hostId, settings),
    })),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/rules:
   *   post:
   *     summary: Add a rule
   *     description: Adds a rule at the end. A change that could cut off SSH answers 409 SSH_LOCKOUT unless force is set. Changes that touch SSH get a timer and must be kept.
   *     tags:
   *       - Firewall
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
   *             properties:
   *               action:
   *                 type: string
   *                 enum: [allow, deny, reject, limit]
   *               direction:
   *                 type: string
   *                 enum: [in, out]
   *               protocol:
   *                 type: string
   *                 enum: [tcp, udp, any]
   *               port:
   *                 type: string
   *               source:
   *                 type: string
   *               destination:
   *                 type: string
   *               iface:
   *                 type: string
   *               family:
   *                 type: string
   *                 enum: [any, ipv4, ipv6]
   *               comment:
   *                 type: string
   *               service:
   *                 type: string
   *               zone:
   *                 type: string
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Added, with the pending change if it needs Keep.
   */
  router.post(
    "/:hostId/rules",
    write(
      "rule_add",
      async (hostId, settings, req) => {
        const spec = parseRuleSpec(body(req));
        const zone = body(req).zone ? requireZone(body(req).zone) : undefined;
        return change(
          hostId,
          settings,
          req,
          { kind: "add", spec, zone },
          `add|${describe(spec)}`,
        );
      },
      (req) => describe(parseRuleSpec(body(req))),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/rules/{ruleId}:
   *   put:
   *     summary: Change a rule
   *     description: Replaces a rule, keeping its place where the firewall allows it. Same body as adding a rule.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: ruleId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Changed.
   */
  router.put(
    "/:hostId/rules/:ruleId",
    write(
      "rule_update",
      async (hostId, settings, req) => {
        const spec = parseRuleSpec(body(req));
        return change(
          hostId,
          settings,
          req,
          { kind: "update", id: param(req, "ruleId"), spec },
          `update|${describe(spec)}`,
        );
      },
      (req) => param(req, "ruleId"),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/rules/{ruleId}:
   *   delete:
   *     summary: Delete a rule
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: ruleId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: force
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Deleted.
   */
  router.delete(
    "/:hostId/rules/:ruleId",
    write(
      "rule_delete",
      async (hostId, settings, req) =>
        manager.change(
          hostId,
          settings,
          { kind: "remove", id: param(req, "ruleId") },
          {
            label: "remove|",
            force: req.query.force === "1" || body(req).force === true,
          },
        ),
      (req) => param(req, "ruleId"),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/defaults:
   *   post:
   *     summary: Set the default policies
   *     description: What happens to traffic no rule matches. Routed is UFW only, outgoing is not on firewalld.
   *     tags:
   *       - Firewall
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
   *             properties:
   *               incoming:
   *                 type: string
   *                 enum: [allow, deny, reject]
   *               outgoing:
   *                 type: string
   *                 enum: [allow, deny, reject]
   *               routed:
   *                 type: string
   *                 enum: [allow, deny, reject]
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Set.
   */
  router.post(
    "/:hostId/defaults",
    write("defaults", async (hostId, settings, req) => {
      const input = body(req);
      const defaults: Record<string, string> = {};
      for (const key of ["incoming", "outgoing", "routed"]) {
        if (input[key] !== undefined) defaults[key] = requirePolicy(input[key]);
      }
      const label = Object.entries(defaults)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ");
      return change(
        hostId,
        settings,
        req,
        { kind: "defaults", defaults: defaults as Partial<Defaults> },
        `defaults|${label}`,
      );
    }),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/enable:
   *   post:
   *     summary: Turn the firewall on
   *     description: Turns the host's firewall on, after allowing the SSH ports when allowSsh is true (the default). Always gets the undo timer.
   *     tags:
   *       - Firewall
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
   *               allowSsh:
   *                 type: boolean
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Turned on, with the pending change.
   */
  router.post(
    "/:hostId/enable",
    write("enable", async (hostId, settings, req) =>
      change(
        hostId,
        settings,
        req,
        { kind: "enable", allowSsh: body(req).allowSsh !== false },
        "enable|",
      ),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/disable:
   *   post:
   *     summary: Turn the firewall off
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Turned off.
   */
  router.post(
    "/:hostId/disable",
    write("disable", async (hostId, settings, req) =>
      change(hostId, settings, req, { kind: "disable" }, "disable|"),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/install:
   *   post:
   *     summary: Install a firewall tool
   *     description: Installs ufw, firewalld, nftables or fail2ban with the host's package manager. Nothing is turned on; firewalld is stopped right after it installs.
   *     tags:
   *       - Firewall
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
   *             properties:
   *               what:
   *                 type: string
   *                 enum: [ufw, firewalld, nftables, fail2ban]
   *     responses:
   *       200:
   *         description: Installed.
   */
  router.post(
    "/:hostId/install",
    write(
      "install",
      async (hostId, settings, req) => {
        await manager.install(hostId, settings, String(body(req).what ?? ""));
        return { ok: true };
      },
      (req) => String(body(req).what ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/zones/{zone}/target:
   *   post:
   *     summary: Set a firewalld zone target
   *     description: What a zone does with traffic its rules don't match. Saved to the permanent config, then firewalld reloads.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: zone
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
   *               target:
   *                 type: string
   *                 enum: [default, ACCEPT, DROP, "%%REJECT%%"]
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Set.
   */
  router.post(
    "/:hostId/zones/:zone/target",
    write(
      "zone_target",
      async (hostId, settings, req) => {
        const zone = requireZone(param(req, "zone"));
        const target = String(body(req).target ?? "");
        return change(
          hostId,
          settings,
          req,
          { kind: "zoneTarget", zone, target },
          `zoneTarget|${zone} ${target}`,
        );
      },
      (req) => param(req, "zone"),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/default-zone:
   *   post:
   *     summary: Set the firewalld default zone
   *     tags:
   *       - Firewall
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
   *             properties:
   *               zone:
   *                 type: string
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Set.
   */
  router.post(
    "/:hostId/default-zone",
    write(
      "default_zone",
      async (hostId, settings, req) => {
        const zone = requireZone(body(req).zone);
        return change(
          hostId,
          settings,
          req,
          { kind: "defaultZone", zone },
          `defaultZone|${zone}`,
        );
      },
      (req) => String(body(req).zone ?? ""),
    ),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/pending:
   *   get:
   *     summary: The change waiting for Keep
   *     description: Null when there is none. When time runs out the host undoes the change by itself.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The pending change or null.
   */
  router.get(
    "/:hostId/pending",
    read(async (hostId) => ({ pending: await manager.pending(hostId) })),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/pending/keep:
   *   post:
   *     summary: Keep the last change
   *     description: Stops the undo timer on the host. Answers 410 when time already ran out.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Kept.
   */
  router.post(
    "/:hostId/pending/keep",
    write("keep", async (hostId, settings) => manager.keep(hostId, settings)),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/pending/undo:
   *   post:
   *     summary: Undo the last change now
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Undone.
   */
  router.post(
    "/:hostId/pending/undo",
    write("undo", async (hostId, settings) => manager.undo(hostId, settings)),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/fail2ban:
   *   get:
   *     summary: Fail2ban on a host
   *     description: Whether Fail2ban is installed and running, and each jail with its counts and banned addresses.
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The Fail2ban state.
   */
  router.get(
    "/:hostId/fail2ban",
    read(async (hostId, settings) =>
      parseFail2ban(
        (
          await remote.root(hostId, settings.sudo, FAIL2BAN_STATUS, {
            timeoutMs: 45_000,
          })
        ).stdout,
      ),
    ),
  );

  const banRoute = (ban: boolean) =>
    write(
      ban ? "fail2ban_ban" : "fail2ban_unban",
      async (hostId, settings, req) => {
        const jail = requireJail(body(req).jail);
        const ip = requireIp(body(req).ip);
        if (ban && settings.sshGuard && body(req).force !== true) {
          const state = await manager.state(hostId, settings);
          if (state.ssh.client && state.ssh.client === ip) {
            throw new FirewallError(
              "That is the address Termix connects from. Banning it locks Termix out.",
              409,
              {
                code: "SSH_LOCKOUT",
                reason: "Banning the Termix address",
              },
            );
          }
        }
        await manager.locked(hostId, () =>
          remote.root(hostId, settings.sudo, banScript(jail, ip, ban)),
        );
        checker.noteWrite(hostId);
        return { ok: true };
      },
      (req) => `${String(body(req).jail ?? "")} ${String(body(req).ip ?? "")}`,
    );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/fail2ban/ban:
   *   post:
   *     summary: Ban an address in a jail
   *     description: Refuses the address Termix connects from unless force is set.
   *     tags:
   *       - Firewall
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
   *             properties:
   *               jail:
   *                 type: string
   *               ip:
   *                 type: string
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Banned.
   */
  router.post("/:hostId/fail2ban/ban", banRoute(true));

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/fail2ban/unban:
   *   post:
   *     summary: Unban an address in a jail
   *     tags:
   *       - Firewall
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
   *             properties:
   *               jail:
   *                 type: string
   *               ip:
   *                 type: string
   *     responses:
   *       200:
   *         description: Unbanned.
   */
  router.post("/:hostId/fail2ban/unban", banRoute(false));

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/fail2ban/start:
   *   post:
   *     summary: Start Fail2ban
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Started.
   */
  router.post(
    "/:hostId/fail2ban/start",
    write("fail2ban_start", async (hostId, settings) => {
      await remote.root(hostId, settings.sudo, FAIL2BAN_START);
      return { ok: true };
    }),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/watch:
   *   get:
   *     summary: Whether you watch this host
   *     tags:
   *       - Firewall
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The watch state.
   */
  router.get(
    "/:hostId/watch",
    read(async (hostId) => ({ on: await watches.has(actor(), hostId) })),
  );

  /**
   * @openapi
   * /plugin-api/firewall/{hostId}/watch:
   *   put:
   *     summary: Watch a host
   *     description: Sends the signed in user an alert when the firewall turns off or its rules change outside Termix. Checked every 5 minutes.
   *     tags:
   *       - Firewall
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
   *             properties:
   *               on:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.put(
    "/:hostId/watch",
    read(async (hostId, _s, req) => {
      try {
        await watches.set(actor(), hostId, body(req).on === true);
      } catch (error) {
        throw new FirewallError(message(error));
      }
      return { on: body(req).on === true };
    }),
  );
}
