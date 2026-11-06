import { useCallback, useEffect, useState } from "react";
import { Camera, FolderSearch, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  SelectField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobView, SnapshotView } from "../shared/types";
import { deleteSnapshot, errorMessage, listSnapshots } from "./api";
import { formatBytes, formatDate, formatWhen } from "./format";

/** The snapshots of one job, newest first. */
export function SnapshotsView({
  jobs,
  jobId,
  onJob,
  onBrowse,
}: {
  jobs: JobView[];
  jobId: number | null;
  onJob: (jobId: number) => void;
  onBrowse: (job: JobView, snapshot: SnapshotView) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const job = jobs.find((j) => j.id === jobId) ?? jobs[0] ?? null;
  const [snapshots, setSnapshots] = useState<SnapshotView[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!job) return;
    setSnapshots(null);
    setError("");
    try {
      setSnapshots(await listSnapshots(job.id));
    } catch (e) {
      setError(errorMessage(e, t("snapshots.loadFailed")));
    }
  }, [job, t]);

  useEffect(() => {
    void load();
    // Reload only when the picked job changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) return <EmptyState title={t("snapshots.noJobs")} />;

  const remove = async (snapshot: SnapshotView) => {
    const ok = await confirm({
      title: t("snapshots.deleteTitle"),
      description: t("snapshots.deleteDesc", {
        time: formatDate(snapshot.time),
      }),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await deleteSnapshot(job.id, snapshot.id);
      toast.success(t("snapshots.deleted"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("snapshots.deleteFailed")));
    }
  };

  return (
    <div className="flex flex-col">
      {jobs.length > 1 && (
        <div className="border-b border-border px-3 py-2">
          <SelectField
            label={t("snapshots.job")}
            value={String(job.id)}
            onChange={(value) => onJob(Number(value))}
            options={jobs.map((j) => ({ value: String(j.id), label: j.name }))}
          />
        </div>
      )}
      {error ? (
        <p className="px-3 py-2 text-xs text-destructive">{error}</p>
      ) : !snapshots ? (
        <LoadingState compact />
      ) : (
        <PanelList empty={<EmptyState title={t("snapshots.empty")} />}>
          {snapshots.map((snapshot, index) => (
            <ListRow
              key={snapshot.id}
              stripe={index}
              tone={index === 0 ? "success" : "muted"}
              icon={<Camera className="size-3.5" />}
              title={formatDate(snapshot.time)}
              badges={
                index === 0 ? (
                  <ListBadge tone="success">{t("snapshots.latest")}</ListBadge>
                ) : undefined
              }
              meta={[
                formatWhen(snapshot.time, t),
                snapshot.bytes !== null ? formatBytes(snapshot.bytes) : "",
                snapshot.files !== null
                  ? t("snapshots.files", { count: snapshot.files })
                  : "",
                snapshot.shortId,
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => onBrowse(job, snapshot)}
              actions={
                <ListRowAction
                  label={t("snapshots.delete")}
                  tone="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(snapshot);
                  }}
                >
                  <Trash2 />
                </ListRowAction>
              }
              trailing={
                <ListRowAction
                  label={t("snapshots.browse")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBrowse(job, snapshot);
                  }}
                >
                  <FolderSearch />
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
