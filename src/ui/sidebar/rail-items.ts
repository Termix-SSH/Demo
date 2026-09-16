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
  /** In the rail out of the box. Everything else is pinned by the user. */
  defaultPinned?: boolean;
  /** Shown on the mobile bottom bar's primary row rather than its More menu. */
  mobilePrimary?: boolean;
  /**
   * Can also open as a full-width tab in the main area, via ctrl/middle-click
   * or the rail context menu. The id doubles as the TabType.
   */
  promotable?: boolean;
  /**
   * Can be opened in the right dock. Reference panels only -- editors stay in
   * the left sidebar, which is the only dock that widens for them.
   */
  rightDockable?: boolean;
  /** Desktop app only. Hidden in the browser build, including its toggle. */
  electronOnly?: boolean;
}

export const RAIL_ITEMS: RailItemDef[] = [
  {
    id: "hosts",
    group: "objects",
    defaultPinned: true,
    icon: Server,
    labelKey: "nav.hosts",
    mobilePrimary: true,
  },
  {
    id: "credentials",
    group: "objects",
    defaultPinned: true,
    icon: KeyRound,
    labelKey: "nav.credentials",
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
    defaultPinned: true,
    icon: Plug,
    labelKey: "nav.connections",
    rightDockable: true,
  },
  {
    id: "quick-connect",
    group: "tools",
    defaultPinned: true,
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
    defaultPinned: true,
    icon: Hammer,
    labelKey: "nav.sshTools",
    mobilePrimary: true,
    promotable: true,
    rightDockable: true,
  },
  {
    id: "snippets",
    group: "tools",
    defaultPinned: true,
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
    defaultPinned: true,
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

/** Translated label for any rail destination. */
export function railItemLabel(id: string, t: (key: string) => string): string {
  const key = LABEL_KEYS[id];
  return key ? t(key) : id;
}

const PINNED_KEY = "termix-demo-pinned-rail";
const LEGACY_HIDDEN_KEY = "hiddenRailTabs";

/** The six the rail ships with, before the user changes anything. */
export function defaultPinnedIds(): string[] {
  return visibleRailItems()
    .filter((item) => item.defaultPinned)
    .map((item) => item.id);
}

/**
 * What sits in the rail.
 *
 * The old model was subtractive: every destination was present and you hid what
 * you did not want, which made the default wrong for everyone. This is
 * additive. A user upgrading from the old model keeps whatever they had
 * visible, so nobody loses a destination they were using.
 */
export function readPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter((x) => typeof x === "string");
    }
    const legacy = localStorage.getItem(LEGACY_HIDDEN_KEY);
    if (legacy) {
      const hidden = new Set<string>(JSON.parse(legacy));
      const migrated = visibleRailItems()
        .map((item) => item.id)
        .filter((id) => !hidden.has(id));
      writePinnedIds(migrated);
      return migrated;
    }
  } catch {
    // Unreadable storage just means the defaults.
  }
  return defaultPinnedIds();
}

export function writePinnedIds(ids: string[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("pinnedRailChanged"));
  } catch {
    // Private windows refuse writes; the rail just will not persist.
  }
}

export function togglePinned(id: string): string[] {
  const current = readPinnedIds();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  writePinnedIds(next);
  return next;
}

/** Rail items in group order, filtered to what the user has pinned. */
export function pinnedRailItems(pinned: string[]): RailItemDef[] {
  const order = new Map(RAIL_GROUP_ORDER.map((g, i) => [g, i]));
  return visibleRailItems()
    .filter((item) => pinned.includes(item.id))
    .sort(
      (a, b) =>
        (order.get(a.group ?? "tools") ?? 9) -
        (order.get(b.group ?? "tools") ?? 9),
    );
}
