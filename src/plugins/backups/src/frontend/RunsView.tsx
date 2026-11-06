import { useCallback, useEffect, useState } from "react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  DataTable,
  DataTableRow,
  EmptyState,
  LoadingState,
  Pager,
  StatusBadge,
} from "@termix-ssh/plugin-sdk/ui";
import type { RunView } from "../shared/types";
import { errorMessage, listRuns } from "./api";
import {
  formatBytes,
  formatDate,
  formatDuration,
  statusLabel,
  statusToneOf,
} from "./format";

const PAGE = 25;

/** Past and running backups and restores, a page at a time. */
export function RunsView({
  hostId,
  jobId,
  showHost,
  isVisible,
  onOpen,
}: {
  hostId?: number;
  jobId?: number;
  showHost?: boolean;
  isVisible: boolean;
  onOpen: (runId: number) => void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  // Each page starts before the last id of the one in front of it.
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [runs, setRuns] = useState<RunView[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await listRuns({
        hostId,
        jobId,
        before: cursors[page] ?? null,
        limit: PAGE,
      });
      setRuns(res.runs);
      setNext(res.next);
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("history.loadFailed")));
    }
  }, [hostId, jobId, cursors, page, t]);

  const anyRunning = runs?.some((r) => r.status === "running") ?? false;

  useEffect(() => {
    if (!isVisible) return;
    void load();
    if (!anyRunning) return;
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [isVisible, load, anyRunning]);

  if (error)
    return <p className="px-3 py-2 text-xs text-destructive">{error}</p>;
  if (!runs) return <LoadingState compact />;
  if (runs.length === 0 && page === 0) {
    return <EmptyState title={t("history.empty")} />;
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DataTable>
        <thead>
          <tr>
            <th>{t("history.status")}</th>
            <th>{t("history.job")}</th>
            {showHost && <th>{t("history.host")}</th>}
            <th>{t("history.kind")}</th>
            <th>{t("history.started")}</th>
            <th>{t("history.took")}</th>
            <th>{t("history.size")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const host = hosts.find((h) => Number(h.id) === run.hostId);
            const took =
              run.summary?.seconds ??
              (run.finishedAt
                ? (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) /
                  1000
                : null);
            return (
              <DataTableRow key={run.id} onClick={() => onOpen(run.id)}>
                <td>
                  <StatusBadge tone={statusToneOf(run.status)}>
                    {statusLabel(run.status, t)}
                  </StatusBadge>
                </td>
                <td
                  className="max-w-64 truncate"
                  title={run.error ?? undefined}
                >
                  {run.jobName}
                </td>
                {showHost && (
                  <td>{host?.name || host?.ip || `#${run.hostId}`}</td>
                )}
                <td>{t(`history.kinds.${run.kind}`)}</td>
                <td>{formatDate(run.startedAt)}</td>
                <td>{run.status === "running" ? "" : formatDuration(took)}</td>
                <td>{formatBytes(run.summary?.totalBytes)}</td>
              </DataTableRow>
            );
          })}
        </tbody>
      </DataTable>
      <Pager
        page={page}
        hasNext={next !== null}
        onPage={(target) => {
          if (target > page && next !== null) {
            setCursors((c) => [...c.slice(0, page + 1), next]);
          }
          setPage(target);
        }}
      />
    </div>
  );
}
