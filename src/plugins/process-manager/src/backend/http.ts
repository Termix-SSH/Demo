import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings, type HostSettings } from "./host-settings.js";

type Level = "connect" | "edit";

export type Handler = (
  hostId: number,
  req: Request,
  settings: HostSettings,
) => Promise<unknown>;

/** Maps a thrown error to a JSON answer. Unknown errors are not shown. */
export function fail(ctx: PluginContext, res: Response, error: unknown): void {
  if (error instanceof HostScriptError) {
    res.status(error.status).json({ error: error.message, ...error.extra });
    return;
  }
  ctx.log.warn(
    `Request failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  res.status(500).json({ error: "Something went wrong" });
}

/**
 * Route wrappers shared by every route. Reads need connect access to the
 * host, changes need edit access, are refused on read only hosts and are
 * audited.
 */
export function createHttp(router: Router, ctx: PluginContext) {
  router.use(ctx.rbac.require("use") as never);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  async function gate(hostId: number, level: Level): Promise<HostSettings> {
    if (!Number.isInteger(hostId) || hostId < 1) {
      throw new HostScriptError("The host id is not valid");
    }
    if (!(await ctx.hosts.checkAccess(hostId, level)).hasAccess) {
      if (
        level === "edit" &&
        (await ctx.hosts.checkAccess(hostId, "connect")).hasAccess
      ) {
        throw new HostScriptError("You need edit access to this host", 403, {
          code: "HOST_EDIT_REQUIRED",
        });
      }
      throw new HostScriptError("Host not found", 404);
    }
    const settings = await readHostSettings(ctx, hostId);
    if (!settings.enabled) {
      throw new HostScriptError(
        "Process Manager is turned off for this host",
        400,
        {
          code: "disabled",
        },
      );
    }
    if (level === "edit" && settings.readOnly) {
      throw new HostScriptError(
        "This host is read only in Process Manager",
        403,
        {
          code: "readOnly",
        },
      );
    }
    return settings;
  }

  const read =
    (run: Handler) =>
    async (req: Request, res: Response): Promise<void> => {
      try {
        const hostId = Number(req.params.hostId);
        const settings = await gate(hostId, "connect");
        res.json(await run(hostId, req, settings));
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  const write =
    (action: string, run: Handler, target?: (req: Request) => string) =>
    async (req: Request, res: Response): Promise<void> => {
      const hostId = Number(req.params.hostId);
      let name: string | undefined;
      try {
        name = target?.(req) || undefined;
      } catch {
        name = undefined;
      }
      try {
        const settings = await gate(hostId, "edit");
        const result = await run(hostId, req, settings);
        void ctx.audit.record({
          action: `process-manager.${action}`,
          resourceType: "host",
          resourceId: String(hostId),
          resourceName: name,
          success: true,
        });
        res.json(result ?? { ok: true });
      } catch (error) {
        void ctx.audit.record({
          action: `process-manager.${action}`,
          resourceType: "host",
          resourceId: String(hostId),
          resourceName: name,
          success: false,
          errorMessage: error instanceof Error ? error.message : undefined,
        });
        fail(ctx, res, error);
      }
    };

  /**
   * A change that runs as one of the plugin's own actions, so it lands in the
   * same history as one made from Operations or the CLI. The action audits
   * itself.
   */
  const act =
    (
      actionId: (req: Request) => string,
      options: (req: Request) => {
        resourceKey?: string;
        input?: Record<string, unknown>;
      },
    ) =>
    async (req: Request, res: Response): Promise<void> => {
      try {
        const hostId = Number(req.params.hostId);
        await gate(hostId, "edit");
        const outcome = await ctx.operations.run(actionId(req), {
          hostId,
          ...options(req),
          confirmed: true,
          via: "ui",
        });
        if (outcome.status !== "success") {
          throw new HostScriptError(
            outcome.error || outcome.summary || outcome.status,
            outcome.approvalId ? 202 : 400,
            {
              code: outcome.errorCode ?? outcome.status,
              approvalId: outcome.approvalId,
            },
          );
        }
        res.json({
          ok: true,
          output: outcome.summary ?? "",
          data: outcome.data,
        });
      } catch (error) {
        fail(ctx, res, error);
      }
    };

  /** True when the caller may change this host. */
  const canEdit = async (hostId: number, settings: HostSettings) =>
    !settings.readOnly &&
    (await ctx.hosts.checkAccess(hostId, "edit")).hasAccess;

  return { read, write, act, canEdit };
}

export const body = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>;

export const str = (value: unknown): string =>
  typeof value === "string" ? value : "";
