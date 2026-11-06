import { DatabaseBackup, History, Pencil, Play, Square } from "lucide-react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Facts,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobView } from "../shared/types";
import {
  formatBytes,
  formatWhen,
  jobStatus,
  rowToneOf,
  scheduleLabel,
  statusLabel,
} from "./format";

const BADGE = {
  success: "success",
  warning: "warning",
  failed: "destructive",
  running: "brand",
  canceled: "muted",
} as const;

/** Backup jobs as rows, with Run and Stop always shown. */
export function JobList({
  jobs,
  showHost,
  busy,
  empty,
  onEdit,
  onRun,
  onStop,
  onSnapshots,
  onOpenRun,
}: {
  jobs: JobView[];
  showHost?: boolean;
  busy: number | null;
  empty: React.ReactNode;
  onEdit: (job: JobView) => void;
  onRun: (job: JobView) => void;
  onStop: (job: JobView) => void;
  onSnapshots: (job: JobView) => void;
  onOpenRun: (runId: number) => void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();

  return (
    <PanelList empty={empty}>
      {jobs.map((job, index) => {
        const status = jobStatus(job);
        const host = hosts.find((h) => Number(h.id) === job.hostId);
        return (
          <ListRow
            key={job.id}
            stripe={index}
            tone={rowToneOf(status)}
            dimmed={!job.enabled}
            icon={<DatabaseBackup className="size-3.5" />}
            title={job.name}
            badges={
              <>
                <ListBadge tone={status ? BADGE[status] : "muted"}>
                  {statusLabel(status, t)}
                </ListBadge>
                {!job.enabled && (
                  <ListBadge tone="muted">{t("jobs.paused")}</ListBadge>
                )}
              </>
            }
            meta={
              <Facts>
                {showHost && (
                  <span>{host?.name || host?.ip || `#${job.hostId}`}</span>
                )}
                <span>{scheduleLabel(job, t)}</span>
                <span>
                  {job.lastSuccessAt
                    ? t("jobs.lastGood", {
                        when: formatWhen(job.lastSuccessAt, t),
                      })
                    : t("jobs.noGood")}
                </span>
                {job.lastBytes ? (
                  <span>{formatBytes(job.lastBytes)}</span>
                ) : null}
                {job.enabled && job.nextRunAt && !job.runningRunId ? (
                  <span>
                    {t("jobs.next", { when: formatWhen(job.nextRunAt, t) })}
                  </span>
                ) : null}
              </Facts>
            }
            onClick={() =>
              job.runningRunId ? onOpenRun(job.runningRunId) : onEdit(job)
            }
            actions={
              <>
                <ListRowAction
                  label={t("jobs.edit")}
                  onClick={() => onEdit(job)}
                >
                  <Pencil />
                </ListRowAction>
                <ListRowAction
                  label={t("jobs.snapshots")}
                  onClick={() => onSnapshots(job)}
                >
                  <History />
                </ListRowAction>
              </>
            }
            trailing={
              job.runningRunId ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === job.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop(job);
                  }}
                >
                  <Square className="size-3.5" />
                  {t("jobs.stop")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === job.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRun(job);
                  }}
                >
                  <Play className="size-3.5" />
                  {t("jobs.run")}
                </Button>
              )
            }
          />
        );
      })}
    </PanelList>
  );
}
