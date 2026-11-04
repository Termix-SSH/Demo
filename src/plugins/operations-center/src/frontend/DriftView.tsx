import { useCallback, useEffect, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  EmptyState,
  Field,
  FormFooter,
  InlineView,
  Input,
  ListRow,
  Switch,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { Radar } from "lucide-react";
import type { Baseline, BaselineResult, TargetSpec } from "../shared/types";
import {
  baselineResults,
  deleteBaseline,
  errorText,
  listBaselines,
  runAction,
  runBaseline,
  saveBaseline,
  type CatalogAction,
} from "./api";
import {
  ActionForm,
  cleanValues,
  initialValues,
  type FormValues,
} from "./ActionForm";
import { Choice, Pager, StateBadge, usePaged, when } from "./parts";
import { TargetPicker } from "./TargetPicker";

function EditBaseline({
  actions,
  baseline,
  onDone,
}: {
  actions: CatalogAction[];
  baseline: Partial<Baseline>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const checks = actions.filter(
    (action) => action.risk === "read" && action.scope !== "server",
  );
  const fixes = actions.filter((action) => action.risk !== "read");
  const [checkId, setCheckId] = useState(
    baseline.checkActionId ?? checks[0]?.id ?? "",
  );
  const check = checks.find((action) => action.id === checkId);
  const [values, setValues] = useState<FormValues>(
    check ? initialValues(check.inputs) : {},
  );
  const [name, setName] = useState(baseline.name ?? "");
  const [resourceKey, setResourceKey] = useState(baseline.resourceKey ?? "");
  const [targets, setTargets] = useState<TargetSpec>(baseline.targets ?? {});
  const [interval, setIntervalMinutes] = useState(
    baseline.intervalMinutes ?? 60,
  );
  const [fixId, setFixId] = useState(baseline.fixActionId ?? "");
  const [autoFix, setAutoFix] = useState(baseline.autoFix ?? false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveBaseline({
        id: baseline.id,
        name: name || check?.title,
        checkActionId: checkId,
        resourceKey: check?.scope === "resource" ? resourceKey : null,
        input: cleanValues(values),
        targets,
        intervalMinutes: interval,
        fixActionId: fixId || null,
        autoFix,
      });
      onDone();
    } catch (error) {
      toast.error(errorText(error, t("drift.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t("drift.about")}</p>
      <Field label={t("drift.name")}>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label={t("drift.check")} hint={t("drift.checkHint")}>
        <Choice
          label={t("drift.check")}
          value={checkId}
          onChange={(next) => {
            setCheckId(next);
            const picked = checks.find((action) => action.id === next);
            setValues(picked ? initialValues(picked.inputs) : {});
          }}
          options={checks.map((action) => ({
            value: action.id,
            label: `${action.title} (${action.pluginName})`,
          }))}
        />
      </Field>
      {check?.scope === "resource" && (
        <Field label={t("run.target")}>
          <Input
            value={resourceKey}
            onChange={(event) => setResourceKey(event.target.value)}
          />
        </Field>
      )}
      {check && (
        <ActionForm
          fields={check.inputs}
          values={values}
          onChange={setValues}
        />
      )}
      <TargetPicker action={check} value={targets} onChange={setTargets} />
      <Field label={t("drift.interval")}>
        <Input
          type="number"
          min={5}
          value={interval}
          onChange={(event) => setIntervalMinutes(Number(event.target.value))}
        />
      </Field>
      <Field label={t("drift.fix")} hint={t("drift.fixHint")}>
        <Choice
          label={t("drift.fix")}
          value={fixId}
          onChange={setFixId}
          options={[
            { value: "", label: t("drift.noFix") },
            ...fixes.map((action) => ({
              value: action.id,
              label: `${action.title} (${action.pluginName})`,
            })),
          ]}
        />
      </Field>
      {fixId && (
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={autoFix} onCheckedChange={setAutoFix} />
          {t("drift.autoFix")}
        </label>
      )}
      <FormFooter
        onCancel={onDone}
        onSave={() => void save()}
        saving={saving}
        disabled={!checkId}
      />
    </div>
  );
}

function Results({
  baseline,
  onClose,
}: {
  baseline: Baseline;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [results, setResults] = useState<BaselineResult[]>([]);
  const resultPage = usePaged(results, 25);

  const load = useCallback(async () => {
    try {
      setResults(await baselineResults(baseline.id));
    } catch (error) {
      toast.error(errorText(error, t("drift.failed")));
    }
  }, [baseline.id, t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  const fix = async (hostId: number) => {
    if (!baseline.fixActionId) return;
    try {
      const outcome = await runAction(baseline.fixActionId, {
        hostId,
        resourceKey: baseline.resourceKey ?? undefined,
        confirmed: true,
      });
      if (outcome.status === "success")
        toast.success(outcome.summary ?? t("drift.fixed"));
      else toast.error(outcome.error ?? t(`state.${outcome.status}`));
      await runBaseline(baseline.id);
    } catch (error) {
      toast.error(errorText(error, t("drift.failed")));
    }
  };

  return (
    <InlineView
      open
      onOpenChange={(next) => !next && onClose()}
      title={baseline.name}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runBaseline(baseline.id)}
        >
          {t("drift.checkNow")}
        </Button>
      }
    >
      {results.length === 0 ? (
        <EmptyState icon={Radar} title={t("drift.notChecked")} />
      ) : (
        <div className="flex flex-col gap-1">
          {resultPage.rows.map((result) => (
            <ListRow
              key={result.hostId}
              title={result.hostName ?? String(result.hostId)}
              meta={[result.detail, when(result.checkedAt)]
                .filter(Boolean)
                .join(" | ")}
              badges={<StateBadge state={result.state} />}
              trailing={
                result.state === "drifted" && baseline.fixActionId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fix(result.hostId)}
                  >
                    {t("drift.fixNow")}
                  </Button>
                ) : undefined
              }
            />
          ))}
          <Pager
            page={resultPage.page}
            pages={resultPage.pages}
            onPage={resultPage.setPage}
          />
        </div>
      )}
    </InlineView>
  );
}

/** Drift: states hosts should stay in, checked on a schedule. */
export function DriftView({ actions }: { actions: CatalogAction[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Baseline[]>([]);
  const [editing, setEditing] = useState<Partial<Baseline> | null>(null);
  const [open, setOpen] = useState<Baseline | null>(null);
  const shown = usePaged(list, 20);

  const load = useCallback(async () => {
    try {
      setList(await listBaselines());
    } catch (error) {
      toast.error(errorText(error, t("drift.failed")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <EditBaseline
        actions={actions}
        baseline={editing}
        onDone={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  const remove = async (baseline: Baseline) => {
    if (!(await confirm({ title: t("drift.delete"), destructive: true })))
      return;
    await deleteBaseline(baseline.id).catch(() => {});
    await load();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex justify-end">
        <AddButton label={t("drift.new")} onClick={() => setEditing({})} />
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={Radar}
          title={t("drift.empty")}
          hint={t("drift.emptyHint")}
        />
      ) : (
        <div className="flex flex-col gap-1 overflow-auto">
          {shown.rows.map((baseline) => (
            <ListRow
              key={baseline.id}
              title={baseline.name}
              meta={t("drift.summary", {
                compliant: baseline.counts.compliant ?? 0,
                drifted: baseline.counts.drifted ?? 0,
                error: baseline.counts.error ?? 0,
              })}
              badges={
                (baseline.counts.drifted ?? 0) > 0 ? (
                  <StateBadge state="drifted" />
                ) : undefined
              }
              onClick={() => setOpen(baseline)}
              trailing={
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(baseline)}
                  >
                    {t("drift.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(baseline)}
                  >
                    {t("drift.delete")}
                  </Button>
                </>
              }
            />
          ))}
          <Pager page={shown.page} pages={shown.pages} onPage={shown.setPage} />
        </div>
      )}
      {open && <Results baseline={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
