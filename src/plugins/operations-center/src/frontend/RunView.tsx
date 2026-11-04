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
  Input,
  ListRow,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { Play, Search, Zap } from "lucide-react";
import {
  errorText,
  getResources,
  runAction,
  type CatalogAction,
  type Outcome,
} from "./api";
import {
  ActionForm,
  cleanValues,
  initialValues,
  type FormValues,
} from "./ActionForm";
import { appliesTo, hostLabel } from "./hosts";
import { Choice, RiskBadge, StateBadge } from "./parts";

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
  const [actionId, setActionId] = useState(initialActionId ?? "");
  const action = actions.find((entry) => entry.id === actionId);
  const [hostId, setHostId] = useState<number | undefined>(initialHostId);
  const [resourceKey, setResourceKey] = useState(initialResourceKey ?? "");
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [choices, setChoices] = useState<{ key: string; name: string }[]>([]);

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
  useEffect(() => {
    setChoices([]);
    if (!action?.resource || hostId === undefined) return;
    let stop = false;
    const load = async (attempt: number) => {
      try {
        const result = await getResources(action.resource!, {
          hostIds: [hostId],
        });
        if (stop) return;
        const state = result.hosts[0]?.state;
        if (state === "loading" && attempt < 10) {
          setTimeout(() => void load(attempt + 1), 1500);
          return;
        }
        setChoices(
          result.rows.map((row) => ({
            key: row.key,
            name: String(row.row.name ?? row.key),
          })),
        );
      } catch {
        // The picker stays empty and a key can still be typed.
      }
    };
    void load(0);
    return () => {
      stop = true;
    };
  }, [action, hostId]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return actions
      .filter((entry) => entry.risk !== "read" || entry.scope !== "resource")
      .filter(
        (entry) =>
          !text ||
          entry.title.toLowerCase().includes(text) ||
          entry.pluginName.toLowerCase().includes(text) ||
          entry.id.includes(text),
      );
  }, [actions, query]);

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

  if (!action) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-7"
            value={query}
            placeholder={t("run.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Zap}
            title={t("run.none")}
            hint={t("run.noneHint")}
          />
        ) : (
          <div className="flex flex-col gap-1 overflow-auto">
            {filtered.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.title}
                icon={<Zap className="size-4" />}
                meta={entry.pluginName}
                badges={<RiskBadge risk={entry.risk} />}
                dimmed={!entry.available}
                onClick={() => setActionId(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const needsHost = action.scope !== "server";
  const ready =
    action.available &&
    (!needsHost || hostId !== undefined) &&
    (action.scope !== "resource" || !!resourceKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
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
        <Field label={t("run.target")} hint={t("run.targetHint")}>
          {choices.length > 0 ? (
            <Choice
              label={t("run.target")}
              value={resourceKey}
              onChange={setResourceKey}
              options={[
                { value: "", label: t("form.choose") },
                ...choices.map((choice) => ({
                  value: choice.key,
                  label: choice.name,
                })),
              ]}
            />
          ) : (
            <Input
              value={resourceKey}
              onChange={(event) => setResourceKey(event.target.value)}
            />
          )}
        </Field>
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
  );
}
