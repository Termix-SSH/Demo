import { useCallback, useEffect, useState } from "react";
import { DatabaseBackup } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  Button,
  EmptyState,
  LoadingState,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { HostStatus, JobView, SnapshotView } from "../shared/types";
import { errorCode, errorMessage, getStatus, installRestic } from "./api";
import { JobEditor } from "./JobEditor";
import { JobList } from "./JobList";
import { RunDetail } from "./RunDetail";
import { RunsView } from "./RunsView";
import { SnapshotBrowser } from "./SnapshotBrowser";
import { SnapshotsView } from "./SnapshotsView";
import { useJobs } from "./useJobs";

type View = "jobs" | "snapshots" | "history";

type Overlay =
  | { kind: "editor"; job: JobView | null }
  | { kind: "run"; runId: number }
  | { kind: "browse"; job: JobView; snapshot: SnapshotView }
  | null;

/** Backups of one host: jobs, snapshots and history. */
export function HostBackupsTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [installing, setInstalling] = useState(false);
  const [view, setView] = useState<View>("jobs");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [snapshotJob, setSnapshotJob] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const jobs = useJobs(hostId || undefined, isVisible && !!hostId);

  const loadStatus = useCallback(async () => {
    if (!hostId) return;
    try {
      setStatus(await getStatus(hostId));
      setStatusError("");
    } catch (e) {
      setStatusError(
        errorCode(e) === "sudo"
          ? t("hostTab.sudo")
          : errorMessage(e, t("hostTab.statusFailed")),
      );
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void loadStatus();
  }, [isVisible, loadStatus]);

  if (!host) return <EmptyState title={t("hostTab.noHost")} />;
  const title = label || host.name || t("hostTab.title");

  const install = async () => {
    const ok = await confirm({
      title: t("install.title"),
      description: t("install.desc"),
      confirmLabel: t("install.confirm"),
      destructive: false,
    });
    if (!ok) return;
    setInstalling(true);
    try {
      const version = await installRestic(hostId);
      toast.success(t("install.done", { version }));
      await loadStatus();
    } catch (e) {
      toast.error(errorMessage(e, t("install.failed")));
    } finally {
      setInstalling(false);
    }
  };

  const refresh = () => {
    void loadStatus();
    void jobs.load();
    setTick((n) => n + 1);
  };

  if (overlay?.kind === "browse") {
    return (
      <PanelFrame>
        <SnapshotBrowser
          job={overlay.job}
          snapshot={overlay.snapshot}
          localRepo={overlay.job.repositoryKind === "local"}
          onBack={() => setOverlay(null)}
          onRestoreStarted={(runId) => setOverlay({ kind: "run", runId })}
        />
      </PanelFrame>
    );
  }

  const ready = status?.resticOk ?? false;

  return (
    <PanelFrame>
      <PanelShell
        icon={<DatabaseBackup className="size-4" />}
        title={title}
        status={
          status
            ? status.restic
              ? t("hostTab.restic", { version: status.restic })
              : t("hostTab.noRestic")
            : undefined
        }
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
                onClick={() => setOverlay({ kind: "editor", job: null })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "jobs", label: t("hostTab.viewJobs") },
              { id: "snapshots", label: t("hostTab.viewSnapshots") },
              { id: "history", label: t("hostTab.viewHistory") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll
      >
        {statusError && (
          <Alert className="border-x-0 border-t-0 text-xs">{statusError}</Alert>
        )}
        {status && !ready && (
          <NoticePanel
            icon={DatabaseBackup}
            title={status.restic ? t("install.tooOld") : t("install.missing")}
            action={
              <Button
                onClick={() => void install()}
                disabled={installing || !status.root}
              >
                {installing ? t("install.working") : t("install.button")}
              </Button>
            }
          >
            {status.root ? t("install.hint") : t("hostTab.sudo")}
          </NoticePanel>
        )}
        {view === "jobs" &&
          (jobs.error ? (
            <p className="px-3 py-2 text-xs text-destructive">{jobs.error}</p>
          ) : !jobs.jobs ? (
            <LoadingState compact />
          ) : (
            <JobList
              jobs={jobs.jobs}
              busy={jobs.busy}
              empty={
                <EmptyState
                  icon={DatabaseBackup}
                  title={t("jobs.empty")}
                  hint={t("jobs.emptyHint")}
                />
              }
              onEdit={(job) => setOverlay({ kind: "editor", job })}
              onRun={async (job) => {
                const runId = await jobs.run(job);
                if (runId) setOverlay({ kind: "run", runId });
              }}
              onStop={(job) => void jobs.stop(job)}
              onSnapshots={(job) => {
                setSnapshotJob(job.id);
                setView("snapshots");
              }}
              onOpenRun={(runId) => setOverlay({ kind: "run", runId })}
            />
          ))}
        {view === "snapshots" && jobs.jobs && (
          <SnapshotsView
            key={tick}
            jobs={jobs.jobs}
            jobId={snapshotJob}
            onJob={setSnapshotJob}
            onBrowse={(job, snapshot) =>
              setOverlay({ kind: "browse", job, snapshot })
            }
          />
        )}
        {view === "history" && (
          <RunsView
            key={tick}
            hostId={hostId}
            isVisible={isVisible}
            onOpen={(runId) => setOverlay({ kind: "run", runId })}
          />
        )}
      </PanelShell>
      {overlay?.kind === "editor" && (
        <JobEditor
          hostId={hostId}
          job={overlay.job}
          onClose={() => setOverlay(null)}
          onSaved={() => {
            setOverlay(null);
            void jobs.load();
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
