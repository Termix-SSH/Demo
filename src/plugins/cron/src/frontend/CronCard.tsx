import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  useCurrentUser,
  useHosts,
  useTabs,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ManagerCardShell,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { CronJob } from "../shared/types";
import { errorMessage, getJobs, setJobEnabled } from "./api";
import { canEditHost, cronEnabled } from "./enabled";
import { scheduleText } from "./schedule-text";

/** The Cron card Host Metrics shows in its manager cards. */
export function CronCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const tabs = useTabs();
  const user = useCurrentUser();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && cronEnabled(host);
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!on || hostId == null) return;
    setLoading(true);
    try {
      setJobs((await getJobs(hostId, "")).jobs);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("jobs.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [on, hostId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!host || hostId == null) return null;
  const canEdit = canEditHost(host, !!user?.isAdmin);

  const toggle = async (job: CronJob) => {
    setBusy(job.id);
    try {
      setJobs((await setJobEnabled(hostId, "", job.id, !job.enabled)).jobs);
    } catch (e) {
      toast.error(errorMessage(e, t("jobs.saveFailed")));
    } finally {
      setBusy("");
    }
  };

  return (
    <ManagerCardShell
      title={t("manager.title")}
      icon={<Clock className="size-3.5" />}
      loading={loading}
      error={failed ? { message: failed } : null}
      onRefresh={() => void load()}
      empty={!on || jobs?.length === 0}
      emptyMessage={on ? t("jobs.empty") : t("manager.disabled")}
    >
      <PanelList>
        {(jobs ?? []).map((job, index) => (
          <ListRow
            key={job.id}
            stripe={index}
            icon={<Clock className="size-4" />}
            tone={job.enabled ? "brand" : "muted"}
            dimmed={!job.enabled}
            title={
              job.label || <span className="font-mono">{job.command}</span>
            }
            badges={
              !job.enabled ? <ListBadge>{t("jobs.off")}</ListBadge> : undefined
            }
            meta={
              <span>
                <span className="font-mono">{job.schedule}</span>
                {` | ${scheduleText(t, job.schedule)}`}
              </span>
            }
            onClick={() => tabs.openTab(host as never, "cron")}
            trailing={
              canEdit ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy === job.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggle(job);
                  }}
                >
                  {job.enabled ? t("jobs.turnOff") : t("jobs.turnOn")}
                </Button>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </ManagerCardShell>
  );
}
