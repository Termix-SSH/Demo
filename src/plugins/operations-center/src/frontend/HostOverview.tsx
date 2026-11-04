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
import { RiskBadge, Section, StateBadge, when } from "./parts";

const TILE: Record<string, string> = {
  ok: "border-emerald-500/40",
  warn: "border-amber-500/60",
  fail: "border-destructive/70",
  unknown: "border-border",
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
}: {
  host: PluginHostRecord;
  shell: ShellApi;
  catalog: Catalog | null;
  actions: CatalogAction[];
  cards: HostSectionDef[];
  isVisible: boolean;
  onOpenTool: (type: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostId = Number(host.id);
  const [signals, setSignals] = useState<SignalRead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CatalogAction | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [signalList, runList] = await Promise.all([
      getSignals([hostId]).catch(() => []),
      listRuns({ hostId, limit: 8 }).catch(() => []),
    ]);
    setSignals(signalList);
    setRuns(runList);
  }, [hostId]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  // How many of each kind of thing the host has.
  useEffect(() => {
    if (!catalog || !isVisible) return;
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
  }, [actions, catalog, hostId, isVisible]);

  const tiles = useMemo(() => {
    if (!catalog) return [];
    return signals
      .map((signal) => ({
        signal: catalog.signals.find((entry) => entry.id === signal.id),
        read: signal.hosts.find((entry) => entry.hostId === hostId),
      }))
      .filter((tile) => tile.signal && tile.read);
  }, [catalog, hostId, signals]);

  const quick = actions.filter(
    (action) =>
      action.scope === "host" &&
      action.risk !== "read" &&
      action.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const run = async (dryRun: boolean) => {
    if (!picked) return;
    setBusy(true);
    try {
      const outcome = await runAction(picked.id, {
        hostId,
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

  const titleOf = (id: string) =>
    catalog?.actions.find((action) => action.id === id)?.title ?? id;

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      {tiles.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
          {tiles.map(({ signal, read }) => {
            const status = read!.value?.status ?? "unknown";
            const fix = signal!.fix
              ? actions.find((action) => action.id === signal!.fix)
              : undefined;
            return (
              <div
                key={signal!.id}
                className={`flex flex-col gap-1 border-l-4 border p-2 ${TILE[status]}`}
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
                    onClick={() => {
                      setPicked(fix);
                      setValues(initialValues(fix.inputs));
                    }}
                  >
                    {fix.title}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
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
                  <div className="text-muted-foreground">{resource.title}</div>
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

      <Section title={t("host.actions")}>
        {picked ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {picked.title}
              <RiskBadge risk={picked.risk} />
            </div>
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
                disabled={busy}
                onClick={() => void run(true)}
              >
                {t("run.dryRun")}
              </Button>
              <Button
                size="sm"
                variant={
                  picked.risk === "destructive" ? "destructive" : "default"
                }
                disabled={busy}
                onClick={() => void run(false)}
              >
                {t("run.run")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                {t("form.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Input
              value={query}
              placeholder={t("host.searchActions")}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="flex flex-col gap-1">
              {quick.slice(0, 12).map((action) => (
                <ListRow
                  key={action.id}
                  title={action.title}
                  icon={<Zap className="size-4" />}
                  meta={action.pluginName}
                  badges={<RiskBadge risk={action.risk} />}
                  onClick={() => {
                    setPicked(action);
                    setValues(initialValues(action.inputs));
                  }}
                />
              ))}
              {quick.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("host.noActions")}
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={t("host.recent")}>
        {runs.length === 0 ? (
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
      </Section>
    </div>
  );
}
