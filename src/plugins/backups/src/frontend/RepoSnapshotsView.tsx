import { useCallback, useEffect, useState } from "react";
import { Camera, FolderSearch } from "lucide-react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  SelectField,
} from "@termix-ssh/plugin-sdk/ui";
import type { RepositoryView, SnapshotView } from "../shared/types";
import { errorMessage, listRepoSnapshots, type SnapshotSource } from "./api";
import { formatBytes, formatDate, formatWhen } from "./format";

/**
 * Every snapshot in a repository, also ones Termix did not make. restic runs
 * on a host the user picks, or the folder's own host for a folder repository.
 */
export function RepoSnapshotsView({
  repo,
  hostId,
  onHost,
  onBrowse,
}: {
  repo: RepositoryView;
  hostId: number;
  onHost: (hostId: number) => void;
  onBrowse: (source: SnapshotSource, snapshot: SnapshotView) => void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const local = repo.kind === "local";
  const readHost = local ? (repo.location.hostId ?? 0) : hostId;
  const [snapshots, setSnapshots] = useState<SnapshotView[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!readHost) return;
    setSnapshots(null);
    setError("");
    try {
      const list = await listRepoSnapshots(repo.id, readHost);
      setSnapshots([...list].sort((a, b) => b.time.localeCompare(a.time)));
    } catch (e) {
      setError(errorMessage(e, t("snapshots.loadFailed")));
    }
  }, [repo.id, readHost, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const source: SnapshotSource = {
    jobId: null,
    repoId: repo.id,
    hostId: readHost,
    localRepo: local,
  };

  return (
    <div className="flex flex-col">
      {!local && (
        <div className="border-b border-border px-3 py-2">
          <SelectField
            label={t("repoSnapshots.host")}
            hint={t("repoSnapshots.hostHint")}
            value={hostId ? String(hostId) : ""}
            placeholder={t("editor.pickHost")}
            onChange={(value) => onHost(Number(value))}
            options={hosts
              .filter((h) => h.enableSsh !== false)
              .map((h) => ({
                value: String(h.id),
                label: h.name || h.ip || `#${h.id}`,
              }))}
          />
        </div>
      )}
      {!readHost ? (
        <EmptyState title={t("repoSnapshots.pickHost")} />
      ) : error ? (
        <p className="px-3 py-2 text-xs text-destructive">{error}</p>
      ) : !snapshots ? (
        <LoadingState compact />
      ) : (
        <PanelList empty={<EmptyState title={t("snapshots.empty")} />}>
          {snapshots.map((snapshot, index) => {
            const own = snapshot.tags.includes("termix");
            return (
              <ListRow
                key={snapshot.id}
                stripe={index}
                tone={own ? "brand" : "muted"}
                icon={<Camera className="size-3.5" />}
                title={formatDate(snapshot.time)}
                badges={
                  own ? undefined : (
                    <ListBadge tone="muted">
                      {t("repoSnapshots.external")}
                    </ListBadge>
                  )
                }
                meta={[
                  snapshot.hostname,
                  formatWhen(snapshot.time, t),
                  snapshot.bytes !== null ? formatBytes(snapshot.bytes) : "",
                  snapshot.paths.slice(0, 3).join(", "),
                  snapshot.shortId,
                ]
                  .filter(Boolean)
                  .join(" | ")}
                onClick={() => onBrowse(source, snapshot)}
                trailing={
                  <ListRowAction
                    label={t("snapshots.browse")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onBrowse(source, snapshot);
                    }}
                  >
                    <FolderSearch />
                  </ListRowAction>
                }
              />
            );
          })}
        </PanelList>
      )}
    </div>
  );
}
