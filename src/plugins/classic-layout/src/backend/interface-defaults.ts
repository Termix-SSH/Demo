import fs from "node:fs/promises";
import path from "node:path";

export type InterfacePreset = "simple" | "balanced" | "advanced";

/** What one group of people starts with. */
export interface InterfaceTemplate {
  preset: InterfacePreset;
  /** Rail item ids shown on the rail. The rest sit in All apps. */
  pins: string[];
  /** People in this group can't change their look or rail. */
  locked: boolean;
}

/** `everyone` applies to anyone whose roles have no template of their own. */
export interface InterfaceDefaults {
  everyone: InterfaceTemplate | null;
  roles: Record<string, InterfaceTemplate>;
}

const PRESETS: InterfacePreset[] = ["simple", "balanced", "advanced"];
const MAX_PINS = 100;
const MAX_ROLES = 200;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const EMPTY_DEFAULTS: InterfaceDefaults = { everyone: null, roles: {} };

/** A valid template, or null for anything malformed. */
export function parseTemplate(value: unknown): InterfaceTemplate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!PRESETS.includes(input.preset as InterfacePreset)) return null;
  if (!Array.isArray(input.pins) || input.pins.length > MAX_PINS) return null;
  if (
    !input.pins.every((pin) => typeof pin === "string" && ID_PATTERN.test(pin))
  )
    return null;
  if (typeof input.locked !== "boolean") return null;
  return {
    preset: input.preset as InterfacePreset,
    pins: [...new Set(input.pins as string[])],
    locked: input.locked,
  };
}

/** A valid defaults document, or null for anything malformed. */
export function parseDefaults(value: unknown): InterfaceDefaults | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  let everyone: InterfaceTemplate | null = null;
  if (input.everyone !== null && input.everyone !== undefined) {
    everyone = parseTemplate(input.everyone);
    if (!everyone) return null;
  }
  const roles: Record<string, InterfaceTemplate> = {};
  if (input.roles !== undefined) {
    if (
      !input.roles ||
      typeof input.roles !== "object" ||
      Array.isArray(input.roles)
    )
      return null;
    const entries = Object.entries(input.roles as Record<string, unknown>);
    if (entries.length > MAX_ROLES) return null;
    for (const [role, template] of entries) {
      if (!ID_PATTERN.test(role)) return null;
      const parsed = parseTemplate(template);
      if (!parsed) return null;
      roles[role] = parsed;
    }
  }
  return { everyone, roles };
}

/** The saved defaults: one JSON file in the plugin's own folder. */
export function createInterfaceDefaultsStore(dataDir: () => Promise<string>) {
  let cache: InterfaceDefaults | null = null;
  const file = async () =>
    path.join(await dataDir(), "interface-defaults.json");

  return {
    async get(): Promise<InterfaceDefaults> {
      if (cache) return cache;
      try {
        cache =
          parseDefaults(JSON.parse(await fs.readFile(await file(), "utf8"))) ??
          EMPTY_DEFAULTS;
      } catch {
        cache = EMPTY_DEFAULTS;
      }
      return cache;
    },
    async save(next: InterfaceDefaults): Promise<InterfaceDefaults> {
      const target = await file();
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.tmp`;
      await fs.writeFile(temp, JSON.stringify(next), "utf8");
      await fs.rename(temp, target);
      cache = next;
      return next;
    },
  };
}
