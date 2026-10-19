import { lazy, Suspense } from "react";
import { getTabType, useShellController } from "@termix-ssh/plugin-sdk/ui";

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

/** The command palette, opened by any part of the shell through palette.open(). */
export function ClassicPalette() {
  const shell = useShellController();
  const { tabs, hosts, palette } = shell;
  if (!palette.isOpen) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette
        isOpen={palette.isOpen}
        setIsOpen={palette.setOpen}
        hosts={hosts.list}
        terminalTabs={tabs.terminalTabs}
        activeTabId={tabs.activeId}
        onOpenPanel={(view) => shell.regions.railClick(view)}
        onEditHost={hosts.edit}
        onOpenSettings={(section) =>
          tabs.openSingleton(
            "settings",
            undefined,
            undefined,
            section ? { section } : undefined,
          )
        }
        onOpenTab={(type, label, pendingEvent) => {
          if (OPENS_AS_SINGLETON.includes(type)) {
            tabs.openSingleton(type, pendingEvent);
          } else if (getTabType(type)?.multiInstance) {
            tabs.openMultiInstance(type);
          } else if (getTabType(type)?.singleton) {
            // A singleton plugin tab, optionally preselecting a host.
            tabs.openSingleton(
              type,
              undefined,
              label ? hosts.list.find((h) => h.name === label) : undefined,
            );
          } else if (label) {
            const host = hosts.list.find((h) => h.name === label);
            if (host) tabs.open(host, type);
          }
        }}
      />
    </Suspense>
  );
}
