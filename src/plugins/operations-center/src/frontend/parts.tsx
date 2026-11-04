import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Badge, Button, Select2 } from "@termix-ssh/plugin-sdk/ui";
import type { CatalogAction } from "./api";

export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select2
      value={value}
      aria-label={label}
      className={`h-8 px-2.5 text-xs ${className ?? ""}`}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select2>
  );
}

const TONE: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  ok: "text-emerald-600 dark:text-emerald-400",
  compliant: "text-emerald-600 dark:text-emerald-400",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  fail: "text-destructive",
  error: "text-destructive",
  drifted: "text-amber-600 dark:text-amber-400",
  warn: "text-amber-600 dark:text-amber-400",
  pending_approval: "text-amber-600 dark:text-amber-400",
  paused: "text-amber-600 dark:text-amber-400",
  needs_interaction: "text-amber-600 dark:text-amber-400",
  interrupted: "text-amber-600 dark:text-amber-400",
};

/** A run, host or check state as a small word with a color. */
export function StateBadge({ state }: { state: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={`rounded-none text-[10px] ${TONE[state] ?? ""}`}
    >
      {t(`state.${state}`, { defaultValue: state })}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const { t } = useTranslation();
  if (risk === "read") return null;
  return (
    <Badge
      variant="outline"
      className={`rounded-none text-[10px] ${risk === "destructive" ? "text-destructive" : ""}`}
    >
      {t(`risk.${risk}`)}
    </Badge>
  );
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One page of a list, with the page number kept in range. */
export function pageOf<T>(
  items: T[],
  page: number,
  size: number,
): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const at = Math.min(Math.max(0, page), pages - 1);
  return { rows: items.slice(at * size, at * size + size), page: at, pages };
}

/** Previous and Next under a list. Hidden when there is only one page. */
export function Pager({
  page,
  pages,
  hasNext,
  onPage,
}: {
  page: number;
  /** Total pages when known; leave out for a list read a page at a time. */
  pages?: number;
  hasNext?: boolean;
  onPage: (next: number) => void;
}) {
  const { t } = useTranslation();
  const next = hasNext ?? (pages !== undefined && page < pages - 1);
  if (page === 0 && !next) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
      <Button
        size="sm"
        variant="ghost"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        {t("pager.previous")}
      </Button>
      <span>
        {pages !== undefined
          ? t("pager.pageOf", { page: page + 1, pages })
          : t("pager.page", { page: page + 1 })}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={!next}
        onClick={() => onPage(page + 1)}
      >
        {t("pager.next")}
      </Button>
    </div>
  );
}

/** A client side list a page at a time, back on page one when reset changes. */
export function usePaged<T>(items: T[], size: number, reset?: unknown) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [reset]);
  return { ...pageOf(items, page, size), setPage };
}

/** Runs read a page at a time, each page starting before the last one's oldest. */
export function useRunPages(reset?: unknown) {
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  useEffect(() => {
    setPage(0);
    setCursors([undefined]);
  }, [reset]);
  return {
    page,
    before: cursors[page],
    go: (next: number, oldest?: string) => {
      if (next > page) {
        if (!oldest) return;
        setCursors((prev) => [...prev.slice(0, page + 1), oldest]);
      }
      setPage(next);
    },
  };
}

/** Each plugin with actions in the list, by name, with how many it has. */
export function pluginOptions(
  actions: CatalogAction[],
): { id: string; name: string; count: number }[] {
  const seen = new Map<string, { id: string; name: string; count: number }>();
  for (const action of actions) {
    const entry = seen.get(action.pluginId) ?? {
      id: action.pluginId,
      name: action.pluginName,
      count: 0,
    };
    entry.count += 1;
    seen.set(action.pluginId, entry);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Actions from one plugin (or all when plugin is "") that match the search.
 * A plugin that left the list falls back to all of them.
 */
export function filterActions(
  actions: CatalogAction[],
  plugin: string,
  query: string,
): { matching: CatalogAction[]; plugin: string } {
  const shown = actions.some((action) => action.pluginId === plugin)
    ? plugin
    : "";
  const text = query.trim().toLowerCase();
  return {
    plugin: shown,
    matching: actions.filter(
      (action) =>
        (!shown || action.pluginId === shown) &&
        (!text ||
          action.title.toLowerCase().includes(text) ||
          action.pluginName.toLowerCase().includes(text) ||
          action.id.includes(text)),
    ),
  };
}

/** Plugin filter for an action list. Hidden when only one plugin has actions. */
export function PluginChoice({
  actions,
  value,
  onChange,
  className = "w-56 shrink-0",
}: {
  actions: CatalogAction[];
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const plugins = pluginOptions(actions);
  if (plugins.length < 2) return null;
  return (
    <Choice
      label={t("host.plugin")}
      className={className}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: t("host.allPlugins", { count: actions.length }) },
        ...plugins.map((entry) => ({
          value: entry.id,
          label: `${entry.name} (${entry.count})`,
        })),
      ]}
    />
  );
}
