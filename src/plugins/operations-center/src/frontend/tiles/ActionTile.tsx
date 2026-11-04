import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, useConfirm } from "@termix-ssh/plugin-sdk/ui";
import { errorText, runAction, type CatalogAction } from "../api";
import {
  ActionForm,
  cleanValues,
  initialValues,
  type FormValues,
} from "../ActionForm";
import { RiskBadge } from "../parts";
import { TargetField, useResourceChoices } from "../targets";

/** Runs an action and says how it went. Destructive ones ask first. */
export function useRunner(onDone?: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = async (
    action: CatalogAction,
    body: {
      hostId?: number;
      resourceKey?: string;
      input?: Record<string, unknown>;
    },
    dryRun = false,
  ) => {
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
      const outcome = await runAction(action.id, {
        ...body,
        dryRun,
        confirmed: !dryRun,
      });
      if (outcome.status === "success")
        toast.success(outcome.summary ?? t("state.success"));
      else if (outcome.status === "pending_approval")
        toast.info(t("run.waiting"));
      else toast.error(outcome.error ?? t(`state.${outcome.status}`));
      onDone?.();
    } catch (error) {
      toast.error(errorText(error, t("run.failed")));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/**
 * One action as a tile: its fields right in the tile when it has any, then
 * Run, and Dry run when the action supports one.
 */
export function ActionTile({
  action,
  hostId,
  onDone,
}: {
  action: CatalogAction;
  hostId?: number;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(action.inputs),
  );
  const [resourceKey, setResourceKey] = useState("");
  const choices = useResourceChoices(
    action.scope === "resource" ? action : undefined,
    hostId,
  );
  const { run, busy } = useRunner(onDone);
  const missingTarget = action.scope === "resource" && !resourceKey;
  const body = {
    hostId: action.scope === "server" ? undefined : hostId,
    resourceKey: action.scope === "resource" ? resourceKey : undefined,
    input: cleanValues(values),
  };

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {action.description ?? action.pluginName}
        </span>
        <RiskBadge risk={action.risk} />
      </div>
      {action.scope === "resource" && (
        <TargetField
          choices={choices}
          value={resourceKey}
          onChange={setResourceKey}
        />
      )}
      {action.inputs.length > 0 && (
        <ActionForm
          hostId={hostId ?? 0}
          fields={action.inputs}
          values={values}
          onChange={setValues}
        />
      )}
      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          variant={action.risk === "destructive" ? "destructive" : "default"}
          disabled={busy || missingTarget || !action.available}
          onClick={() => void run(action, body)}
        >
          {t("run.run")}
        </Button>
        {action.dryRun && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || missingTarget || !action.available}
            onClick={() => void run(action, body, true)}
          >
            {t("run.dryRun")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Every one click action of one plugin as a row of buttons. */
export function ActionGroupTile({
  actions,
  hostId,
  onPick,
  onDone,
}: {
  actions: CatalogAction[];
  hostId: number;
  /** Actions that need a form open it instead of running. */
  onPick: (action: CatalogAction) => void;
  onDone?: () => void;
}) {
  const { run, busy } = useRunner(onDone);
  return (
    <div className="flex flex-wrap gap-1.5 p-3">
      {actions.map((action) => {
        const needsForm =
          action.scope === "resource" ||
          action.inputs.some((field) => field.required);
        return (
          <Button
            key={action.id}
            size="sm"
            variant={action.risk === "destructive" ? "destructive" : "outline"}
            disabled={busy || !action.available}
            onClick={() =>
              needsForm ? onPick(action) : void run(action, { hostId })
            }
          >
            {action.title}
          </Button>
        );
      })}
    </div>
  );
}
