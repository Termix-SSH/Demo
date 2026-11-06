import { useCallback, useEffect, useState } from "react";
import { Activity, Square } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InfoGrid,
  InlineView,
  LoadingState,
  SectionCard,
  StatusBadge,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { RunDetail as Run } from "../shared/types";
import { cancelRun, errorMessage, getRun } from "./api";
import {
  formatBytes,
  formatDate,
  formatDuration,
  statusLabel,
  statusToneOf,
} from "./format";

const POLL_MS = 3_000;

/** A progress bar in the brand color. Meter's color ramp means usage, not progress. */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden bg-muted">
      <div
        className="h-full bg-accent-brand transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent * 100))}%` }}
      />
    </div>
  );
}

/** One backup or restore: live progress while it runs, then its result and log. */
export function RunDetail({
  runId,
  onClose,
}: {
  runId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);

  const load = useCallback(async () => {
    try {
      setRun(await getRun(runId));
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("run.loadFailed")));
    }
  }, [runId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [run?.status, load]);

  const stop = async () => {
    const ok = await confirm({
      title: t("run.stopTitle"),
      description: t("run.stopDesc"),
      confirmLabel: t("jobs.stop"),
    });
    if (!ok) return;
    setStopping(true);
    try {
      await cancelRun(runId);
      toast.success(t("run.stopSent"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("run.stopFailed")));
    } finally {
      setStopping(false);
    }
  };

  const progress = run?.progress;
  const summary = run?.summary;

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onClose()}
      icon={<Activity className="size-4" />}
      title={
        run
          ? run.kind === "restore"
            ? t("run.restoreTitle", { name: run.jobName })
            : t("run.backupTitle", { name: run.jobName })
          : t("run.title")
      }
      status={
        run ? (
          <StatusBadge tone={statusToneOf(run.status)}>
            {statusLabel(run.status, t)}
          </StatusBadge>
        ) : undefined
      }
      actions={
        run?.status === "running" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={stopping}
            onClick={() => void stop()}
          >
            <Square className="size-3.5" />
            {t("jobs.stop")}
          </Button>
        ) : undefined
      }
    >
      {!run ? (
        error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : (
          <LoadingState compact />
        )
      ) : (
        <>
          {run.status === "running" && (
            <SectionCard title={t("run.progress")} icon={<Activity />}>
              <div className="flex flex-col gap-2 py-2">
                <ProgressBar percent={progress?.percent ?? 0} />
                <p className="text-xs text-muted-foreground">
                  {progress
                    ? t("run.progressLine", {
                        percent: Math.round(progress.percent * 100),
                        files: progress.filesDone,
                        totalFiles: progress.totalFiles,
                        bytes: formatBytes(progress.bytesDone),
                        totalBytes: formatBytes(progress.totalBytes),
                      })
                    : t("run.preparing")}
                  {progress?.secondsRemaining
                    ? ` | ${t("run.left", { time: formatDuration(progress.secondsRemaining) })}`
                    : ""}
                </p>
                {progress?.current.map((file) => (
                  <p
                    key={file}
                    className="truncate font-mono text-[11px] text-muted-foreground"
                  >
                    {file}
                  </p>
                ))}
              </div>
            </SectionCard>
          )}
          <SectionCard title={t("run.details")} icon={<Activity />}>
            <InfoGrid
              className="py-2"
              items={[
                { label: t("run.started"), value: formatDate(run.startedAt) },
                {
                  label: t("run.finished"),
                  value: run.finishedAt ? formatDate(run.finishedAt) : "",
                },
                {
                  label: t("run.trigger"),
                  value: t(`run.triggers.${run.trigger}`),
                },
                ...(run.snapshotId
                  ? [
                      {
                        label: t("run.snapshot"),
                        value: run.snapshotId.slice(0, 8),
                        mono: true,
                      },
                    ]
                  : []),
                ...(run.target
                  ? [
                      {
                        label: t("run.target"),
                        value: run.target.path,
                        mono: true,
                      },
                    ]
                  : []),
                ...(summary
                  ? [
                      {
                        label: t("run.files"),
                        value: t("run.filesLine", {
                          total: summary.totalFiles,
                          added: summary.filesNew,
                          changed: summary.filesChanged,
                        }),
                      },
                      {
                        label: t("run.size"),
                        value: formatBytes(summary.totalBytes),
                      },
                      ...(run.kind === "backup"
                        ? [
                            {
                              label: t("run.added"),
                              value: formatBytes(summary.dataAdded),
                            },
                          ]
                        : []),
                      {
                        label: t("run.took"),
                        value: formatDuration(summary.seconds),
                      },
                    ]
                  : []),
              ]}
            />
            {run.error && (
              <pre className="mb-2 whitespace-pre-wrap break-words text-xs text-destructive">
                {run.error}
              </pre>
            )}
          </SectionCard>
          <SectionCard title={t("run.log")} icon={<Activity />}>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words py-2 font-mono text-[11px] text-muted-foreground thin-scrollbar">
              {run.log || t("run.noLog")}
            </pre>
          </SectionCard>
        </>
      )}
    </InlineView>
  );
}
