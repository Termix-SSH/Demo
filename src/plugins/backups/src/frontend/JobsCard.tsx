import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup, Play } from "lucide-react";
import {
  useHosts,
  usePermission,
  useTabs,
  useToast,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Facts,
  ListBadge,
  ListRow,
  PanelList,
  StatusBadge,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobView } from "../shared/types";
import { errorMessage, listJobs, runJob } from "./api";
import {
  formatBytes,
  formatWhen,
  jobStatus,
  rowToneOf,
  statusLabel,
  statusToneOf,
} from "./format";

const POLL_MS = 60_000;
const RANK = { failed: 0, warning: 1, running: 2, canceled: 3, success: 4 };

/** Dashboard card: every backup job, worst first, or one picked job. */
export function JobsCard({
  isVisible,
  config,
}: Pick<DashboardCardProps, "isVisible" | "config">) {
  const { t } = useTranslation();
  const toast = useToast();
  const allowed = usePermission("use");
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [failed, setFailed] = useState("");
  const jobId = Number(config?.jobId) || null;

  const load = useCallback(async () => {
    try {
      setJobs(await listJobs());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("jobs.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!jobs) {
    return <LoadingState compact label={t("common.loading")} />;
  }

  const hostOf = (job: JobView) =>
    hosts.find((h) => Number(h.id) === job.hostId);
  const open = (job: JobView) => {
    const host = hostOf(job);
    if (host) tabs.openTab(host, "backups-host");
  };

  if (jobId) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) {
      return (
        <p className="p-3 text-xs text-muted-foreground">{t("card.gone")}</p>
      );
    }
    const status = jobStatus(job);
    const host = hostOf(job);
    return (
      <div className="flex h-full flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-2">
          <StatusBadge tone={statusToneOf(status)}>
            {statusLabel(status, t)}
          </StatusBadge>
          <span className="truncate text-muted-foreground">
            {host?.name || host?.ip}
          </span>
        </div>
        <p>
          {job.lastSuccessAt
            ? t("jobs.lastGood", { when: formatWhen(job.lastSuccessAt, t) })
            : t("jobs.noGood")}
        </p>
        <Facts className="text-muted-foreground">
          {job.lastBytes ? <span>{formatBytes(job.lastBytes)}</span> : null}
          {job.nextRunAt && job.enabled ? (
            <span>
              {t("jobs.next", { when: formatWhen(job.nextRunAt, t) })}
            </span>
          ) : null}
        </Facts>
        <div className="mt-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!!job.runningRunId}
            onClick={async () => {
              try {
                await runJob(job.id);
                toast.success(t("jobs.started", { name: job.name }));
                await load();
              } catch (e) {
                toast.error(errorMessage(e, t("jobs.runFailed")));
              }
            }}
          >
            <Play className="size-3.5" />
            {t("jobs.run")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => open(job)}>
            {t("card.open")}
          </Button>
        </div>
      </div>
    );
  }

  const sorted = [...jobs].sort(
    (a, b) =>
      (RANK[jobStatus(a) ?? "success"] ?? 5) -
        (RANK[jobStatus(b) ?? "success"] ?? 5) || a.name.localeCompare(b.name),
  );

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {sorted.map((job, index) => {
        const status = jobStatus(job);
        const host = hostOf(job);
        return (
          <ListRow
            key={job.id}
            stripe={index}
            tone={rowToneOf(status)}
            dimmed={!job.enabled}
            icon={<DatabaseBackup className="size-3.5" />}
            title={job.name}
            meta={[
              host?.name || host?.ip || `#${job.hostId}`,
              job.lastSuccessAt
                ? t("jobs.lastGood", { when: formatWhen(job.lastSuccessAt, t) })
                : t("jobs.noGood"),
            ].join(" | ")}
            badges={
              <ListBadge
                tone={
                  status === "failed"
                    ? "destructive"
                    : status === "warning"
                      ? "warning"
                      : status === "running"
                        ? "brand"
                        : status === "success"
                          ? "success"
                          : "muted"
                }
              >
                {statusLabel(status, t)}
              </ListBadge>
            }
            onClick={() => open(job)}
          />
        );
      })}
    </PanelList>
  );
}
