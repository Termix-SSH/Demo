import {
  Boxes,
  Braces,
  Clock,
  Fingerprint,
  Hammer,
  KeyRound,
  LayoutPanelLeft,
  LayoutTemplate,
  Network,
  Play,
  Plug,
  Puzzle,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  TerminalSquare,
  Usb,
  User,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isElectron } from "@/lib/electron";

/**
 * The one list of navigation destinations.
 *
 * This used to be duplicated in four places -- AppRail's button array, the
 * visibility toggles in UserProfilePanel, AppShell's sidebar title map, and
 * MobileBottomBar's own primary/more lists -- which drifted: half the sidebar
 * titles were hardcoded English, the alerts entry had no visibility toggle,
 * and the mobile bar ignored hidden tabs entirely. Everything now derives from
 * here, so adding a destination is a single edit.
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
  /** Renders a separator after this item in the rail. */
  separatorAfter?: boolean;
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
}

export const RAIL_ITEMS: RailItemDef[] = [
  {
    id: "hosts",
    group: "objects",
    icon: Server,
    labelKey: "nav.hosts",
    mobilePrimary: true,
    promotable: true,
  },
  {
    id: "credentials",
    group: "objects",
    icon: KeyRound,
    labelKey: "nav.credentials",
    promotable: true,
  },
  {
    id: "termix-id",
    group: "objects",
    icon: Fingerprint,
    labelKey: "nav.termixId",
    promotable: true,
  },
  {
    id: "connections",
    group: "objects",
    icon: Plug,
    labelKey: "nav.connections",
    rightDockable: true,
  },
  {
    id: "quick-connect",
    group: "tools",
    icon: Zap,
    labelKey: "nav.quickConnect",
    mobilePrimary: true,
  },
  {
    id: "serial",
    group: "tools",
    icon: Usb,
    labelKey: "nav.serial",
  },
  {
    id: "ssh-tools",
    group: "tools",
    icon: Hammer,
    labelKey: "nav.sshTools",
    mobilePrimary: true,
    promotable: true,
    rightDockable: true,
  },
  {
    id: "snippets",
    group: "tools",
    icon: Play,
    labelKey: "nav.snippets",
    mobilePrimary: true,
    promotable: true,
    rightDockable: true,
  },
  {
    id: "macros",
    group: "tools",
    icon: Braces,
    labelKey: "nav.macros",
    promotable: true,
    rightDockable: true,
  },
  {
    id: "fleets",
    group: "objects",
    icon: Boxes,
    labelKey: "nav.fleets",
  },
  {
    id: "automations",
    group: "tools",
    icon: Workflow,
    labelKey: "nav.automations",
    promotable: true,
  },
  {
    id: "ai",
    group: "tools",
    icon: Sparkles,
    labelKey: "nav.ai",
    promotable: true,
    rightDockable: true,
  },
  {
    id: "history",
    group: "tools",
    icon: Clock,
    labelKey: "nav.history",
    promotable: true,
    rightDockable: true,
  },
  {
    id: "session-logs",
    group: "tools",
    icon: ScrollText,
    labelKey: "nav.sessionLogs",
    promotable: true,
    rightDockable: true,
  },
  {
    id: "split-screen",
    group: "tools",
    icon: LayoutPanelLeft,
    labelKey: "nav.splitScreen",
  },
  {
    id: "workspaces",
    group: "objects",
    icon: LayoutTemplate,
    labelKey: "nav.workspaces",
  },
  {
    id: "local-terminal",
    group: "tools",
    icon: TerminalSquare,
    labelKey: "nav.localTerminal",
    kind: "tab",
    electronOnly: true,
  },
  {
    id: "network_graph",
    group: "tools",
    icon: Network,
    labelKey: "nav.networkGraph",
    kind: "tab",
  },
];

/**
 * Rail items available in the current build. Electron-only destinations are
 * dropped in the browser build so they never reach the rail, the mobile bar,
 * or the visibility toggles.
 */
export function visibleRailItems(): RailItemDef[] {
  const electron = isElectron();
  return RAIL_ITEMS.filter((item) => !item.electronOnly || electron);
}

/**
 * Destinations that live outside the rail's hideable list but still need a
 * title and a mobile entry.
 */
export const RAIL_UTILITY_ITEMS: RailItemDef[] = [
  {
    id: "alerts",
    icon: Plug,
    labelKey: "nav.alerts",
    promotable: true,
    rightDockable: true,
  },
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
export const RIGHT_DOCKABLE_IDS = [...RAIL_ITEMS, ...RAIL_UTILITY_ITEMS]
  .filter((item) => item.rightDockable)
  .map((item) => item.id);

/** Ids that may be opened as a full-width tab. */
export const PROMOTABLE_IDS = [...RAIL_ITEMS, ...RAIL_UTILITY_ITEMS]
  .filter((item) => item.promotable)
  .map((item) => item.id);

/** Ids a user is allowed to hide, mirroring HideableRailView. */
export const HIDEABLE_RAIL_IDS = RAIL_ITEMS.filter(
  (item) => !item.alwaysVisible,
).map((item) => item.id);

const LABEL_KEYS: Record<string, string> = Object.fromEntries(
  [...RAIL_ITEMS, ...RAIL_UTILITY_ITEMS].map((item) => [
    item.id,
    item.labelKey,
  ]),
);

/**
 * Tab types that are not rail destinations but still need a label.
 *
 * Without an entry here the fallback prints the raw type, which is how the
 * editor tab ended up titled "host-manager".
 */
const EXTRA_LABEL_KEYS: Record<string, string> = {
  "host-manager": "nav.manage",
};

/** Translated label for any rail destination or tab type. */
export function railItemLabel(id: string, t: (key: string) => string): string {
  const key = LABEL_KEYS[id] ?? EXTRA_LABEL_KEYS[id];
  return key ? t(key) : id;
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
  return visibleRailItems()
    .filter((item) => !hidden.includes(item.id))
    .sort(
      (a, b) =>
        (order.get(a.group ?? "tools") ?? 9) -
        (order.get(b.group ?? "tools") ?? 9),
    );
}
