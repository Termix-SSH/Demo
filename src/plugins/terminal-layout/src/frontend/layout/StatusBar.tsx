import { useEffect, useRef, useState, type Ref } from "react";
import { Search, Settings } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  cn,
  ComponentSlot,
  getTabType,
  isSplitTab,
  useShellController,
  type Host,
  type Tab,
} from "@termix-ssh/plugin-sdk/ui";
import { barTabs } from "./use-layout-commands";

/** A tab's name in the bar, short like a tmux window name. */
export function tabTitle(tab: Tab, t: (key: string) => string): string {
  if (tab.customLabel) return tab.customLabel;
  if (tab.type === "host-manager") return t("tab.manage");
  if (tab.type === "settings") return t("tab.settings");
  if (tab.host?.name && !isSplitTab(tab)) return tab.host.name;
  if (tab.label) return tab.label;
  const titleKey = getTabType(tab.type)?.titleKey;
  return titleKey ? t(titleKey) : tab.type;
}

/** The host in the focused pane, or of the active tab. */
export function focusedHost(active: Tab | null, list: Tab[]): Host | null {
  if (!active) return null;
  if (isSplitTab(active)) {
    const find = (node: typeof active.split.root): string | null => {
      if (node.kind === "pane") {
        return node.id === active.split.focusedPaneId ? node.tabId : null;
      }
      for (const child of node.children) {
        const hit = find(child);
        if (hit) return hit;
      }
      return null;
    };
    const tabId = find(active.split.root);
    return list.find((tab) => tab.id === tabId)?.host ?? null;
  }
  return active.host ?? null;
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (label: string | null) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={value}
      aria-label={t("terminalLayout.renameTab")}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(null)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") onDone(value.trim());
        if (event.key === "Escape") onDone(null);
      }}
      className="h-full w-32 bg-background px-1 text-foreground outline-none ring-1 ring-accent-brand"
    />
  );
}

/**
 * One thin line at the bottom, like tmux: numbered tabs on the left, the
 * prefix and the focused host on the right.
 */
export function StatusBar({
  armed,
  renamingId,
  onRenameDone,
  onStartRename,
  sinkRef,
  compact,
}: {
  armed: boolean;
  renamingId: string | null;
  onRenameDone: (tabId: string, label: string | null) => void;
  onStartRename: (tabId: string) => void;
  sinkRef: Ref<HTMLSpanElement>;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs, palette } = shell;
  const list = barTabs(tabs.topLevel);
  const host = focusedHost(tabs.active, tabs.list);

  return (
    <footer
      className={cn(
        "flex shrink-0 items-stretch border-t border-border bg-sidebar font-mono text-[11px] leading-none text-muted-foreground",
        compact ? "h-10" : "h-6",
      )}
    >
      <span
        ref={sinkRef}
        tabIndex={-1}
        aria-live="polite"
        className={cn(
          "flex shrink-0 items-center px-2 outline-none",
          armed ? "bg-accent-brand text-background" : "text-accent-brand",
        )}
      >
        {armed ? t("terminalLayout.prefix") : "termix"}
      </span>
      <nav
        aria-label={t("terminalLayout.tabs")}
        className="thin-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto"
      >
        {list.length === 0 && (
          <span className="flex items-center px-2">
            {t("terminalLayout.noTabs")}
          </span>
        )}
        {list.map((tab, i) => {
          const active = tab.id === tabs.activeId;
          const title = tabTitle(tab, t);
          if (tab.id === renamingId) {
            return (
              <RenameInput
                key={tab.id}
                initial={title}
                onDone={(label) => onRenameDone(tab.id, label)}
              />
            );
          }
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? "page" : undefined}
              title={title}
              onClick={() => tabs.setActive(tab.id)}
              onDoubleClick={() => onStartRename(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) void tabs.close(tab.id);
              }}
              className={cn(
                "flex max-w-48 shrink-0 items-center gap-1 px-2 hover:text-foreground",
                active && "bg-accent-brand/15 text-foreground",
              )}
            >
              <span className={active ? "text-accent-brand" : undefined}>
                {i + 1}:
              </span>
              <span className="truncate">{title}</span>
              {active && <span className="text-accent-brand">*</span>}
            </button>
          );
        })}
      </nav>
      {!compact && host && (
        <span className="hidden shrink-0 items-center px-2 md:flex">
          {host.username ? `${host.username}@` : ""}
          {host.ip}
        </span>
      )}
      <div className="flex shrink-0 items-stretch">
        <ComponentSlot
          slotId="tabbar.actions"
          props={{
            targetTab: tabs.targetTerminal,
            className: cn("h-full rounded-none", compact ? "w-10" : "w-7"),
          }}
        />
      </div>
      <button
        type="button"
        onClick={palette.open}
        title={t("terminalLayout.openPalette")}
        aria-label={t("terminalLayout.openPalette")}
        className="flex shrink-0 items-center gap-1 border-l border-border px-2 hover:text-foreground"
      >
        <Search className="size-3" />
        {!compact && <span>Ctrl+Space c</span>}
      </button>
      {compact && (
        <button
          type="button"
          onClick={() => tabs.openSingleton("settings")}
          title={t("tab.settings")}
          aria-label={t("tab.settings")}
          className="flex w-10 shrink-0 items-center justify-center border-l border-border hover:text-foreground"
        >
          <Settings className="size-4" />
        </button>
      )}
    </footer>
  );
}
