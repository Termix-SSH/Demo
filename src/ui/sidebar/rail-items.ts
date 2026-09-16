import {
  KeyRound,
  Puzzle,
  Server,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";
import { getNavItems, type NavItemDef } from "@/demo/nav-registry";
import { isElectron } from "@/lib/electron";

/**
 * The core navigation destinations, and the merge that brings in the rest.
 *
 * This used to hold all eighteen destinations as built-ins, which quietly
 * contradicted the thing the demo is here to show: the plugin list claimed
 * Snippets and Docker were plugins while the rail carried them regardless of
 * whether those plugins were installed. Only hosts and credentials are built in
 * now. Everything else arrives through a plugin's `contributions.navItems` and
 * leaves with it.
 */
/**
 * Objects you own, tools you invoke, and the system surfaces. Settings are not
 * a group: they live in their own screen, reached from the account button.
 */
export type RailGroup = "objects" | "tools" | "system";

export const RAIL_GROUP_ORDER: RailGroup[] = ["objects", "tools", "system"];

export interface RailItemDef {
  /** Matches RailView, or a TabType for entries that open a tab instead. */
  id: string;
  icon: LucideIcon;
  /** i18n key; every label goes through t() so nothing is hardcoded English. */
  labelKey: string;
  /** Tab-opening entries (network_graph) rather than sidebar panels. */
  kind?: "tab";
  /** Always-available destinations that users cannot hide. */
  alwaysVisible?: boolean;
  /**
   * Which band of the rail this belongs to. Replaces the old per-item
   * separatorAfter, so a rule marks a real boundary between kinds of thing
   * rather than sitting between every pair of icons.
   */
  group?: RailGroup;
  /** Shown on the mobile bottom bar's primary row rather than its More menu. */
  mobilePrimary?: boolean;
  /**
   * Can also open as a full-width tab in the main area, via ctrl/middle-click
   * or the rail context menu. The id doubles as the TabType.
   */
  promotable?: boolean;
  /**
   * Can be opened in the right dock. Reference panels only -- a list is useful
   * beside your work, an editor is not.
   */
  rightDockable?: boolean;
  /** Desktop app only. Hidden in the browser build, including its toggle. */
  electronOnly?: boolean;
  /** Part of Termix itself, so no plugin can take it away. */
  core?: true;
}

/**
 * Built-in destinations. Hosts and credentials are the two things Termix is
 * always able to show you, with or without any plugins installed.
 */
export const RAIL_ITEMS: RailItemDef[] = [
  {
    id: "hosts",
    group: "objects",
    icon: Server,
    labelKey: "nav.hosts",
    mobilePrimary: true,
    promotable: true,
    core: true,
  },
  {
    id: "credentials",
    group: "objects",
    icon: KeyRound,
    labelKey: "nav.credentials",
    promotable: true,
    core: true,
  },
];

/**
 * How a plugin-contributed destination behaves once it reaches the rail.
 *
 * The plugin manifest says where an entry goes and what it is called; these
 * flags are Termix's call, because promoting to a tab and docking on the right
 * are the shell's affordances rather than the plugin's. Anything not listed
 * gets the sensible default of a plain sidebar panel.
 */
const PLUGIN_ITEM_BEHAVIOUR: Record<
  string,
  Pick<
    RailItemDef,
    "kind" | "promotable" | "rightDockable" | "mobilePrimary" | "electronOnly"
  >
> = {
  "termix-id": { promotable: true },
  connections: { rightDockable: true },
  "quick-connect": { mobilePrimary: true },
  serial: {},
  "ssh-tools": { promotable: true, rightDockable: true, mobilePrimary: true },
  snippets: { promotable: true, rightDockable: true, mobilePrimary: true },
  macros: { promotable: true, rightDockable: true },
  fleets: {},
  automations: { promotable: true },
  ai: { promotable: true, rightDockable: true },
  history: { promotable: true, rightDockable: true },
  "session-logs": { promotable: true, rightDockable: true },
  "split-screen": {},
  workspaces: {},
  alerts: { promotable: true, rightDockable: true },
  "local-terminal": { kind: "tab", electronOnly: true },
  network_graph: { kind: "tab" },
};

/** A plugin's registered destination, in the shape the rail already draws. */
function fromNavItem(item: NavItemDef): RailItemDef {
  return {
    id: item.id,
    icon: item.icon,
    // Plugins ship their own label rather than an i18n key, so it is passed
    // through as a literal and railItemLabel returns it unchanged.
    labelKey: item.label,
    group: item.group,
    ...PLUGIN_ITEM_BEHAVIOUR[item.id],
  };
}

/**
 * Every destination available right now: the core two, plus whatever the
 * installed plugins contribute.
 */
export function allRailItems(): RailItemDef[] {
  const electron = isElectron();
  return [...RAIL_ITEMS, ...getNavItems().map(fromNavItem)].filter(
    (item) => !item.electronOnly || electron,
  );
}

/**
 * Rail items available in the current build. Electron-only destinations are
 * dropped in the browser build so they never reach the rail, the mobile bar,
 * or the visibility toggles.
 */
export function visibleRailItems(): RailItemDef[] {
  return allRailItems();
}

/**
 * Destinations that live outside the rail's hideable list but still need a
 * title and a mobile entry. Alerts is not here: it belongs to the Alerting
 * plugin and comes and goes with it.
 */
export const RAIL_UTILITY_ITEMS: RailItemDef[] = [
  { id: "plugins", icon: Puzzle, labelKey: "nav.plugins", promotable: true },
  {
    id: "settings",
    icon: Settings,
    labelKey: "nav.settings",
    promotable: true,
  },
  { id: "user-profile", icon: User, labelKey: "nav.userProfile" },
  { id: "admin-settings", icon: Settings, labelKey: "nav.admin" },
];

/** Ids that may be opened in the right dock. */
export function rightDockableIds(): string[] {
  return [...allRailItems(), ...RAIL_UTILITY_ITEMS]
    .filter((item) => item.rightDockable)
    .map((item) => item.id);
}

/** Ids that may be opened as a full-width tab. */
export function promotableIds(): string[] {
  return [...allRailItems(), ...RAIL_UTILITY_ITEMS]
    .filter((item) => item.promotable)
    .map((item) => item.id);
}

/** Ids a user is allowed to hide, mirroring HideableRailView. */
export function hideableRailIds(): string[] {
  return allRailItems()
    .filter((item) => !item.alwaysVisible)
    .map((item) => item.id);
}

/**
 * Tab types that are not rail destinations but still need a label.
 *
 * Without an entry here the fallback prints the raw type, which is how the
 * editor tab ended up titled "host-manager".
 */
const EXTRA_LABEL_KEYS: Record<string, string> = {
  "host-manager": "nav.manage",
};

/**
 * Translated label for any rail destination or tab type.
 *
 * Core items carry an i18n key. A plugin carries its own label, which has no
 * key to look up, so t() returns it unchanged and the literal is used.
 */
export function railItemLabel(id: string, t: (key: string) => string): string {
  const core = [...RAIL_ITEMS, ...RAIL_UTILITY_ITEMS].find(
    (item) => item.id === id,
  );
  if (core) return t(core.labelKey);

  const extra = EXTRA_LABEL_KEYS[id];
  if (extra) return t(extra);

  const contributed = getNavItems().find((item) => item.id === id);
  return contributed?.label ?? id;
}

const HIDDEN_KEY = "termix-demo-hidden-rail";
const LEGACY_HIDDEN_KEY = "hiddenRailTabs";

/**
 * What the user has hidden from the rail.
 *
 * The rail shows what is installed -- built-in destinations and whatever the
 * enabled plugins contribute -- so there is nothing to "add". The only choice
 * is to hide something you do not use, and to bring it back later. Storing the
 * hidden set rather than the visible one means a newly installed plugin shows
 * up on its own instead of waiting to be pinned.
 */
export function readHiddenIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter((x) => typeof x === "string");
    }
    // The old app stored the same idea under a different key.
    const legacy = localStorage.getItem(LEGACY_HIDDEN_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed))
        return parsed.filter((x) => typeof x === "string");
    }
  } catch {
    // Unreadable storage just means nothing is hidden.
  }
  return [];
}

export function writeHiddenIds(ids: string[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("hiddenRailChanged"));
  } catch {
    // Private windows refuse writes; the choice just will not persist.
  }
}

export function toggleHidden(id: string): string[] {
  const current = readHiddenIds();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  writeHiddenIds(next);
  return next;
}

/** Rail items in group order, minus anything the user has hidden. */
export function visibleRailDestinations(hidden: string[]): RailItemDef[] {
  const order = new Map(RAIL_GROUP_ORDER.map((g, i) => [g, i]));
  return allRailItems()
    .filter((item) => !hidden.includes(item.id))
    .sort(
      (a, b) =>
        (order.get(a.group ?? "tools") ?? 9) -
        (order.get(b.group ?? "tools") ?? 9),
    );
}
