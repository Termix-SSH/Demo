import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input, ListRow, ToolbarBand } from "@termix-ssh/plugin-sdk/ui";
import { ArrowLeft, Zap } from "lucide-react";
import { listRuns, type Catalog, type CatalogAction, type Run } from "../api";
import {
  Pager,
  PluginChoice,
  RiskBadge,
  StateBadge,
  filterActions,
  pageOf,
  when,
} from "../parts";
import { ActionTile } from "./ActionTile";

const RUN_PAGE = 8;

/** The latest runs on one host, paged by time. */
export function RunsTile({
  hostId,
  catalog,
  isVisible,
  refresh = 0,
}: {
  hostId: number;
  catalog: Catalog | null;
  isVisible: boolean;
  /** Bump to reload now, after a run. */
  refresh?: number;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<Run[]>([]);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [more, setMore] = useState(false);
  const cursor = cursors[page];

  useEffect(() => {
    setPage(0);
    setCursors([undefined]);
  }, [hostId]);

  const load = useCallback(async () => {
    const list = await listRuns({
      hostId,
      limit: RUN_PAGE + 1,
      before: cursor,
    }).catch(() => null);
    if (!list) return;
    setMore(list.length > RUN_PAGE);
    setRuns(list.slice(0, RUN_PAGE));
  }, [hostId, cursor]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [isVisible, load, refresh]);

  const titleOf = (id: string) =>
    catalog?.actions.find((action) => action.id === id)?.title ?? id;
  const next = () => {
    const last = runs[runs.length - 1]?.createdAt;
    if (!last) return;
    setCursors((prev) => [...prev.slice(0, page + 1), last]);
    setPage(page + 1);
  };

  return (
    <div className="flex flex-col">
      {runs.length === 0 && page === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{t("host.noRuns")}</p>
      ) : (
        runs.map((entry) => (
          <ListRow
            key={entry.id}
            title={titleOf(entry.actionId)}
            meta={[
              entry.summary ?? entry.error,
              entry.username,
              when(entry.createdAt),
            ]
              .filter(Boolean)
              .join(" | ")}
            badges={<StateBadge state={entry.status} />}
          />
        ))
      )}
      <Pager
        page={page}
        hasNext={more}
        onPage={(to) => (to > page ? next() : setPage(to))}
      />
    </div>
  );
}

/**
 * Every action on a host, searchable and by plugin. Picking one shows its
 * form in place.
 */
export function ActionsListTile({
  hostId,
  actions,
  picked,
  onPick,
  pageSize = 10,
  onDone,
}: {
  hostId: number;
  actions: CatalogAction[];
  picked: CatalogAction | null;
  onPick: (action: CatalogAction | null) => void;
  pageSize?: number;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [plugin, setPlugin] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
    setPlugin("");
  }, [hostId]);

  const sorted = useMemo(
    () =>
      actions
        .filter((action) => action.scope !== "server")
        .sort(
          (a, b) =>
            a.pluginName.localeCompare(b.pluginName) ||
            a.title.localeCompare(b.title),
        ),
    [actions],
  );
  const { matching, plugin: shownPlugin } = filterActions(
    sorted,
    plugin,
    query,
  );
  const list = pageOf(matching, page, pageSize);

  if (picked) {
    return (
      <div className="flex flex-col">
        <ToolbarBand>
          <Button
            size="icon-sm"
            variant="ghost"
            title={t("form.cancel")}
            aria-label={t("form.cancel")}
            onClick={() => onPick(null)}
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <span className="truncate text-xs font-medium">{picked.title}</span>
        </ToolbarBand>
        <ActionTile
          key={picked.id}
          action={picked}
          hostId={hostId}
          onDone={() => {
            onPick(null);
            onDone?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border p-2">
        <Input
          className="h-8 min-w-32 flex-1 text-xs"
          value={query}
          placeholder={t("host.searchActions")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <PluginChoice
          actions={sorted}
          value={shownPlugin}
          onChange={(next) => {
            setPlugin(next);
            setPage(0);
          }}
        />
      </div>
      <div className="flex flex-col">
        {list.rows.map((action) => (
          <ListRow
            key={action.id}
            title={action.title}
            icon={<Zap className="size-4" />}
            meta={action.pluginName}
            badges={<RiskBadge risk={action.risk} />}
            dimmed={!action.available}
            onClick={() => onPick(action)}
          />
        ))}
        {matching.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">
            {t("host.noActions")}
          </p>
        )}
      </div>
      <Pager page={list.page} pages={list.pages} onPage={setPage} />
    </div>
  );
}
