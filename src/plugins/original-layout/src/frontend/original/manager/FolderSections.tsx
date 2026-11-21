import { useState, type ReactNode } from "react";
import { ChevronUp, Folder } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

export interface FolderGroup<T> {
  /** The folder path, or "" for items outside any folder. */
  folder: string;
  items: T[];
}

/** Groups items by folder: no folder first, then folders by name. */
export function groupByFolder<T>(
  items: T[],
  folderOf: (item: T) => string | null | undefined,
  nameOf: (item: T) => string,
): FolderGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const folder = (folderOf(item) ?? "").trim();
    const list = groups.get(folder);
    if (list) list.push(item);
    else groups.set(folder, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([folder, list]) => ({
      folder,
      items: [...list].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    }));
}

function readCollapsed(key: string): Set<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(list) ? list.filter((v) => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

/** Folder sections with a header and a grid of cards, like v2.2.1. */
export function FolderSections<T>({
  groups,
  storageKey,
  keyOf,
  renderCard,
  forceOpen = false,
}: {
  groups: FolderGroup<T>[];
  /** Where folded sections are remembered. */
  storageKey: string;
  keyOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  /** Open every section, as while searching. */
  forceOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  const toggle = (folder: string) => {
    const next = new Set(collapsed);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Private mode, keep it in memory.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = forceOpen || !collapsed.has(group.folder);
        const name = group.folder || t("original.noFolder");
        return (
          <section
            key={group.folder}
            aria-label={name}
            className="shrink-0 rounded-[0.5rem] border border-border"
          >
            <button
              type="button"
              onClick={() => toggle(group.folder)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[0.5rem]"
            >
              <Folder className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{name}</span>
              <span className="rounded-[0.375rem] bg-[var(--original-field,var(--muted))] px-1.5 text-xs text-muted-foreground">
                {group.items.length}
              </span>
              <ChevronUp
                className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`}
              />
            </button>
            {open && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-2 border-t border-border p-2">
                {group.items.map((item) => (
                  <div key={keyOf(item)} className="min-w-0">
                    {renderCard(item)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
