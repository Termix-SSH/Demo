import { useCallback, useEffect, useState } from "react";
import {
  ArchiveRestore,
  ChevronRight,
  Download,
  File,
  Folder,
  Link2,
} from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  Checkbox,
  EmptyState,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  PanelShell,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobView, SnapshotEntry, SnapshotView } from "../shared/types";
import { downloadEntry, errorMessage, listFiles } from "./api";
import { formatBytes, formatDate } from "./format";
import { RestoreForm } from "./RestoreForm";

function crumbs(path: string): { name: string; path: string }[] {
  const parts = path.split("/").filter(Boolean);
  return parts.map((name, i) => ({
    name,
    path: "/" + parts.slice(0, i + 1).join("/"),
  }));
}

/** Folders and files of one snapshot, to download or restore. */
export function SnapshotBrowser({
  job,
  snapshot,
  localRepo,
  onBack,
  onRestoreStarted,
}: {
  job: JobView;
  snapshot: SnapshotView;
  localRepo: boolean;
  onBack: () => void;
  onRestoreStarted: (runId: number) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [dir, setDir] = useState("/");
  const [entries, setEntries] = useState<SnapshotEntry[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setEntries(null);
    setError("");
    try {
      setEntries(await listFiles(job.id, snapshot.id, dir));
    } catch (e) {
      setError(errorMessage(e, t("snapshots.filesFailed")));
    }
  }, [job.id, snapshot.id, dir, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (entry: SnapshotEntry) => {
    setDownloading(entry.path);
    try {
      await downloadEntry(job.id, snapshot.id, entry);
    } catch (e) {
      toast.error(errorMessage(e, t("snapshots.downloadFailed")));
    } finally {
      setDownloading(null);
    }
  };

  if (restoring) {
    return (
      <RestoreForm
        job={job}
        snapshot={snapshot}
        includes={restoring}
        localRepo={localRepo}
        onClose={() => setRestoring(null)}
        onStarted={onRestoreStarted}
      />
    );
  }

  return (
    <PanelShell
      leading={<BackButton onClick={onBack} label={t("common.back")} />}
      title={t("snapshots.browseTitle", { time: formatDate(snapshot.time) })}
      status={snapshot.shortId}
      actions={
        <Button size="sm" onClick={() => setRestoring(picked)}>
          <ArchiveRestore className="size-3.5" />
          {picked.length
            ? t("snapshots.restorePicked", { count: picked.length })
            : t("snapshots.restoreAll")}
        </Button>
      }
      toolbar={
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-3 py-1.5 text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setDir("/")}
          >
            {t("snapshots.root")}
          </button>
          {crumbs(dir).map((crumb) => (
            <span key={crumb.path} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDir(crumb.path)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
      }
      scroll
    >
      {error ? (
        <p className="px-3 py-2 text-xs text-destructive">{error}</p>
      ) : !entries ? (
        <LoadingState compact />
      ) : (
        <PanelList empty={<EmptyState title={t("snapshots.emptyFolder")} />}>
          {entries.map((entry, index) => {
            const checked = picked.includes(entry.path);
            return (
              <ListRow
                key={entry.path}
                stripe={index}
                tone="none"
                leading={
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="flex shrink-0 items-center pl-2"
                  >
                    <Checkbox
                      checked={checked}
                      aria-label={t("snapshots.pick")}
                      onCheckedChange={(on) =>
                        setPicked((list) =>
                          on === true
                            ? [...list, entry.path]
                            : list.filter((p) => p !== entry.path),
                        )
                      }
                    />
                  </span>
                }
                icon={
                  entry.type === "dir" ? (
                    <Folder className="size-3.5" />
                  ) : entry.type === "symlink" ? (
                    <Link2 className="size-3.5" />
                  ) : (
                    <File className="size-3.5" />
                  )
                }
                title={entry.name}
                meta={[
                  entry.type === "file" ? formatBytes(entry.size) : "",
                  formatDate(entry.mtime),
                ]
                  .filter(Boolean)
                  .join(" | ")}
                onClick={
                  entry.type === "dir" ? () => setDir(entry.path) : undefined
                }
                trailing={
                  entry.type === "dir" || entry.type === "file" ? (
                    <ListRowAction
                      label={
                        entry.type === "dir"
                          ? t("snapshots.downloadZip")
                          : t("snapshots.download")
                      }
                      disabled={downloading === entry.path}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        void download(entry);
                      }}
                    >
                      <Download />
                    </ListRowAction>
                  ) : undefined
                }
              />
            );
          })}
        </PanelList>
      )}
    </PanelShell>
  );
}
