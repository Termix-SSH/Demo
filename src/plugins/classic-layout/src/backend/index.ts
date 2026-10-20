import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  createBrandingStore,
  parseBrandingAppName,
  parseBrandingLogoDataUrl,
  parseBrandingTagline,
  type BrandingSettings,
} from "./branding.js";

const PATCHABLE_FIELDS = ["appName", "tagline", "logo"] as const;

export async function activate(ctx: PluginContext): Promise<void> {
  const store = createBrandingStore(
    () => ctx.files.dataDir(),
    (key) => ctx.settings.readCore(key),
  );

  // Core serves the public GET /users/branding from this.
  ctx.registry.provide("classic-layout.brandingProvider", () => store.get());

  const router = ctx.http.router<Router>();
  router.use(ctx.rbac.require("branding") as never);

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
  router.get("/branding", async (_req: Request, res: Response) => {
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
   *       Changes the app name, tagline or logo. The logo is a PNG, JPEG or
   *       WebP data URL, stored as a PNG up to 750 KB. Send null to remove it.
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
  router.patch("/branding", async (req: Request, res: Response) => {
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

  ctx.log.info("Classic layout ready");
}
