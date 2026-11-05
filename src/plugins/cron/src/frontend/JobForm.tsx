import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  FormFooter,
  PanelShell,
  SwitchRow,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { isValidSchedule, nextRuns } from "../shared/schedule";
import type { CronJob, CronStatus } from "../shared/types";
import { addJob, deleteJob, errorMessage, updateJob } from "./api";
import { formatRun, scheduleText } from "./schedule-text";

export const PRESETS: Array<[string, string]> = [
  ["everyMinute", "* * * * *"],
  ["every5", "*/5 * * * *"],
  ["every15", "*/15 * * * *"],
  ["hourly", "0 * * * *"],
  ["daily", "0 3 * * *"],
  ["weekly", "0 3 * * 1"],
  ["monthly", "0 3 1 * *"],
  ["reboot", "@reboot"],
];

/** Add or change one job, with a live summary of its schedule. */
export function JobForm({
  hostId,
  user,
  job,
  status,
  onClose,
}: {
  hostId: number;
  user: string;
  job: CronJob | null;
  status: CronStatus;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [label, setLabel] = useState(job?.label ?? "");
  const [command, setCommand] = useState(job?.command ?? "");
  const [schedule, setSchedule] = useState(job?.schedule ?? "0 3 * * *");
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const valid = isValidSchedule(schedule);
  const runs = useMemo(
    () =>
      valid ? nextRuns(schedule, new Date(), 5, status.offsetMinutes) : [],
    [valid, schedule, status.offsetMinutes],
  );

  const save = async () => {
    setSaving(true);
    setError("");
    const body = {
      user: user || undefined,
      label: label.trim(),
      command: command.trim(),
      schedule: schedule.trim(),
      enabled,
    };
    try {
      if (job) await updateJob(hostId, job.id, body);
      else await addJob(hostId, body);
      toast.success(t("form.saved"));
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("jobs.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!job) return;
    const ok = await confirm({
      title: t("jobs.deleteTitle"),
      description: job.label || job.command,
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteJob(hostId, user, job.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("jobs.saveFailed")));
    }
  };

  return (
    <PanelShell
      icon={<Clock className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={job ? t("form.editTitle") : t("form.addTitle")}
      status={user ? t("form.forUser", { user }) : undefined}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          disabled={!valid || !command.trim()}
          onDelete={job ? () => void remove() : undefined}
          deleteLabel={t("common.delete")}
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <TextField
          label={t("form.label")}
          hint={t("form.labelHint")}
          value={label}
          onChange={setLabel}
          placeholder={t("form.labelPlaceholder")}
        />
        <TextAreaField
          label={t("form.command")}
          hint={t("form.commandHint")}
          value={command}
          onChange={setCommand}
          placeholder="/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1"
          rows={3}
          mono
        />
        <TextField
          label={t("form.schedule")}
          hint={t("form.scheduleHint")}
          value={schedule}
          onChange={setSchedule}
          error={valid ? undefined : t("form.scheduleInvalid")}
          placeholder="0 3 * * *"
          mono
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(([key, value]) => (
            <Button
              key={key}
              size="sm"
              variant={schedule === value ? "secondary" : "outline"}
              onClick={() => setSchedule(value)}
            >
              {t(`presets.${key}`)}
            </Button>
          ))}
        </div>
        {valid && (
          <div className="flex flex-col gap-1 border-y border-border py-2 text-xs">
            <span className="font-medium">{scheduleText(t, schedule)}</span>
            {runs.length > 0 && (
              <span className="text-muted-foreground">
                {t("form.nextRuns", { zone: status.timezone })}{" "}
                {runs
                  .map((run) => formatRun(run, status.offsetMinutes, language))
                  .join(" | ")}
              </span>
            )}
          </div>
        )}
        <SwitchRow
          label={t("form.enabled")}
          description={t("form.enabledHint")}
          checked={enabled}
          onChange={setEnabled}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </PanelShell>
  );
}
