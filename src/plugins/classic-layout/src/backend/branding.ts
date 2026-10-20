import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export interface BrandingSettings {
  appName: string;
  tagline: string;
  logo: string | null;
}

export const BRANDING_DEFAULT_APP_NAME = "Termix";
const APP_NAME_MAX_LENGTH = 60;
const TAGLINE_MAX_LENGTH = 160;

/** Cap on the stored (re-encoded PNG) logo. */
export const BRANDING_LOGO_MAX_BYTES = 750 * 1024;
const BRANDING_LOGO_MAX_INPUT_PIXELS = 20_000_000;

/** The keys a 26.10.2 and older server kept this under. */
export const LEGACY_BRANDING_KEYS = {
  appName: "branding_app_name",
  tagline: "branding_tagline",
  logo: "branding_logo",
} as const;

export function parseBrandingAppName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return BRANDING_DEFAULT_APP_NAME;
  if (trimmed.length > APP_NAME_MAX_LENGTH) return null;
  return trimmed;
}

export function parseBrandingTagline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > TAGLINE_MAX_LENGTH) return null;
  return trimmed;
}

/**
 * Accepts a PNG, JPEG or WebP data URL and returns it re-encoded as a PNG, so
 * what is stored and served is always an image we made (no SVG, no metadata).
 */
export async function parseBrandingLogoDataUrl(
  value: unknown,
  onReject?: (error: unknown) => void,
): Promise<string | null> {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/]+=*)$/,
  );
  if (!match) return null;

  const buffer = Buffer.from(match[2], "base64");
  // Reject wildly oversized input before decoding it.
  if (buffer.length === 0 || buffer.length > BRANDING_LOGO_MAX_BYTES * 4) {
    return null;
  }

  try {
    const source = sharp(buffer, {
      failOn: "error",
      limitInputPixels: BRANDING_LOGO_MAX_INPUT_PIXELS,
    });
    const metadata = await source.metadata();
    if (
      !metadata.format ||
      !["png", "jpeg", "webp"].includes(metadata.format)
    ) {
      return null;
    }
    const normalized = await source.rotate().png().toBuffer();
    if (normalized.length > BRANDING_LOGO_MAX_BYTES) return null;
    return `data:image/png;base64,${normalized.toString("base64")}`;
  } catch (error) {
    onReject?.(error);
    return null;
  }
}

/**
 * The saved branding: one JSON file in the plugin's own folder and a copy in
 * memory. A logo is too big for ctx.kv.
 */
export function createBrandingStore(
  dataDir: () => Promise<string>,
  legacy: (key: string) => Promise<string | null>,
) {
  let cache: BrandingSettings | null = null;

  const file = async () => path.join(await dataDir(), "branding.json");

  async function write(settings: BrandingSettings): Promise<void> {
    const target = await file();
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.tmp`;
    await fs.writeFile(temp, JSON.stringify(settings), "utf8");
    await fs.rename(temp, target);
  }

  async function load(): Promise<BrandingSettings> {
    if (cache) return cache;

    try {
      const parsed = JSON.parse(
        await fs.readFile(await file(), "utf8"),
      ) as Partial<BrandingSettings>;
      cache = {
        appName: parsed.appName?.trim() || BRANDING_DEFAULT_APP_NAME,
        tagline: parsed.tagline ?? "",
        logo: parsed.logo || null,
      };
      return cache;
    } catch {
      // No file yet, or a damaged one: start from the old server settings.
    }

    // First run on an install that set branding before this plugin: copy it.
    const [appName, tagline, logo] = await Promise.all([
      legacy(LEGACY_BRANDING_KEYS.appName),
      legacy(LEGACY_BRANDING_KEYS.tagline),
      legacy(LEGACY_BRANDING_KEYS.logo),
    ]);
    cache = {
      appName: appName?.trim() || BRANDING_DEFAULT_APP_NAME,
      tagline: tagline ?? "",
      logo: logo || null,
    };
    if (appName || tagline || logo) await write(cache);
    return cache;
  }

  return {
    get: load,
    async save(patch: Partial<BrandingSettings>): Promise<BrandingSettings> {
      const next = { ...(await load()), ...patch };
      await write(next);
      cache = next;
      return next;
    },
  };
}
