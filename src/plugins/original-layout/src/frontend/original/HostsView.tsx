import { useEffect, useMemo, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  HardDrive,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  ComponentSlot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  getSSHHosts,
  LoadingState,
  requestManage,
  type Host,
  type HostFolder,
  type SSHHostWithStatus,
  type TabType,
} from "@termix-ssh/plugin-sdk/ui";
import {
  invokeAction,
  useSettings,
  useSlotContributions,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  parseHostRows,
  setBarActions,
  setHostRowSaver,
  setHostRows,
} from "../sidebar/tree/host-bar-actions";
import { useHostSidebarPreferences } from "../sidebar/tree/hooks/useHostSidebarPreferences";
import { HostShareModal } from "../sidebar/HostShareModal";
import { slotMenuItems } from "../sidebar/slot-menu-items";
import { FolderCard, type FolderCardActions } from "./FolderCard";
import type { OpenHostOptions } from "./HostRow";
import {
  countHosts,
  filterTree,
  isEmptyQuery,
  isFolder,
  parseHostQuery,
} from "./host-search";
import { fieldBg, outlineButton, wideButton } from "./styles";

const COLLAPSED_KEY = "original-layout.collapsedFolders";
/** The folder card for hosts outside any folder. */
export const NO_FOLDER = "\u0000none";

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list) ? list.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** The host list of the old sidebar: a search box and a card per folder. */
export function HostsView({
  tree,
  loading,
  onOpen,
  onEdit,
}: {
  tree: HostFolder | null;
  loading: boolean;
  onOpen: (host: Host, type: TabType, options?: OpenHostOptions) => void;
  onEdit: (host: Host) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [shareHost, setShareHost] = useState<Host | null>(null);
  const [rawHosts, setRawHosts] = useState<SSHHostWithStatus[]>([]);
  const { preferences } = useHostSidebarPreferences();
  const importMenu = useSlotContributions("hosts.importMenu");
  const importItems = slotMenuItems(importMenu);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 150);
    return () => window.clearTimeout(id);
  }, [search]);

  // Same row button and click choices as the Classic sidebar.
  useEffect(() => {
    setBarActions(preferences.display.barActions);
  }, [preferences.display.barActions]);
  const userSettings = useSettings("user");
  const savedHostRows = userSettings.values.hostRows;
  useEffect(() => {
    setHostRows(parseHostRows(savedHostRows));
  }, [savedHostRows]);
  const saveUserSettings = userSettings.save;
  useEffect(() => {
    if (!userSettings.loaded) return;
    setHostRowSaver((all) => {
      void saveUserSettings({ hostRows: all }).catch(() => {});
    });
    return () => setHostRowSaver(null);
  }, [userSettings.loaded, saveUserSettings]);

  // Plugin dialogs and import items get the raw host list.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getSSHHosts()
        .then((hosts) => {
          if (!cancelled) setRawHosts(hosts);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("ssh-hosts:changed", load);
    window.addEventListener("hosts:refresh", load);
    window.addEventListener("termix:hosts-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("ssh-hosts:changed", load);
      window.removeEventListener("hosts:refresh", load);
      window.removeEventListener("termix:hosts-changed", load);
    };
  }, []);

  const query = useMemo(() => parseHostQuery(debounced), [debounced]);
  const searching = !isEmptyQuery(query);
  const shown = useMemo(
    () => (tree ? filterTree(tree, query) : null),
    [tree, query],
  );

  const looseHosts = shown?.children.filter((c) => !isFolder(c)) ?? [];
  const folders = (shown?.children.filter(isFolder) ?? []).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const looseFolder: HostFolder = {
    name: t("original.noFolder"),
    path: NO_FOLDER,
    children: looseHosts,
  };

  const allPaths = useMemo(() => {
    const paths: string[] = [NO_FOLDER];
    const walk = (folder: HostFolder) => {
      for (const child of folder.children) {
        if (isFolder(child)) {
          paths.push(child.path ?? child.name);
          walk(child);
        }
      }
    };
    if (tree) walk(tree);
    return paths;
  }, [tree]);

  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // Private mode, keep it in memory.
    }
  };
  const toggle = (path: string) => {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    saveCollapsed(next);
  };
  // A search opens every folder so no match hides in a closed one.
  const isExpanded = (path: string) => searching || !collapsed.has(path);

  const actions: FolderCardActions = {
    onOpen,
    onEdit,
    onShare: setShareHost,
    showTags: preferences.display.showTags !== false,
    focusExisting: preferences.display.hostClickBehavior !== "newTab",
  };

  const total = tree ? countHosts(tree) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-2">
        <button
          type="button"
          onClick={() => requestManage({ kind: "browse", mode: "hosts" })}
          className={`${wideButton} h-9 w-full gap-2 text-sm font-semibold`}
        >
          <HardDrive className="size-4" strokeWidth={2.5} />
          {t("original.hostManager")}
        </button>
      </div>
      <div className="h-0.5 shrink-0 bg-border" />
      <div className="flex items-center gap-1.5 p-2">
        <div
          className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[0.5rem] border-2 border-border px-2 ${fieldBg}`}
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("original.searchHosts")}
            aria-label={t("original.searchHosts")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              title={t("original.clearSearch")}
              aria-label={t("original.clearSearch")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("original.hostListActions")}
              aria-label={t("original.hostListActions")}
              className={`${outlineButton} size-8`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              onSelect={() => requestManage({ kind: "host", hostId: null })}
            >
              <Plus className="size-3.5" />
              {t("original.addHost")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => saveCollapsed(new Set())}>
              <ChevronsUpDown className="size-3.5" />
              {t("original.expandAll")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => saveCollapsed(new Set(allPaths))}>
              <ChevronsDownUp className="size-3.5" />
              {t("original.collapseAll")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.dispatchEvent(new CustomEvent("termix:hosts-changed"))
              }
            >
              <RefreshCw className="size-3.5" />
              {t("original.refresh")}
            </DropdownMenuItem>
            {(importItems.length > 0 || importMenu.length > 0) && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Upload className="size-3.5" />
                  {t("original.import")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-44">
                  {importItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem
                        key={item.actionId}
                        onSelect={() =>
                          void invokeAction(item.actionId).catch(() => {})
                        }
                      >
                        {Icon && <Icon className="size-3.5" />}
                        {t(item.titleKey)}
                      </DropdownMenuItem>
                    );
                  })}
                  <ComponentSlot
                    slotId="hosts.importMenu"
                    props={{ hosts: rawHosts }}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 thin-scrollbar">
        {loading && !tree ? (
          <LoadingState />
        ) : total === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("original.noHosts")}
          </p>
        ) : looseHosts.length === 0 && folders.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("original.noMatches")}
          </p>
        ) : (
          <>
            {looseHosts.length > 0 && (
              <FolderCard
                title={looseFolder.name}
                folder={looseFolder}
                expanded={isExpanded(NO_FOLDER)}
                onToggle={toggle}
                isExpanded={isExpanded}
                actions={actions}
              />
            )}
            {folders.map((folder) => (
              <FolderCard
                key={folder.path ?? folder.name}
                title={folder.name}
                folder={folder}
                expanded={isExpanded(folder.path ?? folder.name)}
                onToggle={toggle}
                isExpanded={isExpanded}
                actions={actions}
              />
            ))}
          </>
        )}
      </div>

      <HostShareModal
        open={shareHost !== null}
        onClose={() => setShareHost(null)}
        host={shareHost}
      />
      {/* Plugins mount their own host list dialogs here. */}
      <ComponentSlot
        slotId="hosts.panel"
        props={{ hosts: rawHosts, onHostsChanged: setRawHosts }}
      />
    </div>
  );
}
