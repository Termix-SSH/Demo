import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Server } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPrimitive,
  Kbd,
  cn,
  defaultConnectAction,
  filterPaletteItems,
  getLiveHostStatus,
  loadPaletteGroup,
  paletteEntriesFor,
  railItemLabel,
  runHostAction,
  useHostActions,
  usePaletteEntries,
  usePaletteGroups,
  useShellController,
  type PaletteItemDef,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useMoreItems } from "./nav";

const ROW = "gap-2 rounded-none";
const ICON = "size-3.5 shrink-0 text-muted-foreground";

/** Search for hosts, screens and plugin actions. Opened by palette.open(). */
export function SimplePalette() {
  const shell = useShellController();
  if (!shell.palette.isOpen) return null;
  return <PaletteBody />;
}

function PaletteBody() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs, hosts, palette } = shell;
  const hostActions = useHostActions();
  const entries = usePaletteEntries();
  const groups = usePaletteGroups();
  const more = useMoreItems();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const [groupItems, setGroupItems] = useState<
    Record<string, PaletteItemDef[]>
  >({});

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const group of groups) {
      void loadPaletteGroup(group).then((items) => {
        if (!cancelled)
          setGroupItems((prev) => ({ ...prev, [group.id]: items }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [groups]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      palette.close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [palette]);

  const query = search.trim().toLowerCase();
  const matches = (...parts: (string | undefined)[]) =>
    !query || parts.some((part) => part?.toLowerCase().includes(query));

  const filteredHosts = useMemo(
    () =>
      hosts.list.filter((host) =>
        matches(host.name, host.ip, host.username, host.folder, ...host.tags),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hosts.list, query],
  );

  const activeTarget = tabs.targetTerminal;
  const run = (action: () => void) => {
    palette.close();
    action();
  };

  const screens = [
    {
      id: "home",
      label: t("nav.home"),
      run: () => tabs.openSingleton("dashboard"),
    },
    {
      id: "hosts",
      label: t("nav.hosts"),
      run: () => tabs.openSingleton("host-manager"),
    },
    {
      id: "settings",
      label: t("nav.settings"),
      run: () => tabs.openSingleton("settings"),
    },
    ...more.map((item) => ({
      id: item.id,
      label: railItemLabel(item.id, t),
      run: () => tabs.openSingleton(item.id),
    })),
  ].filter((item) => matches(item.label));

  const globalEntries = paletteEntriesFor(entries, "global").filter((entry) =>
    matches(t(entry.titleKey), ...(entry.keywords ?? [])),
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 pt-[15vh]"
      onClick={palette.close}
    >
      <div
        className="mx-4 w-full max-w-xl overflow-hidden border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="rounded-none"
          shouldFilter={false}
          loop
          value={value}
          onValueChange={setValue}
        >
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={t("search.placeholder")}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="ml-2">ESC</Kbd>
          </div>

          <CommandList className="thin-scrollbar max-h-[60vh]">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              {t("search.empty", { search })}
            </CommandEmpty>

            {filteredHosts.length > 0 && (
              <CommandGroup heading={t("search.hosts")}>
                {filteredHosts.map((host) => {
                  const online =
                    getLiveHostStatus(Number(host.id)) === "online";
                  return (
                    <CommandItem
                      key={host.id}
                      value={`host-${host.id}`}
                      className={ROW}
                      onSelect={() =>
                        run(() => {
                          const action = defaultConnectAction(
                            hostActions,
                            host,
                          );
                          if (action)
                            runHostAction(action, host, shell.callbacks);
                        })
                      }
                    >
                      <Server
                        className={cn(
                          "size-3.5 shrink-0",
                          online ? "text-success" : "text-muted-foreground",
                        )}
                      />
                      <span className="truncate">{host.name || host.ip}</span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {host.username}@{host.ip}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {screens.length > 0 && (
              <CommandGroup heading={t("search.open")}>
                {screens.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`screen-${item.id}`}
                    className={ROW}
                    onSelect={() => run(item.run)}
                  >
                    <span className="truncate">{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {globalEntries.length > 0 && (
              <CommandGroup heading={t("search.actions")}>
                {globalEntries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <CommandItem
                      key={entry.id}
                      value={`entry-${entry.id}`}
                      className={ROW}
                      onSelect={() =>
                        run(() => entry.run(shell.callbacks, undefined))
                      }
                    >
                      {Icon && <Icon className={ICON} />}
                      <span className="truncate">{t(entry.titleKey)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {groups.map((group) => {
              const items = filterPaletteItems(
                groupItems[group.id] ?? [],
                search,
                group.showWhenEmpty,
              );
              if (items.length === 0) return null;
              return (
                <CommandGroup key={group.id} heading={t(group.titleKey)}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const blocked = !!item.needsTarget && !activeTarget;
                    return (
                      <CommandItem
                        key={`${group.id}-${item.id}`}
                        value={`group-${group.id}-${item.id}`}
                        className={cn(
                          ROW,
                          blocked && "pointer-events-none opacity-50",
                        )}
                        onSelect={() => {
                          if (blocked) return;
                          run(() =>
                            item.run({
                              targetTab: activeTarget,
                              shell: shell.callbacks,
                            }),
                          );
                        }}
                      >
                        {Icon && <Icon className={ICON} />}
                        <span className="truncate">{item.title}</span>
                        {item.description && (
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                        {blocked && (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                            {t("search.noTerminal")}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
