import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FileCode, Pencil, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { CronStatus, SystemView as View } from "../shared/types";
import { deleteSystemFile, errorMessage, getSystem } from "./api";
import { nextRunText, scheduleText } from "./schedule-text";

const PERIODS = ["hourly", "daily", "weekly", "monthly"] as const;

function Heading({
  title,
  count,
  actions,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
        {title}
        {count !== undefined && (
          <span className="ml-2 font-sans text-muted-foreground">{count}</span>
        )}
      </span>
      {actions}
    </div>
  );
}

/** /etc/crontab, /etc/cron.d and the periodic script folders. */
export function SystemView({
  hostId,
  status,
  isVisible,
  onEdit,
}: {
  hostId: number;
  status: CronStatus;
  isVisible: boolean;
  onEdit: (name: string, text: string) => void;
}) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await getSystem(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("system.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!view) return <LoadingState />;

  const canEdit = status.canEdit && status.root;

  const remove = async (name: string) => {
    const ok = await confirm({
      title: t("system.deleteTitle", { name }),
      description: t("system.deleteDesc"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSystemFile(hostId, name);
      toast.success(t("system.deleted", { name }));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("system.saveFailed")));
    }
  };

  return (
    <div className="flex flex-col">
      {!status.root && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("system.readHint")}
        </p>
      )}
      {view.files.map((file) => (
        <div key={file.path} className="flex flex-col">
          <Heading
            title={file.path}
            count={file.jobs.length}
            actions={
              canEdit && file.editable ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(file.name, file.text)}
                  >
                    <Pencil className="size-3.5" />
                    {t("system.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void remove(file.name)}
                  >
                    <Trash2 className="size-3.5" />
                    {t("common.delete")}
                  </Button>
                </>
              ) : undefined
            }
          />
          {file.jobs.length === 0 ? (
            <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground/60">
              {t("system.noJobs")}
            </p>
          ) : (
            <PanelList className="border-b border-border">
              {file.jobs.map((job, index) => {
                const next = job.enabled
                  ? nextRunText(job.schedule, status.offsetMinutes, language)
                  : "";
                return (
                  <ListRow
                    key={index}
                    stripe={index}
                    dimmed={!job.enabled}
                    tone={job.enabled ? "brand" : "muted"}
                    title={<span className="font-mono">{job.command}</span>}
                    badges={
                      <>
                        <ListBadge>{job.user}</ListBadge>
                        {!job.enabled && <ListBadge>{t("jobs.off")}</ListBadge>}
                      </>
                    }
                    meta={
                      <span>
                        <span className="font-mono">{job.schedule}</span>
                        {` | ${scheduleText(t, job.schedule)}`}
                        {next ? ` | ${t("jobs.next", { time: next })}` : ""}
                      </span>
                    }
                  />
                );
              })}
            </PanelList>
          )}
        </div>
      ))}
      {PERIODS.map((period) =>
        view.scripts[period].length === 0 ? null : (
          <div key={period} className="flex flex-col">
            <Heading
              title={`/etc/cron.${period}`}
              count={view.scripts[period].length}
            />
            <PanelList className="border-b border-border">
              {view.scripts[period].map((name, index) => (
                <ListRow
                  key={name}
                  stripe={index}
                  icon={<FileCode className="size-4" />}
                  title={<span className="font-mono">{name}</span>}
                  meta={t(`system.period.${period}`)}
                />
              ))}
            </PanelList>
          </div>
        ),
      )}
      {view.timers !== null && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("system.timers", { count: view.timers })}
        </p>
      )}
    </div>
  );
}
