import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Select2, StatusBadge, TileFrame } from "@termix-ssh/plugin-sdk/ui";
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

/** A run, host or check state as a small word with a color. */
export function StateBadge({ state }: { state: string }) {
  const { t } = useTranslation();
  return (
    <StatusBadge state={state}>
      {t(`state.${state}`, { defaultValue: state })}
    </StatusBadge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const { t } = useTranslation();
  if (risk === "read") return null;
  return (
    <StatusBadge tone={risk === "destructive" ? "bad" : "idle"}>
      {t(`risk.${risk}`)}
    </StatusBadge>
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
    <TileFrame title={title} actions={action} bodyClassName="gap-2 p-3">
      {children}
    </TileFrame>
  );
}

export { Pager, pageOf, usePaged } from "@termix-ssh/plugin-sdk/ui";

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
