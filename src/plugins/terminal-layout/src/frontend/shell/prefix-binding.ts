import {
  getUserPreferences,
  parseCustomKeybindings,
  saveUserPreferences,
  type CustomKeybinding,
} from "@termix-ssh/plugin-sdk/ui";
import { defaultPrefixCombo, PREFIX_ACTION } from "./prefix-keys";

const SEEDED_KEY = "terminal-layout.prefixSeeded";

let overridden = false;

/** True once the user has their own binding for the prefix. */
export function prefixOverridden(): boolean {
  return overridden;
}

export function hasPrefixBinding(bindings: CustomKeybinding[]): boolean {
  return bindings.some(
    (binding) =>
      binding.overridesDefaultId === PREFIX_ACTION ||
      binding.action.type === PREFIX_ACTION,
  );
}

export function prefixBinding(
  now = new Date().toISOString(),
): CustomKeybinding {
  return {
    id: `terminal-layout-prefix-${Date.now().toString(36)}`,
    combo: defaultPrefixCombo(),
    action: { type: PREFIX_ACTION },
    enabled: true,
    overridesDefaultId: PREFIX_ACTION,
    createdAt: now,
    updatedAt: now,
  };
}

function readSeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSeeded() {
  try {
    localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    // Private windows can refuse storage; seeding again is harmless.
  }
}

/** Reads the saved bindings to know if the user rebound the prefix. */
export async function loadPrefixOverride(): Promise<CustomKeybinding[]> {
  const prefs = await getUserPreferences();
  const bindings = parseCustomKeybindings(prefs.customKeybindings);
  overridden = hasPrefixBinding(bindings);
  return bindings;
}

/**
 * Terminals send every key to the server except the ones the user bound, so
 * the prefix is saved as a binding the first time the layout runs. It then
 * shows in Keybindings, where people can change or remove it.
 */
export async function seedPrefixBinding(): Promise<void> {
  const bindings = await loadPrefixOverride();
  if (overridden || readSeeded()) return;
  await saveUserPreferences({
    customKeybindings: JSON.stringify([...bindings, prefixBinding()]),
  });
  writeSeeded();
  overridden = true;
  window.dispatchEvent(new Event("customKeybindingsChanged"));
}
