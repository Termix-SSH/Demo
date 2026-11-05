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
import { Layers } from "lucide-react";
import type { Batch, BatchTarget, TargetSpec } from "../shared/types";
import {
  createRollout,
  deleteRollout,
  errorText,
  getRollout,
  listRollouts,
  rolloutVerb,
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

export interface RolloutDraft {
  actionId: string;
  input?: FormValues;
  resourceKey?: string;
  targets?: TargetSpec;
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function NewRollout({
  actions,
  draft,
  onDone,
}: {
  actions: CatalogAction[];
  draft: RolloutDraft;
  onDone: (created?: Batch) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const usable = actions.filter((action) => action.scope !== "server");
  const [actionId, setActionId] = useState(
    draft.actionId || usable[0]?.id || "",
  );
  const action = usable.find((entry) => entry.id === actionId);
  const [values, setValues] = useState<FormValues>(
    draft.input ?? (action ? initialValues(action.inputs) : {}),
  );
  const [resourceKey, setResourceKey] = useState(draft.resourceKey ?? "");
  const [targets, setTargets] = useState<TargetSpec>(draft.targets ?? {});
  const [name, setName] = useState("");
  const [canary, setCanary] = useState(1);
  const [batchSize, setBatchSize] = useState(10);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const [stopAfter, setStopAfter] = useState(1);
  const [dryRun, setDryRun] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!action) return;
    setSaving(true);
    try {
      const created = await createRollout({
        name: name || action.title,
        actionId: action.id,
        resourceKey: action.scope === "resource" ? resourceKey : undefined,
        input: cleanValues(values),
        targets,
        dryRun,
        canary,
        batchSize,
        pauseSeconds,
        stopAfterFailures: stopAfter,
        start: true,
      });
      onDone(created);
    } catch (error) {
      toast.error(errorText(error, t("rollouts.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={t("rollouts.action")}>
        <Choice
          label={t("rollouts.action")}
          value={actionId}
          onChange={(next) => {
            setActionId(next);
            const picked = usable.find((entry) => entry.id === next);
            setValues(picked ? initialValues(picked.inputs) : {});
          }}
          options={usable.map((entry) => ({
            value: entry.id,
            label: `${entry.title} (${entry.pluginName})`,
          }))}
        />
      </Field>
      <Field label={t("rollouts.name")}>
        <Input
          value={name}
          placeholder={action?.title}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {action?.scope === "resource" && (
        <Field label={t("run.target")} hint={t("rollouts.targetHint")}>
          <Input
            value={resourceKey}
            onChange={(event) => setResourceKey(event.target.value)}
          />
        </Field>
      )}
      {action && (
        <ActionForm
          fields={action.inputs}
          values={values}
          onChange={setValues}
        />
      )}
      <TargetPicker action={action} value={targets} onChange={setTargets} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label={t("rollouts.canary")}
          hint={t("rollouts.canaryHint")}
          value={canary}
          onChange={setCanary}
        />
        <NumberField
          label={t("rollouts.batchSize")}
          value={batchSize}
          min={1}
          onChange={setBatchSize}
        />
        <NumberField
          label={t("rollouts.pause")}
          hint={t("rollouts.pauseHint")}
          value={pauseSeconds}
          onChange={setPauseSeconds}
        />
        <NumberField
          label={t("rollouts.stopAfter")}
          hint={t("rollouts.stopAfterHint")}
          value={stopAfter}
          onChange={setStopAfter}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={dryRun} onCheckedChange={setDryRun} />
        {t("rollouts.dryRun")}
      </label>
      <FormFooter
        onCancel={() => onDone()}
        onSave={() => void save()}
        saveLabel={t("rollouts.start")}
        saving={saving}
        disabled={!action || !action.available}
      />
    </div>
  );
}

function RolloutDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{
    batch: Batch;
    targets: BatchTarget[];
  } | null>(null);
  const targetPage = usePaged(data?.targets ?? [], 25);

  const load = useCallback(async () => {
    try {
      setData(await getRollout(id));
    } catch (error) {
      toast.error(errorText(error, t("rollouts.failed")));
    }
  }, [id, t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [load]);

  const verb = async (name: "start" | "pause" | "stop" | "retry") => {
    try {
      await rolloutVerb(id, name);
      await load();
    } catch (error) {
      toast.error(errorText(error, t("rollouts.failed")));
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t("rollouts.delete"), destructive: true }))) {
      return;
    }
    try {
      await deleteRollout(id);
      onClose();
    } catch (error) {
      toast.error(errorText(error, t("rollouts.failed")));
    }
  };

  const batch = data?.batch;
  return (
    <InlineView
      open
      onOpenChange={(next) => !next && onClose()}
      title={batch?.name ?? ""}
      status={batch ? <StateBadge state={batch.status} /> : undefined}
      actions={
        batch && (
          <>
            {batch.status === "running" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void verb("pause")}
                >
                  {t("rollouts.pauseNow")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void verb("stop")}
                >
                  {t("rollouts.stop")}
                </Button>
              </>
            ) : (
              <>
                {(batch.status === "paused" || batch.status === "draft") && (
                  <Button size="sm" onClick={() => void verb("start")}>
                    {t("rollouts.resume")}
                  </Button>
                )}
                {(batch.counts.failed ?? 0) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void verb("retry")}
                  >
                    {t("rollouts.retry")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void remove()}>
                  {t("rollouts.delete")}
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {batch?.pausedReason && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          {batch.pausedReason}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {targetPage.rows.map((target) => (
          <ListRow
            key={target.id}
            title={target.hostName ?? String(target.hostId)}
            meta={target.summary ?? target.error ?? undefined}
            badges={<StateBadge state={target.status} />}
          />
        ))}
        <Pager
          page={targetPage.page}
          pages={targetPage.pages}
          onPage={targetPage.setPage}
        />
      </div>
    </InlineView>
  );
}

/** Rollouts: one action across many hosts, in steps. */
export function RolloutsView({
  actions,
  draft,
  onDraftUsed,
}: {
  actions: CatalogAction[];
  draft: RolloutDraft | null;
  onDraftUsed: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<Batch[]>([]);
  const [creating, setCreating] = useState<RolloutDraft | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const shown = usePaged(list, 20);

  useEffect(() => {
    if (draft) {
      setCreating(draft);
      onDraftUsed();
    }
  }, [draft, onDraftUsed]);

  const load = useCallback(async () => {
    try {
      setList(await listRollouts());
    } catch (error) {
      toast.error(errorText(error, t("rollouts.failed")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (creating) {
    return (
      <NewRollout
        actions={actions}
        draft={creating}
        onDone={(created) => {
          setCreating(null);
          void load();
          if (created) setOpen(created.id);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end border-b border-border px-3 py-2">
        <AddButton
          label={t("rollouts.new")}
          onClick={() => setCreating({ actionId: "" })}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("rollouts.empty")}
          hint={t("rollouts.emptyHint")}
        />
      ) : (
        <div className="flex flex-col overflow-auto">
          {shown.rows.map((batch) => {
            const total = Object.values(batch.counts).reduce(
              (a, b) => a + b,
              0,
            );
            return (
              <ListRow
                key={batch.id}
                title={batch.name}
                meta={[
                  t("rollouts.progress", {
                    done:
                      (batch.counts.success ?? 0) + (batch.counts.failed ?? 0),
                    total,
                    failed: batch.counts.failed ?? 0,
                  }),
                  when(batch.createdAt),
                ].join(" | ")}
                badges={<StateBadge state={batch.status} />}
                onClick={() => setOpen(batch.id)}
              />
            );
          })}
          <Pager page={shown.page} pages={shown.pages} onPage={shown.setPage} />
        </div>
      )}
      {open !== null && (
        <RolloutDetail
          id={open}
          onClose={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
