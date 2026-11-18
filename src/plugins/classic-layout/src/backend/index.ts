import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  createBrandingStore,
  parseBrandingAppName,
  parseBrandingLogoDataUrl,
  parseBrandingTagline,
  type BrandingSettings,
} from "./branding.js";
import {
  createInterfaceDefaultsStore,
  parseDefaults,
} from "./interface-defaults.js";

const PATCHABLE_FIELDS = ["appName", "tagline", "logo"] as const;

export async function activate(ctx: PluginContext): Promise<void> {
  const store = createBrandingStore(
    () => ctx.files.dataDir(),
    (key) => ctx.settings.readCore(key),
  );

  // Core serves the public GET /users/branding from this.
  ctx.registry.provide("classic-layout.brandingProvider", () => store.get());

  const defaults = createInterfaceDefaultsStore(() => ctx.files.dataDir());

  const router = ctx.http.router<Router>();
  const canBrand = ctx.rbac.require("branding") as never;
  const canSetDefaults = ctx.rbac.require("interface-defaults") as never;

  /**
   * @openapi
   * /plugin-api/classic-layout/branding:
   *   get:
   *     summary: Get branding
   *     description: Returns the app name, tagline and logo. Admin only.
   *     tags:
   *       - Branding
   *     responses:
   *       200:
   *         description: The saved branding.
   *       403:
   *         description: Not authorized.
   */
  router.get("/branding", canBrand, async (_req: Request, res: Response) => {
    try {
      res.json(await store.get());
    } catch (error) {
      ctx.log.error(
        "Failed to load branding",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({ error: "Failed to load branding" });
    }
  });

  /**
   * @openapi
   * /plugin-api/classic-layout/branding:
   *   patch:
   *     summary: Update branding
   *     description: >
   *       Changes the app name, tagline or logo. The logo is a PNG or JPEG
   *       data URL, stored as a PNG up to 750 KB. Send null to remove it.
   *       Admin only.
   *     tags:
   *       - Branding
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               appName: { type: string, maxLength: 60 }
   *               tagline: { type: string, maxLength: 160 }
   *               logo: { type: string, nullable: true }
   *     responses:
   *       200:
   *         description: The saved branding.
   *       400:
   *         description: A field is invalid.
   *       403:
   *         description: Not authorized.
   */
  router.patch("/branding", canBrand, async (req: Request, res: Response) => {
    const body = req.body as unknown;
    const invalid = (field: string) =>
      res.status(400).json({
        error: `Invalid value for ${field}`,
        code: "BRANDING_SETTINGS_INVALID",
        field,
      });

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return res.status(400).json({
        error: "Invalid request body",
        code: "BRANDING_SETTINGS_INVALID",
      });
    }
    for (const field of Object.keys(body)) {
      if (!(PATCHABLE_FIELDS as readonly string[]).includes(field)) {
        return res.status(400).json({
          error: `Unknown setting field: ${field}`,
          code: "BRANDING_SETTINGS_UNKNOWN_FIELD",
          field,
        });
      }
    }

    const input = body as Partial<
      Record<(typeof PATCHABLE_FIELDS)[number], unknown>
    >;
    const patch: Partial<BrandingSettings> = {};

    if (input.appName !== undefined) {
      const appName = parseBrandingAppName(input.appName);
      if (appName === null) return invalid("appName");
      patch.appName = appName;
    }
    if (input.tagline !== undefined) {
      const tagline = parseBrandingTagline(input.tagline);
      if (tagline === null) return invalid("tagline");
      patch.tagline = tagline;
    }
    if (input.logo !== undefined) {
      if (input.logo === null) {
        patch.logo = null;
      } else {
        const logo = await parseBrandingLogoDataUrl(input.logo, (error) =>
          ctx.log.warn(
            `Rejected invalid branding logo upload: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        if (logo === null) return invalid("logo");
        patch.logo = logo;
      }
    }

    try {
      res.json(await store.save(patch));
    } catch (error) {
      ctx.log.error(
        "Failed to save branding",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({ error: "Failed to save branding" });
    }
  });

  /**
   * @openapi
   * /plugin-api/classic-layout/interface-defaults:
   *   get:
   *     summary: Get interface defaults
   *     description: >
   *       The look, rail apps and lock an admin picked for everyone and for
   *       each role. Every signed in user reads it to set up their own view.
   *     tags:
   *       - Interface defaults
   *     responses:
   *       200:
   *         description: The saved defaults.
   */
  router.get("/interface-defaults", async (_req: Request, res: Response) => {
    try {
      res.json(await defaults.get());
    } catch (error) {
      ctx.log.error(
        "Failed to load interface defaults",
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({ error: "Failed to load interface defaults" });
    }
  });

  /**
   * @openapi
   * /plugin-api/classic-layout/interface-defaults:
   *   put:
   *     summary: Set interface defaults
   *     description: >
   *       Replaces the defaults. Each template has a preset (simple, balanced
   *       or advanced), the rail item ids to show and whether it is locked.
   *       Roles are keyed by role name.
   *     tags:
   *       - Interface defaults
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               everyone:
   *                 type: object
   *                 nullable: true
   *               roles:
   *                 type: object
   *     responses:
   *       200:
   *         description: The saved defaults.
   *       400:
   *         description: The body is invalid.
   *       403:
   *         description: Not authorized.
   */
  router.put(
    "/interface-defaults",
    canSetDefaults,
    async (req: Request, res: Response) => {
      const parsed = parseDefaults(req.body);
      if (!parsed) {
        return res.status(400).json({
          error: "Invalid interface defaults",
          code: "INTERFACE_DEFAULTS_INVALID",
        });
      }
      try {
        res.json(await defaults.save(parsed));
      } catch (error) {
        ctx.log.error(
          "Failed to save interface defaults",
          error instanceof Error ? error : new Error(String(error)),
        );
        res.status(500).json({ error: "Failed to save interface defaults" });
      }
    },
  );

  ctx.log.info("Classic layout ready");
}
