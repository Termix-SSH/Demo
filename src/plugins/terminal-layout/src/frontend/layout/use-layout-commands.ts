import { useEffect, useRef } from "react";
import {
  isSplitTab,
  useShellController,
  type Tab,
} from "@termix-ssh/plugin-sdk/ui";
import type { PrefixCommand } from "../shell/prefix-keys";
import { neighborPane, paneRects } from "./pane-nav";
import { toggleStatusBar } from "./status-bar-store";

/** Tabs shown in the status bar: everything but the empty Home tab. */
export function barTabs(tabs: Tab[]): Tab[] {
  return tabs.filter((tab) => tab.type !== "dashboard");
}

export interface LayoutUi {
  startRename: (tabId: string) => void;
  toggleHelp: () => void;
}

/** Runs a prefix or palette command against the shell. */
export function useLayoutCommands(ui: LayoutUi) {
  const shell = useShellController();
  const shellRef = useRef(shell);
  shellRef.current = shell;
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const lastTabRef = useRef<string | null>(null);
  const currentRef = useRef<string | null>(null);

  useEffect(() => {
    const id = shell.tabs.activeId;
    if (id && id !== currentRef.current) {
      lastTabRef.current = currentRef.current;
      currentRef.current = id;
    }
  }, [shell.tabs.activeId]);

  const runRef = useRef((command: PrefixCommand) => {
    const { tabs, split, palette } = shellRef.current;
    const active = tabs.active;
    const activeSplit = isSplitTab(active) ? active : null;
    const list = barTabs(tabs.topLevel);
    const index = list.findIndex((tab) => tab.id === tabs.activeId);

    switch (command.kind) {
      case "split":
        if (active && active.type !== "dashboard") {
          split.handleAction({ kind: "splitActive", edge: command.edge });
        }
        return;
      case "focus": {
        if (!activeSplit) {
          // No panes: left and right walk the tabs like tmux windows.
          if (list.length < 2) return;
          if (command.direction === "left" || command.direction === "right") {
            const step = command.direction === "right" ? 1 : -1;
            const next = list[(index + step + list.length) % list.length];
            tabs.setActive(next.id);
          }
          return;
        }
        const target = neighborPane(
          paneRects(activeSplit.id),
          activeSplit.split.focusedPaneId,
          command.direction,
        );
        if (target) split.viewActions(activeSplit.id).focusPane(target);
        return;
      }
      case "zoom":
        if (activeSplit) {
          split
            .viewActions(activeSplit.id)
            .toggleZoom(activeSplit.split.focusedPaneId);
        }
        return;
      case "closePane":
        if (activeSplit) {
          split
            .viewActions(activeSplit.id)
            .closePane(activeSplit.split.focusedPaneId);
        } else if (active && active.type !== "dashboard") {
          void tabs.close(active.id);
        }
        return;
      case "equalize":
        if (activeSplit && activeSplit.split.root.kind === "split") {
          split.viewActions(activeSplit.id).equalize(activeSplit.split.root.id);
        }
        return;
      case "palette":
        palette.open();
        return;
      case "nextTab":
      case "prevTab": {
        if (list.length === 0) return;
        const step = command.kind === "nextTab" ? 1 : -1;
        const from = index < 0 ? (step > 0 ? -1 : 0) : index;
        tabs.setActive(list[(from + step + list.length) % list.length].id);
        return;
      }
      case "lastTab": {
        const last = lastTabRef.current;
        if (last && tabs.list.some((tab) => tab.id === last)) {
          tabs.setActive(last);
        }
        return;
      }
      case "jump": {
        const target = list[command.index];
        if (target) tabs.setActive(target.id);
        return;
      }
      case "rename":
        if (active && active.type !== "dashboard") {
          uiRef.current.startRename(active.id);
        }
        return;
      case "statusBar":
        toggleStatusBar();
        return;
      case "help":
        uiRef.current.toggleHelp();
        return;
    }
  });

  return runRef.current;
}
