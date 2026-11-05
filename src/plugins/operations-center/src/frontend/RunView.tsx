import { useEffect, useMemo, useState } from "react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  GroupHeading,
  Input,
  ListRow,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { Play, Search, Zap } from "lucide-react";
import { errorText, runAction, type CatalogAction, type Outcome } from "./api";
import {
  ActionForm,
  cleanValues,
  initialValues,
  type FormValues,
} from "./ActionForm";
import { appliesTo, hostLabel } from "./hosts";
import {
  Choice,
  Pager,
  PluginChoice,
  RiskBadge,
  StateBadge,
  filterActions,
  usePaged,
} from "./parts";
import { TargetField, useResourceChoices } from "./targets";

/** Picks one action and one host, then dry runs or runs it. */
export function RunView({
  actions,
  initialActionId,
  initialHostId,
  initialResourceKey,
  onRollout,
  onOpenRun,
}: {
  actions: CatalogAction[];
  initialActionId?: string;
  initialHostId?: number;
  initialResourceKey?: string;
  onRollout: (
    action: CatalogAction,
    input: FormValues,
    resourceKey?: string,
  ) => void;
  onOpenRun: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { hosts } = useHosts();
  const [query, setQuery] = useState("");
  const [plugin, setPlugin] = useState("");
  const [actionId, setActionId] = useState(initialActionId ?? "");
  const action = actions.find((entry) => entry.id === actionId);
  const [hostId, setHostId] = useState<number | undefined>(initialHostId);
  const [resourceKey, setResourceKey] = useState(initialResourceKey ?? "");
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    setValues(action ? initialValues(action.inputs) : {});
    setOutcome(null);
  }, [action]);

  const candidates = useMemo(
    () =>
      action && action.scope !== "server"
        ? hosts.filter((host) => appliesTo(action, host))
        : [],
    [action, hosts],
  );

  useEffect(() => {
    if (!action || action.scope === "server") return;
    if (
      hostId !== undefined &&
      candidates.some((host) => Number(host.id) === hostId)
    ) {
      return;
    }
    setHostId(candidates[0] ? Number(candidates[0].id) : undefined);
  }, [action, candidates, hostId]);

  // A resource action picks its target from the resource's own list.
  const choices = useResourceChoices(action, hostId);

  const listed = useMemo(
    () =>
      actions
        .filter((entry) => entry.risk !== "read" || entry.scope !== "resource")
        .sort(
          (a, b) =>
            a.pluginName.localeCompare(b.pluginName) ||
            a.title.localeCompare(b.title),
        ),
    [actions],
  );
  const { matching: filtered, plugin: shownPlugin } = filterActions(
    listed,
    plugin,
    query,
  );
  const shown = usePaged(filtered, 20, `${shownPlugin}|${query}`);

  const run = async (dryRun: boolean) => {
    if (!action) return;
    if (!dryRun && action.risk === "destructive") {
      const ok = await confirm({
        title: action.title,
        description: t("run.destructive"),
        confirmLabel: t("run.run"),
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const result = await runAction(action.id, {
        hostId: action.scope === "server" ? undefined : hostId,
        resourceKey: action.scope === "resource" ? resourceKey : undefined,
        input: cleanValues(values),
        dryRun,
        confirmed: !dryRun,
      });
      setOutcome(result);
      if (result.status === "pending_approval") toast.info(t("run.waiting"));
    } catch (error) {
      toast.error(errorText(error, t("run.failed")));
    } finally {
      setBusy(false);
    }
  };

  const catalogList = (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            value={query}
            placeholder={t("run.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <PluginChoice
          actions={listed}
          value={shownPlugin}
          onChange={setPlugin}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Zap} title={t("run.none")} hint={t("run.noneHint")} />
      ) : (
        <div className="flex min-h-0 flex-col overflow-auto thin-scrollbar">
          {shown.rows.map((entry, index) => (
            <div key={entry.id} className="flex flex-col">
              {(index === 0 ||
                shown.rows[index - 1].pluginName !== entry.pluginName) && (
                <GroupHeading
                  title={entry.pluginName}
                  className="px-3 pb-1 pt-2.5"
                />
              )}
              <ListRow
                title={entry.title}
                icon={<Zap className="size-4" />}
                meta={t(`run.scope.${entry.scope}`)}
                badges={<RiskBadge risk={entry.risk} />}
                dimmed={!entry.available}
                selected={entry.id === actionId}
                onClick={() => setActionId(entry.id)}
              />
            </div>
          ))}
          <Pager page={shown.page} pages={shown.pages} onPage={shown.setPage} />
        </div>
      )}
    </div>
  );

  if (!action) {
    return (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 w-full flex-col md:w-96 md:shrink-0">
          {catalogList}
        </div>
        <div className="hidden min-h-0 flex-1 items-center justify-center border-l border-border md:flex">
          <EmptyState
            icon={Play}
            title={t("run.pick")}
            hint={t("run.pickHint")}
          />
        </div>
      </div>
    );
  }

  const needsHost = action.scope !== "server";
  const ready =
    action.available &&
    (!needsHost || hostId !== undefined) &&
    (action.scope !== "resource" || !!resourceKey);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="hidden min-h-0 w-96 shrink-0 flex-col md:flex">
        {catalogList}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 thin-scrollbar md:border-l md:border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              {action.title}
              <RiskBadge risk={action.risk} />
            </div>
            <p className="text-xs text-muted-foreground">
              {action.description ?? action.pluginName}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActionId("")}>
            {t("run.change")}
          </Button>
        </div>

        {!action.available && (
          <Alert className="rounded-none text-xs">{t("run.unavailable")}</Alert>
        )}

        {needsHost &&
          (candidates.length === 0 ? (
            <Alert className="rounded-none text-xs">{t("run.noHosts")}</Alert>
          ) : (
            <Field label={t("run.host")}>
              <Choice
                label={t("run.host")}
                value={String(hostId ?? "")}
                onChange={(next) => setHostId(Number(next))}
                options={candidates.map((host) => ({
                  value: String(host.id),
                  label: hostLabel(host),
                }))}
              />
            </Field>
          ))}

        {action.scope === "resource" && (
          <TargetField
            choices={choices}
            value={resourceKey}
            onChange={setResourceKey}
          />
        )}

        <ActionForm
          hostId={hostId}
          fields={action.inputs}
          values={values}
          onChange={setValues}
          disabled={busy}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!ready || busy}
            onClick={() => void run(true)}
          >
            {t("run.dryRun")}
          </Button>
          <Button
            variant={action.risk === "destructive" ? "destructive" : "default"}
            disabled={!ready || busy}
            onClick={() => void run(false)}
          >
            <Play className="mr-1 size-3.5" />
            {t("run.run")}
          </Button>
          {needsHost && (
            <Button
              variant="ghost"
              disabled={!action.available}
              onClick={() =>
                onRollout(action, cleanValues(values), resourceKey || undefined)
              }
            >
              {t("run.manyHosts")}
            </Button>
          )}
        </div>

        {outcome && (
          <div className="flex flex-col gap-1 border border-border p-3 text-xs">
            <div className="flex items-center gap-2">
              <StateBadge state={outcome.status} />
              <span>{outcome.summary ?? outcome.error}</span>
            </div>
            {outcome.data !== undefined && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]">
                {JSON.stringify(outcome.data, null, 2)}
              </pre>
            )}
            {outcome.runId && (
              <button
                type="button"
                className="self-start text-accent-brand underline"
                onClick={() => onOpenRun(outcome.runId!)}
              >
                {t("run.openRun")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
