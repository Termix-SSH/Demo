import { lazy, Suspense, useMemo } from "react";
import {
  Columns2,
  Eye,
  Keyboard,
  Maximize2,
  Pencil,
  Rows2,
  StepBack,
  StepForward,
  Equal,
  X,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  getTabType,
  isSplitTab,
  requestManage,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";
import type { PrefixCommand } from "../shell/prefix-keys";
import type { LayoutCommandItem } from "../shell/CommandPalette";
import { barTabs } from "./use-layout-commands";

// Not needed for first paint.
const CommandPalette = lazy(() =>
  import("../shell/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);

const OPENS_AS_SINGLETON = [
  "dashboard",
  "host-manager",
  "user-profile",
  "admin-settings",
  "plugins",
];

/** The pane and tab commands, with the prefix key that does the same. */
export function useLayoutCommandItems(
  run: (command: PrefixCommand) => void,
): LayoutCommandItem[] {
  const { t } = useTranslation();
  const { tabs } = useShellController();
  const active = tabs.active;
  const hasSession = !!active && active.type !== "dashboard";
  const inSplit = isSplitTab(active);
  const many = barTabs(tabs.topLevel).length > 1;
  return useMemo(() => {
    const items: (LayoutCommandItem & { show: boolean })[] = [
      {
        id: "split-right",
        label: t("terminalLayout.keys.splitRight"),
        icon: Columns2,
        keys: "%",
        show: hasSession,
        run: () => run({ kind: "split", edge: "right" }),
      },
      {
        id: "split-down",
        label: t("terminalLayout.keys.splitDown"),
        icon: Rows2,
        keys: '"',
        show: hasSession,
        run: () => run({ kind: "split", edge: "bottom" }),
      },
      {
        id: "zoom",
        label: t("terminalLayout.keys.zoom"),
        icon: Maximize2,
        keys: "z",
        show: inSplit,
        run: () => run({ kind: "zoom" }),
      },
      {
        id: "equalize",
        label: t("terminalLayout.keys.equalize"),
        icon: Equal,
        keys: "=",
        show: inSplit,
        run: () => run({ kind: "equalize" }),
      },
      {
        id: "close-pane",
        label: inSplit
          ? t("terminalLayout.keys.closePane")
          : t("terminalLayout.closeTab"),
        icon: X,
        keys: "x",
        show: hasSession,
        run: () => run({ kind: "closePane" }),
      },
      {
        id: "next-tab",
        label: t("terminalLayout.nextTab"),
        icon: StepForward,
        keys: "n",
        show: many,
        run: () => run({ kind: "nextTab" }),
      },
      {
        id: "prev-tab",
        label: t("terminalLayout.prevTab"),
        icon: StepBack,
        keys: "p",
        show: many,
        run: () => run({ kind: "prevTab" }),
      },
      {
        id: "rename",
        label: t("terminalLayout.keys.rename"),
        icon: Pencil,
        keys: ",",
        show: hasSession,
        run: () => run({ kind: "rename" }),
      },
      {
        id: "status-bar",
        label: t("terminalLayout.keys.statusBar"),
        icon: Eye,
        keys: "s",
        show: true,
        run: () => run({ kind: "statusBar" }),
      },
      {
        id: "help",
        label: t("terminalLayout.keys.help"),
        icon: Keyboard,
        keys: "?",
        show: true,
        run: () => run({ kind: "help" }),
      },
    ];
    return items.filter((item) => item.show);
  }, [t, run, hasSession, inSplit, many]);
}

/** The command palette, opened by any part of the shell through palette.open(). */
export function TerminalPalette({
  run,
  onHome,
}: {
  run: (command: PrefixCommand) => void;
  onHome?: () => void;
}) {
  const shell = useShellController();
  const { tabs, hosts, palette, regions } = shell;
  const commands = useLayoutCommandItems(run);
  if (!palette.isOpen) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette
        isOpen={palette.isOpen}
        setIsOpen={palette.setOpen}
        hosts={hosts.list}
        terminalTabs={tabs.terminalTabs}
        activeTabId={tabs.activeId}
        sessions={barTabs(tabs.topLevel)}
        onSwitchTab={tabs.setActive}
        layoutCommands={commands}
        activeTab={tabs.active}
        onOpenPanel={(view) => {
          if (view === "credentials") {
            requestManage({ kind: "browse", mode: "credentials" });
            return;
          }
          regions.right.setView(view);
        }}
        onEditHost={hosts.edit}
        onOpenSettings={(section) => {
          tabs.openSingleton(
            "settings",
            undefined,
            undefined,
            section ? { section } : undefined,
          );
        }}
        onOpenTab={(type, label, pendingEvent, host) => {
          if (type === "dashboard") onHome?.();
          if (OPENS_AS_SINGLETON.includes(type)) {
            tabs.openSingleton(type, pendingEvent);
          } else if (getTabType(type)?.multiInstance) {
            tabs.openMultiInstance(type);
          } else if (getTabType(type)?.singleton) {
            tabs.openSingleton(
              type,
              undefined,
              host ??
                (label ? hosts.list.find((h) => h.name === label) : undefined),
            );
          } else {
            const target = host ?? hosts.list.find((h) => h.name === label);
            if (target) tabs.open(target, type);
          }
        }}
      />
    </Suspense>
  );
}
