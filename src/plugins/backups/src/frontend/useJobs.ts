import { useCallback, useEffect, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useConfirm } from "@termix-ssh/plugin-sdk/ui";
import type { JobView } from "../shared/types";
import { cancelRun, errorMessage, listJobs, runJob } from "./api";

const RUNNING_POLL_MS = 4_000;
const IDLE_POLL_MS = 60_000;

/** Jobs of one host, or of every host, kept fresh while the view shows. */
export function useJobs(hostId: number | undefined, isVisible: boolean) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await listJobs(hostId));
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("jobs.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  const running = jobs?.some((job) => job.runningRunId) ?? false;

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(
      () => void load(),
      running ? RUNNING_POLL_MS : IDLE_POLL_MS,
    );
    return () => clearInterval(timer);
  }, [isVisible, load, running]);

  const run = async (job: JobView): Promise<number | null> => {
    setBusy(job.id);
    try {
      const started = await runJob(job.id);
      toast.success(t("jobs.started", { name: job.name }));
      await load();
      return started.id;
    } catch (e) {
      toast.error(errorMessage(e, t("jobs.runFailed")));
      await load();
      return null;
    } finally {
      setBusy(null);
    }
  };

  const stop = async (job: JobView) => {
    if (!job.runningRunId) return;
    const ok = await confirm({
      title: t("run.stopTitle"),
      description: t("run.stopDesc"),
      confirmLabel: t("jobs.stop"),
    });
    if (!ok) return;
    setBusy(job.id);
    try {
      await cancelRun(job.runningRunId);
      toast.success(t("run.stopSent"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("run.stopFailed")));
    } finally {
      setBusy(null);
    }
  };

  return { jobs, error, loading, busy, load, run, stop };
}
