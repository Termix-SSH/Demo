import { useCallback, useEffect, useState } from "react";
import {
  Cloud,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  Server,
} from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  BackButton,
  EmptyState,
  ListBadge,
  ListRow,
  LoadingState,
  PanelFrame,
  PanelList,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type { JobView, RepositoryView, SnapshotView } from "../shared/types";
import { errorMessage, listRepositories } from "./api";
import { JobEditor } from "./JobEditor";
import { JobList } from "./JobList";
import { RepoEditor } from "./RepoEditor";
import { RunDetail } from "./RunDetail";
import { RunsView } from "./RunsView";
import { SnapshotBrowser } from "./SnapshotBrowser";
import { SnapshotsView } from "./SnapshotsView";
import { useJobs } from "./useJobs";

type View = "jobs" | "repositories" | "history";

type Overlay =
  | { kind: "job"; job: JobView | null }
  | { kind: "repo"; repo: RepositoryView | null }
  | { kind: "run"; runId: number }
  | { kind: "snapshots"; job: JobView }
  | { kind: "browse"; job: JobView; snapshot: SnapshotView }
  | null;

const KIND_ICON = {
  s3: Cloud,
  rest: Server,
  rclone: Cloud,
  local: FolderOpen,
} as const;

function where(repo: RepositoryView): string {
  const l = repo.location;
  switch (repo.kind) {
    case "s3":
      return [l.endpoint || "s3.amazonaws.com", l.bucket, l.prefix]
        .filter(Boolean)
        .join("/");
    case "rest":
      return l.url ?? "";
    case "rclone":
      return `${l.remote}:${l.path ?? ""}`;
    default:
      return l.path ?? "";
  }
}

/** Every backup job, the repositories they write to, and the run history. */
export function BackupsTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("jobs");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [repos, setRepos] = useState<RepositoryView[] | null>(null);
  const [repoError, setRepoError] = useState("");
  const [tick, setTick] = useState(0);
  const jobs = useJobs(undefined, isVisible);

  const loadRepos = useCallback(async () => {
    try {
      setRepos(await listRepositories());
      setRepoError("");
    } catch (e) {
      setRepoError(errorMessage(e, t("repos.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    if (isVisible) void loadRepos();
  }, [isVisible, loadRepos]);

  const refresh = () => {
    void jobs.load();
    void loadRepos();
    setTick((n) => n + 1);
  };

  if (overlay?.kind === "browse") {
    return (
      <PanelFrame>
        <SnapshotBrowser
          job={overlay.job}
          snapshot={overlay.snapshot}
          localRepo={overlay.job.repositoryKind === "local"}
          onBack={() => setOverlay({ kind: "snapshots", job: overlay.job })}
          onRestoreStarted={(runId) => setOverlay({ kind: "run", runId })}
        />
      </PanelFrame>
    );
  }

  if (overlay?.kind === "snapshots") {
    return (
      <PanelFrame>
        <PanelShell
          icon={<DatabaseBackup className="size-4" />}
          title={t("snapshots.titleFor", { name: overlay.job.name })}
          leading={
            <BackButton
              onClick={() => setOverlay(null)}
              label={t("common.back")}
            />
          }
          scroll
        >
          <SnapshotsView
            jobs={[overlay.job]}
            jobId={overlay.job.id}
            onJob={() => undefined}
            onBrowse={(job, snapshot) =>
              setOverlay({ kind: "browse", job, snapshot })
            }
          />
        </PanelShell>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame>
      <PanelShell
        icon={<DatabaseBackup className="size-4" />}
        title={t("tab.title")}
        actions={
          <>
            <RefreshButton
              onClick={refresh}
              loading={jobs.loading}
              label={t("common.refresh")}
            />
            {view === "jobs" && (
              <AddButton
                label={t("jobs.add")}
                onClick={() => setOverlay({ kind: "job", job: null })}
              />
            )}
            {view === "repositories" && (
              <AddButton
                label={t("repos.add")}
                onClick={() => setOverlay({ kind: "repo", repo: null })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "jobs", label: t("tab.viewJobs") },
              { id: "repositories", label: t("tab.viewRepos") },
              { id: "history", label: t("tab.viewHistory") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll
      >
        {view === "jobs" &&
          (jobs.error ? (
            <p className="px-3 py-2 text-xs text-destructive">{jobs.error}</p>
          ) : !jobs.jobs ? (
            <LoadingState compact />
          ) : (
            <JobList
              jobs={jobs.jobs}
              showHost
              busy={jobs.busy}
              empty={
                <EmptyState
                  icon={DatabaseBackup}
                  title={t("jobs.empty")}
                  hint={
                    repos && repos.length === 0
                      ? t("jobs.emptyNoRepo")
                      : t("jobs.emptyHint")
                  }
                />
              }
              onEdit={(job) => setOverlay({ kind: "job", job })}
              onRun={async (job) => {
                const runId = await jobs.run(job);
                if (runId) setOverlay({ kind: "run", runId });
              }}
              onStop={(job) => void jobs.stop(job)}
              onSnapshots={(job) => setOverlay({ kind: "snapshots", job })}
              onOpenRun={(runId) => setOverlay({ kind: "run", runId })}
            />
          ))}
        {view === "repositories" &&
          (repoError ? (
            <p className="px-3 py-2 text-xs text-destructive">{repoError}</p>
          ) : !repos ? (
            <LoadingState compact />
          ) : (
            <PanelList
              empty={
                <EmptyState
                  icon={HardDrive}
                  title={t("repos.empty")}
                  hint={t("repos.emptyHint")}
                />
              }
            >
              {repos.map((repo, index) => {
                const Icon = KIND_ICON[repo.kind];
                return (
                  <ListRow
                    key={repo.id}
                    stripe={index}
                    tone="brand"
                    icon={<Icon className="size-3.5" />}
                    title={repo.name}
                    badges={
                      <ListBadge tone="muted">
                        {t(`repos.kinds.${repo.kind}`)}
                      </ListBadge>
                    }
                    meta={[
                      where(repo),
                      t("repos.jobCount", { count: repo.jobs }),
                    ].join(" | ")}
                    onClick={() => setOverlay({ kind: "repo", repo })}
                  />
                );
              })}
            </PanelList>
          ))}
        {view === "history" && (
          <RunsView
            key={tick}
            showHost
            isVisible={isVisible}
            onOpen={(runId) => setOverlay({ kind: "run", runId })}
          />
        )}
      </PanelShell>
      {overlay?.kind === "job" && (
        <JobEditor
          hostId={overlay.job?.hostId ?? null}
          job={overlay.job}
          onClose={() => setOverlay(null)}
          onSaved={() => {
            setOverlay(null);
            void jobs.load();
            void loadRepos();
          }}
        />
      )}
      {overlay?.kind === "repo" && (
        <RepoEditor
          repo={overlay.repo}
          onClose={() => setOverlay(null)}
          onSaved={() => {
            setOverlay(null);
            void loadRepos();
          }}
        />
      )}
      {overlay?.kind === "run" && (
        <RunDetail
          runId={overlay.runId}
          onClose={() => {
            setOverlay(null);
            void jobs.load();
          }}
        />
      )}
    </PanelFrame>
  );
}
