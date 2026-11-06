import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostSummary } from "../shared/types.js";
import { openVulns, overall, scoreOf } from "./conditions.js";
import type { Engine, HostState } from "./engine.js";
import { SecurityError } from "./errors.js";
import { readAdminSettings, readHostSettings } from "./host-settings.js";
import type { Service } from "./service.js";
import { FP_RE } from "./scripts.js";
import type { Store } from "./store.js";
import { parseConfig, requireAdvisory, requireHostId } from "./validate.js";

export interface Deps {
  store: Store;
  engine: Engine;
  service: Service;
}

type Level = "connect" | "edit" | "manage";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof SecurityError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(`Security Center request failed: ${message(error)}`);
  res.status(500).json({ error: "Something went wrong" });
}

function counts(state: HostState | undefined) {
  const vulns = state?.scan?.vulns ?? [];
  const open = openVulns(vulns);
  return {
    critical: open.filter((v) => v.severity === "critical").length,
    kev: open.filter((v) => v.kev).length,
  };
}

/**
 * Mounts the routes on the plugin's router, which core serves at
 * /plugin-api/security-center with auth in front. Reads need connect access
 * to the host, changes need edit access, key changes need manage access.
 */
export function registerRoutes(
  router: Router,
  ctx: PluginContext,
  deps: Deps,
): void {
  const { store, engine, service } = deps;

  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const hostOf = (req: Request) => requireHostId(req.params.hostId);

  async function gate(hostId: number, level: Level) {
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level !== "connect" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new SecurityError(`You need ${level} access to this host`, 403, {
          code: "HOST_ACCESS_REQUIRED",
        });
      }
      throw new SecurityError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new SecurityError(
        "Security Center is turned off for this host",
        403,
        { code: "disabled" },
      );
    }
    if (level !== "connect" && settings.readOnly) {
      throw new SecurityError("This host is read only", 403, {
        code: "readOnly",
      });
    }
    return settings;
  }

  /**
   * @openapi
   * /summary:
   *   get:
   *     summary: Security score of every host the user can see
   *     description: Uses the data the background timer already collected, so it never opens an SSH connection.
   *     responses:
   *       200:
   *         description: One row per watched host.
   */
  router.get("/summary", async (_req, res) => {
    try {
      const rows = await store.all();
      const out: HostSummary[] = [];
      await Promise.all(
        rows.map(async (row) => {
          try {
            const access = await ctx.hosts.checkAccess(row.hostId, "connect");
            if (!access.hasAccess) return;
            if (!(await readHostSettings(ctx, row.hostId)).enabled) return;
          } catch {
            return;
          }
          const state = engine.state(row.hostId);
          const host = (await ctx.hosts.get(row.hostId).catch(() => null)) as {
            name?: string;
            ip?: string;
          } | null;
          const vulns = state?.scan?.vulns ?? [];
          const findings = state?.findings ?? [];
          const c = counts(state);
          out.push({
            hostId: row.hostId,
            label: host?.name || host?.ip || `Host ${row.hostId}`,
            status: overall(state?.reading ?? null, findings, vulns),
            score: state?.reading ? scoreOf(findings, vulns) : null,
            findings: findings.length,
            critical: c.critical,
            kev: c.kev,
            keys: state?.reading?.keys.length ?? 0,
            error: state?.error ?? "",
          });
        }),
      );
      out.sort((a, b) => a.label.localeCompare(b.label));
      res.json(out);
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  async function view(hostId: number, force: boolean) {
    const settings = await gate(hostId, "connect");
    const { row, state } = await service.fresh(hostId, force);
    const level = async (l: Level) =>
      !settings.readOnly &&
      (
        await ctx.hosts.checkAccess(hostId, l).catch(() => ({
          hasAccess: false,
        }))
      ).hasAccess;
    const admin = await readAdminSettings(ctx);
    const vulns = state.scan?.vulns ?? [];
    // How many other watched hosts accept the same key.
    const seenOn: Record<string, number> = {};
    for (const other of await store.all()) {
      if (other.hostId === hostId) continue;
      const keys = engine.state(other.hostId)?.reading?.keys ?? [];
      const prints = new Set(
        keys.filter((k) => k.kind === "authorized").map((k) => k.fingerprint),
      );
      for (const fp of prints) seenOn[fp] = (seenOn[fp] ?? 0) + 1;
    }
    return {
      hostId,
      canEdit: await level("edit"),
      canManage: await level("manage"),
      useSudo: settings.useSudo,
      scanEnabled: admin.scanVulns,
      config: {
        hostId,
        alerts: row.alerts,
        intervalMin: row.intervalMin,
        vulnIntervalH: row.vulnIntervalH,
        minRsaBits: row.minRsaBits,
        keyMaxAgeDays: row.keyMaxAgeDays,
      },
      status: overall(state.reading, state.findings, vulns),
      score: state.reading ? scoreOf(state.findings, vulns) : null,
      reading: state.reading,
      findings: state.findings,
      error: state.error,
      readAt: state.readAt,
      active: [...state.active],
      seenOn,
      scan: state.scan
        ? {
            at: state.scan.at,
            ecosystem: state.scan.ecosystem,
            packages: state.scan.packages,
            pending: state.scan.pending,
            unsupported: state.scan.unsupported,
            error: state.scan.error,
            kevChecked: state.scan.kevChecked,
            total: vulns.length,
            ...counts(state),
          }
        : null,
      scanning: state.scanning,
    };
  }

  /**
   * @openapi
   * /{hostId}:
   *   get:
   *     summary: Keys, findings and scan summary for a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The latest reading, read again when it is older than a minute.
   */
  router.get("/:hostId", async (req, res) => {
    try {
      res.json(await view(hostOf(req), false));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/refresh:
   *   post:
   *     summary: Read the keys on the host now
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The new reading.
   */
  router.post("/:hostId/refresh", async (req, res) => {
    try {
      res.json(await view(hostOf(req), true));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/config:
   *   put:
   *     summary: Change alerts, intervals and key limits for a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The saved settings.
   */
  router.put("/:hostId/config", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const row = await service.row(hostId);
      const config = parseConfig(body(req), row);
      await store.update(hostId, config);
      res.json({ hostId, ...config });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/vulns:
   *   get:
   *     summary: Known vulnerabilities in the installed packages
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The last scan, worst first.
   */
  router.get("/:hostId/vulns", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      await service.row(hostId);
      const state = engine.state(hostId);
      res.json({
        scan: state?.scan ?? null,
        scanning: state?.scanning ?? false,
      });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/scan:
   *   post:
   *     summary: Scan the installed packages now
   *     description: Sends package names and versions to OSV, or to the OSV address an admin set.
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: The finished scan.
   */
  router.post(
    "/:hostId/scan",
    ctx.rbac.require("scan-vulns") as never,
    async (req, res) => {
      try {
        const hostId = hostOf(req);
        await gate(hostId, "edit");
        const state = await service.scanNow(hostId);
        res.json({ scan: state.scan, scanning: state.scanning });
      } catch (error) {
        fail(ctx, res, error);
      }
    },
  );

  /**
   * @openapi
   * /{hostId}/ignore:
   *   post:
   *     summary: Hide an advisory on a host
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               advisory: { type: string }
   *               note: { type: string }
   *     responses:
   *       200:
   *         description: Saved.
   */
  router.post("/:hostId/ignore", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      const advisory = requireAdvisory(body(req).advisory);
      await service.ignore(
        hostId,
        advisory,
        String(body(req).note ?? "").slice(0, 300),
      );
      res.json({ ok: true });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/ignore/{advisory}:
   *   delete:
   *     summary: Show a hidden advisory again
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: advisory
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Removed.
   */
  router.delete("/:hostId/ignore/:advisory", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "edit");
      await service.unignore(hostId, requireAdvisory(req.params.advisory));
      res.json({ ok: true });
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  /**
   * @openapi
   * /{hostId}/events:
   *   get:
   *     summary: Problems found and cleared, scans and rotations
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: Newest first.
   */
  router.get("/:hostId/events", async (req, res) => {
    try {
      const hostId = hostOf(req);
      await gate(hostId, "connect");
      res.json(await store.events(hostId));
    } catch (error) {
      fail(ctx, res, error);
    }
  });

  const audit = (
    req: Request,
    action: string,
    hostId: number,
    ok: boolean,
    detail: string,
  ) =>
    ctx.audit
      .record({
        action,
        resourceType: "host",
        resourceId: String(hostId),
        details: detail.slice(0, 300),
        success: ok,
        errorMessage: ok ? undefined : detail.slice(0, 300),
        request: req,
      })
      .catch(() => undefined);

  /**
   * @openapi
   * /{hostId}/rotate-login-key:
   *   post:
   *     summary: Replace the key Termix logs in to the host with
   *     description: Adds a new key, checks it logs in, saves it as a credential, points the host at it and only then removes the old key. Any failure leaves the old key in place.
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: What was done.
   */
  router.post(
    "/:hostId/rotate-login-key",
    ctx.rbac.require("rotate") as never,
    async (req, res) => {
      const hostId = hostOf(req);
      try {
        await gate(hostId, "manage");
        const text = await service.rotateLoginKey(hostId);
        await audit(req, "security_rotate_login_key", hostId, true, text);
        res.json({ ok: true, message: text });
      } catch (error) {
        await audit(
          req,
          "security_rotate_login_key",
          hostId,
          false,
          message(error),
        );
        fail(ctx, res, error);
      }
    },
  );

  /**
   * @openapi
   * /{hostId}/revoke:
   *   post:
   *     summary: Remove a key from an authorized keys file
   *     description: Removes every line with this fingerprint from the file. The key Termix logs in with is refused. A backup is kept next to the file.
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               path: { type: string }
   *               fingerprint: { type: string }
   *     responses:
   *       200:
   *         description: What was done.
   */
  router.post(
    "/:hostId/revoke",
    ctx.rbac.require("rotate") as never,
    async (req, res) => {
      const hostId = hostOf(req);
      try {
        await gate(hostId, "manage");
        const { path, fingerprint } = body(req);
        if (!FP_RE.test(String(fingerprint ?? ""))) {
          throw new SecurityError("The fingerprint is not valid");
        }
        const text = await service.revoke(
          hostId,
          String(path ?? ""),
          String(fingerprint),
        );
        await audit(req, "security_revoke_key", hostId, true, text);
        res.json({ ok: true, message: text });
      } catch (error) {
        await audit(req, "security_revoke_key", hostId, false, message(error));
        fail(ctx, res, error);
      }
    },
  );

  /**
   * @openapi
   * /{hostId}/rotate-host-keys:
   *   post:
   *     summary: Make new SSH host keys on the host
   *     description: Copies the old host keys, makes new ones and reloads sshd. Every client sees a changed host key afterwards, Termix included.
   *     parameters:
   *       - in: path
   *         name: hostId
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: What was done.
   */
  router.post(
    "/:hostId/rotate-host-keys",
    ctx.rbac.require("rotate") as never,
    async (req, res) => {
      const hostId = hostOf(req);
      try {
        await gate(hostId, "manage");
        const text = await service.rotateHostKeys(hostId);
        await audit(req, "security_rotate_host_keys", hostId, true, text);
        res.json({ ok: true, message: text });
      } catch (error) {
        await audit(
          req,
          "security_rotate_host_keys",
          hostId,
          false,
          message(error),
        );
        fail(ctx, res, error);
      }
    },
  );
}
