import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobRow } from "../shared/types";
import { cancelJob, errorMessage, getJobs } from "./api";
import { statusText } from "./format";
import { useAction } from "./useAction";

const POLL_MS = 3000;
const TONES = {
  running: "brand",
  success: "success",
  failed: "destructive",
  cancelled: "muted",
} as const;

/** Long work on this host. It keeps going with this page closed. */
export function JobsView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await getJobs(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
  }, [hostId, t]);
  const action = useAction(load);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  if (failed && !rows) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!rows) return <LoadingState label={t("common.loading")} />;

  return (
    <PanelList
      empty={<EmptyState title={t("jobs.none")} hint={t("jobs.noneHint")} />}
    >
      {rows.map((job) => (
        <ListRow
          key={job.id}
          title={job.label}
          badges={
            <ListBadge tone={TONES[job.status]}>
              {t(`jobs.status.${job.status}`)}
            </ListBadge>
          }
          meta={statusText([
            t(`jobs.kind.${job.kind}`),
            job.status === "running" &&
              job.phase &&
              t(`jobs.phase.${job.phase}`),
            job.status === "running" &&
              job.percent !== null &&
              `${Math.round(job.percent)}%`,
            new Date(job.startedAt).toLocaleString(),
            job.error,
          ])}
          trailing={
            job.status === "running" ? (
              <ListRowAction
                label={t("jobs.cancel")}
                tone="destructive"
                disabled={action.busy}
                onClick={() => void action.run(() => cancelJob(hostId, job.id))}
              >
                <X className="size-3.5" />
              </ListRowAction>
            ) : undefined
          }
        />
      ))}
    </PanelList>
  );
}
