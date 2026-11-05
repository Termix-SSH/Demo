import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useToast,
  useTranslation,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Input,
  ListRow,
  TileStack,
  TileWall,
  useConfirm,
  type HostSectionDef,
} from "@termix-ssh/plugin-sdk/ui";
import { Zap } from "lucide-react";
import {
  errorText,
  getResources,
  getSignals,
  listRuns,
  runAction,
  type Catalog,
  type CatalogAction,
  type Run,
  type SignalRead,
} from "./api";
import {
  ActionForm,
  cleanValues,
  initialValues,
  type FormValues,
} from "./ActionForm";
import {
  Pager,
  PluginChoice,
  RiskBadge,
  Section,
  StateBadge,
  filterActions,
  pageOf,
  when,
} from "./parts";
import { TargetField, useResourceChoices } from "./targets";

const RUN_PAGE = 8;

const TILE: Record<string, string> = {
  ok: "border-l-emerald-500/60",
  warn: "border-l-amber-500",
  fail: "border-l-destructive",
  unknown: "border-l-border",
};

/** The host page's first view: tiles, counts, quick actions and history. */
export function HostOverview({
  host,
  shell,
  catalog,
  actions,
  cards,
  isVisible,
  onOpenTool,
  compact = false,
}: {
  host: PluginHostRecord;
  shell: ShellApi;
  catalog: Catalog | null;
  actions: CatalogAction[];
  cards: HostSectionDef[];
  isVisible: boolean;
  onOpenTool: (type: string) => void;
  /** Beside a terminal: no counts, narrower tiles. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const hostId = Number(host.id);
  const [signals, setSignals] = useState<SignalRead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState("");
  // Plugin id to show, or "" for all of them.
  const [plugin, setPlugin] = useState("");
  const [picked, setPicked] = useState<CatalogAction | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [resourceKey, setResourceKey] = useState("");
  const [actionPage, setActionPage] = useState(0);
  // Runs page by the time of the last run on the page before.
  const [runPage, setRunPage] = useState(0);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [moreRuns, setMoreRuns] = useState(false);
  const runCursor = cursors[runPage];
  const choices = useResourceChoices(
    picked?.scope === "resource" ? picked : undefined,
    hostId,
  );

  useEffect(() => {
    setRunPage(0);
    setCursors([undefined]);
    setActionPage(0);
    setPicked(null);
    setPlugin("");
  }, [hostId]);

  const load = useCallback(async () => {
    const [signalList, runList] = await Promise.all([
      getSignals([hostId]).catch(() => null),
      listRuns({ hostId, limit: RUN_PAGE + 1, before: runCursor }).catch(
        () => null,
      ),
    ]);
    if (signalList) setSignals(signalList);
    if (runList) {
      setMoreRuns(runList.length > RUN_PAGE);
      setRuns(runList.slice(0, RUN_PAGE));
    }
  }, [hostId, runCursor]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  // How many of each kind of thing the host has.
  useEffect(() => {
    if (!catalog || !isVisible || compact) return;
    const ids = new Set(actions.map((action) => action.id));
    const relevant = catalog.resources.filter((resource) =>
      ids.has(resource.list),
    );
    let stop = false;
    const tick = async (attempt: number) => {
      const next: Record<string, number> = {};
      let pending = false;
      for (const resource of relevant) {
        const result = await getResources(resource.id, {
          hostIds: [hostId],
        }).catch(() => null);
        if (!result) continue;
        if (result.hosts[0]?.state === "loading") pending = true;
        else if (result.hosts[0]?.state === "ok")
          next[resource.id] = result.rows.length;
      }
      if (stop) return;
      setCounts(next);
      if (pending && attempt < 8)
        setTimeout(() => void tick(attempt + 1), 2000);
    };
    void tick(0);
    return () => {
      stop = true;
    };
  }, [actions, catalog, compact, hostId, isVisible]);

  const tiles = useMemo(() => {
    if (!catalog) return [];
    return signals
      .map((signal) => ({
        signal: catalog.signals.find((entry) => entry.id === signal.id),
        read: signal.hosts.find((entry) => entry.hostId === hostId),
      }))
      .filter((tile) => tile.signal && tile.read);
  }, [catalog, hostId, signals]);

  // Every action on this host, by plugin, a page at a time.
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
  const actionList = pageOf(matching, actionPage, compact ? 6 : 10);

  const pick = (action: CatalogAction) => {
    setPicked(action);
    setValues(initialValues(action.inputs));
    setResourceKey("");
  };

  const nextRuns = () => {
    const last = runs[runs.length - 1]?.createdAt;
    if (!last) return;
    setCursors((prev) => [...prev.slice(0, runPage + 1), last]);
    setRunPage(runPage + 1);
  };

  const run = async (dryRun: boolean) => {
    if (!picked) return;
    if (!dryRun && picked.risk === "destructive") {
      const ok = await confirm({
        title: picked.title,
        description: t("run.destructive"),
        confirmLabel: t("run.run"),
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const outcome = await runAction(picked.id, {
        hostId,
        resourceKey: picked.scope === "resource" ? resourceKey : undefined,
        input: cleanValues(values),
        dryRun,
        confirmed: !dryRun,
      });
      if (outcome.status === "success")
        toast.success(outcome.summary ?? t("state.success"));
      else if (outcome.status === "pending_approval")
        toast.info(t("run.waiting"));
      else toast.error(outcome.error ?? t(`state.${outcome.status}`));
      if (!dryRun) setPicked(null);
      await load();
    } catch (error) {
      toast.error(errorText(error, t("run.failed")));
    } finally {
      setBusy(false);
    }
  };

  const missingTarget = picked?.scope === "resource" && !resourceKey;

  const titleOf = (id: string) =>
    catalog?.actions.find((action) => action.id === id)?.title ?? id;

  return (
    <div className="h-full overflow-auto thin-scrollbar">
      <TileStack>
        {tiles.length > 0 && (
          <TileWall minWidth={compact ? 128 : 160}>
            {tiles.map(({ signal, read }) => {
              const status = read!.value?.status ?? "unknown";
              const fix = signal!.fix
                ? actions.find((action) => action.id === signal!.fix)
                : undefined;
              return (
                <div
                  key={signal!.id}
                  className={`flex flex-col gap-1 border-l-2 p-2 ${TILE[status]}`}
                >
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {signal!.title}
                  </span>
                  <span className="text-sm font-medium">
                    {read!.state === "ok"
                      ? (read!.value?.label ?? String(read!.value?.value ?? ""))
                      : t(`state.${read!.state}`)}
                  </span>
                  {fix && status !== "ok" && read!.state === "ok" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      onClick={() => pick(fix)}
                    >
                      {fix.title}
                    </Button>
                  )}
                </div>
              );
            })}
          </TileWall>
        )}

        {catalog && Object.keys(counts).length > 0 && (
          <Section title={t("host.things")}>
            <div className="flex flex-wrap gap-2">
              {catalog.resources
                .filter((resource) => counts[resource.id] !== undefined)
                .map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    className="border border-border px-3 py-2 text-left text-xs hover:bg-muted"
                    onClick={() => resource.tab && onOpenTool(resource.tab)}
                  >
                    <div className="text-lg font-semibold">
                      {counts[resource.id]}
                    </div>
                    <div className="text-muted-foreground">
                      {resource.title}
                    </div>
                  </button>
                ))}
            </div>
          </Section>
        )}

        {cards.map((card) => {
          const Card = card.component;
          return (
            <Section key={card.id} title={t(card.titleKey)}>
              <Card
                host={host as never}
                isVisible={isVisible}
                shell={shell as never}
              />
            </Section>
          );
        })}

        <Section
          title={t("host.actions")}
          action={
            <span className="text-xs text-muted-foreground">
              {t("host.actionCount", { count: matching.length })}
            </span>
          }
        >
          {picked ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {picked.title}
                <RiskBadge risk={picked.risk} />
              </div>
              {picked.scope === "resource" && (
                <TargetField
                  choices={choices}
                  value={resourceKey}
                  onChange={setResourceKey}
                />
              )}
              <ActionForm
                hostId={hostId}
                fields={picked.inputs}
                values={values}
                onChange={setValues}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || missingTarget}
                  onClick={() => void run(true)}
                >
                  {t("run.dryRun")}
                </Button>
                <Button
                  size="sm"
                  variant={
                    picked.risk === "destructive" ? "destructive" : "default"
                  }
                  disabled={busy || missingTarget}
                  onClick={() => void run(false)}
                >
                  {t("run.run")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPicked(null)}
                >
                  {t("form.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-40 flex-1"
                  value={query}
                  placeholder={t("host.searchActions")}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActionPage(0);
                  }}
                />
                <PluginChoice
                  actions={sorted}
                  className={compact ? "w-full" : undefined}
                  value={shownPlugin}
                  onChange={(next) => {
                    setPlugin(next);
                    setActionPage(0);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                {actionList.rows.map((action) => (
                  <ListRow
                    key={action.id}
                    title={action.title}
                    icon={<Zap className="size-4" />}
                    meta={action.pluginName}
                    badges={<RiskBadge risk={action.risk} />}
                    dimmed={!action.available}
                    onClick={() => pick(action)}
                  />
                ))}
                {matching.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("host.noActions")}
                  </p>
                )}
              </div>
              <Pager
                page={actionList.page}
                pages={actionList.pages}
                onPage={setActionPage}
              />
            </>
          )}
        </Section>

        <Section title={t("host.recent")}>
          {runs.length === 0 && runPage === 0 ? (
            <p className="text-xs text-muted-foreground">{t("host.noRuns")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {runs.map((entry) => (
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
              ))}
            </div>
          )}
          <Pager
            page={runPage}
            hasNext={moreRuns}
            onPage={(next) => (next > runPage ? nextRuns() : setRunPage(next))}
          />
        </Section>
      </TileStack>
    </div>
  );
}
