import type { ComponentType } from "react";

/** The parts of a host action a launcher needs. */
export interface LaunchAction {
  id: string;
  kind: "connect" | "open";
  titleKey: string;
  icon: unknown;
  tabType?: string;
  run?: (host: never, shell: never) => void;
  label?: (host: never) => string | undefined;
  items?: (host: never) => {
    id: string;
    label: string;
    run: (host: never, shell: never) => void;
  }[];
}

export interface Launcher {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  run: (shell: unknown) => void;
}

/**
 * Open actions with no tab the page can embed, like a tool that opens one
 * shared tab or a list of web pages. Each one, or each of its items, gets a
 * nav entry that opens it the normal way.
 */
export function launchersFor<H>(
  actions: LaunchAction[],
  host: H,
  t: (key: string) => string,
): Launcher[] {
  const out: Launcher[] = [];
  for (const action of actions) {
    if (action.kind !== "open" || action.tabType) continue;
    const icon = action.icon as Launcher["icon"];
    const items = safeItems(action, host);
    if (items.length > 0) {
      for (const item of items) {
        out.push({
          id: `launch:${action.id}:${item.id}`,
          label: item.label,
          icon,
          run: (shell) => item.run(host as never, shell as never),
        });
      }
      continue;
    }
    const run = action.run;
    if (!run) continue;
    out.push({
      id: `launch:${action.id}`,
      label: safeLabel(action, host) ?? t(action.titleKey),
      icon,
      run: (shell) => run(host as never, shell as never),
    });
  }
  return out;
}

function safeItems<H>(action: LaunchAction, host: H) {
  try {
    return action.items?.(host as never) ?? [];
  } catch {
    return [];
  }
}

function safeLabel<H>(action: LaunchAction, host: H) {
  try {
    return action.label?.(host as never);
  } catch {
    return undefined;
  }
}
