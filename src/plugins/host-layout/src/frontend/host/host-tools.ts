import {
  actionOrder,
  hostActionsFor,
  type Host,
  type HostActionDef,
} from "@termix-ssh/plugin-sdk/ui";

/** This layout's own per host tab, which sits first in the strip. */
export const OVERVIEW_TAB = "host-overview";

export interface HostTools {
  /** Sessions and tools that open as a tab on the host, in strip order. */
  tabs: HostActionDef[];
  /** Actions that do something else (a picker, a dialog, a link). */
  launchers: HostActionDef[];
}

const opensTab = (action: HostActionDef) =>
  !!action.tabType && !action.run && !action.items;

/** What the strip and the header offer for one host. */
export function hostTools(all: HostActionDef[], host: Host): HostTools {
  const actions = hostActionsFor(all, host).filter(
    (action) => action.tabType !== OVERVIEW_TAB,
  );
  const sessions = actions
    .filter((action) => action.kind === "connect" && opensTab(action))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const tools = actions
    .filter((action) => action.kind === "open" && opensTab(action))
    .sort((a, b) => actionOrder(a) - actionOrder(b));
  // One entry per tab type, the first action wins.
  const seen = new Set<string>();
  const tabs = [...sessions, ...tools].filter((action) => {
    if (seen.has(action.tabType!)) return false;
    seen.add(action.tabType!);
    return true;
  });
  const launchers = actions
    .filter((action) => !opensTab(action))
    .sort((a, b) => actionOrder(a) - actionOrder(b));
  return { tabs, launchers };
}

interface TabLike {
  id: string;
  type: string;
  host?: { id: string | number };
  parentSplitTabId?: string;
}

/** Open tabs on a host, not counting ones inside a split. */
export function tabsOnHost<T extends TabLike>(
  tabs: T[],
  hostId: string | number,
): T[] {
  return tabs.filter(
    (tab) =>
      tab.host &&
      String(tab.host.id) === String(hostId) &&
      !tab.parentSplitTabId,
  );
}

/** The ids of every host with at least one open tab, with the count. */
export function openCountByHost<T extends TabLike>(
  tabs: T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tab of tabs) {
    if (!tab.host || tab.parentSplitTabId || tab.type === OVERVIEW_TAB) {
      continue;
    }
    const id = String(tab.host.id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// The tab last shown per host, so going back to a host shows it again.
const lastTab = new Map<string, string>();

export function rememberHostTab(hostId: string | number, tabId: string) {
  lastTab.set(String(hostId), tabId);
}

export function lastHostTab(hostId: string | number): string | undefined {
  return lastTab.get(String(hostId));
}

export function forgetHostTabs() {
  lastTab.clear();
}
