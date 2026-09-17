/**
 * Puts the demo back to how a first-time visitor finds it.
 *
 * Hosts, credentials and plugin installs live in module memory and come back on
 * their own after a reload. Everything else the app remembers is in
 * localStorage: rail layout and hidden entries, UI preferences, dock widths,
 * appearance and the adaptive engine. Without a way to clear those, a visitor
 * who hides half the rail has no route back short of clearing site data.
 *
 * The session key is left alone on purpose, so resetting the layout does not
 * also sign you out.
 */

const SESSION_KEY = "termix-demo-session";

/** Exact keys the demo writes, gathered from every module that stores state. */
const KEYS = [
  // appearance
  "termix-accent-color",
  "termix-font-size",
  "termix-ui-font",
  // preferences and rail
  "uiPreferences",
  "hiddenRailTabs",
  "pinAppRail",
  "expandAppRailOnHover",
  // sidebar trees
  "hostSidebarPreferences",
  "credentialSidebarPreferences",
  "hostSidebarArrangeLocked",
  "credentialSidebarArrangeLocked",
  "hostOpenFolders",
  "hostClosedParents",
];

/**
 * Prefixes covering the rest: the termix-demo-* family (dock widths, dashboard
 * slots, sidebar preference copies) and the adaptive engine's versioned key.
 */
const PREFIXES = ["termix-demo-", "termix.local."];

export function clearDemoStorage(): void {
  try {
    const doomed = new Set(KEYS);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PREFIXES.some((prefix) => key.startsWith(prefix))) doomed.add(key);
    }
    doomed.delete(SESSION_KEY);
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Private windows refuse access; there is nothing stored to clear anyway.
  }
}

export function resetDemo(): void {
  clearDemoStorage();
  window.location.reload();
}
