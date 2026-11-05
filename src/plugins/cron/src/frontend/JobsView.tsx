import { useCallback, useEffect, useState } from "react";
import { Clock, FileText, Play, Power, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InlineView,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { CronJob, CronStatus, RunResult } from "../shared/types";
import { deleteJob, errorMessage, getJobs, runJob, setJobEnabled } from "./api";
import { Loading } from "./Loading";
import { nextRunText, scheduleText } from "./schedule-text";

const OWN = "__own__";

export function JobsView({
  hostId,
  status,
  user,
  onUser,
  isVisible,
  onOpen,
  onRaw,
}: {
  hostId: number;
  status: CronStatus;
  user: string;
  onUser: (user: string) => void;
  isVisible: boolean;
  onOpen: (job: CronJob) => void;
  onRaw: () => void;
}) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [output, setOutput] = useState<{
    job: CronJob;
    result: RunResult;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs((await getJobs(hostId, user)).jobs);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("jobs.loadFailed")));
    }
  }, [hostId, user, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const act = async (
    job: CronJob,
    work: () => Promise<{ jobs: CronJob[] }>,
  ) => {
    setBusy(job.id);
    try {
      setJobs((await work()).jobs);
    } catch (e) {
      toast.error(errorMessage(e, t("jobs.saveFailed")));
      void load();
    } finally {
      setBusy("");
    }
  };

  const run = async (job: CronJob) => {
    const ok = await confirm({
      title: t("jobs.runTitle"),
      description: t("jobs.runDesc", { command: job.command }),
      confirmLabel: t("jobs.run"),
    });
    if (!ok) return;
    setBusy(job.id);
    try {
      setOutput({ job, result: await runJob(hostId, user, job.id) });
    } catch (e) {
      toast.error(errorMessage(e, t("jobs.runFailed")));
    } finally {
      setBusy("");
    }
  };

  const remove = async (job: CronJob) => {
    const ok = await confirm({
      title: t("jobs.deleteTitle"),
      description: job.label || job.command,
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (ok) await act(job, () => deleteJob(hostId, user, job.id));
  };

  const needle = search.trim().toLowerCase();
  const visible = (jobs ?? []).filter(
    (job) =>
      !needle ||
      job.command.toLowerCase().includes(needle) ||
      job.label.toLowerCase().includes(needle) ||
      job.schedule.includes(needle),
  );
  const users = status.users.filter((name) => name !== status.user);
  const canEdit = status.canEdit;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {canEdit && status.root && users.length > 0 && (
          <Select
            value={user || OWN}
            onValueChange={(value) => onUser(value === OWN ? "" : value)}
          >
            <SelectTrigger
              size="sm"
              className="w-44"
              aria-label={t("jobs.user")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OWN}>
                {t("jobs.ownUser", { user: status.user })}
              </SelectItem>
              {users.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("jobs.search")}
          className="min-w-48 flex-1"
        />
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onRaw}>
            <FileText className="size-4" />
            {t("jobs.editText")}
          </Button>
        )}
      </div>
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !jobs ? (
        <Loading />
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {jobs.length === 0 ? t("jobs.empty") : t("jobs.noMatch")}
        </p>
      ) : (
        <PanelList>
          {visible.map((job, index) => {
            const next = job.enabled
              ? nextRunText(job.schedule, status.offsetMinutes, language)
              : "";
            return (
              <ListRow
                key={job.id}
                stripe={index}
                icon={<Clock className="size-4" />}
                tone={job.enabled ? "brand" : "muted"}
                dimmed={!job.enabled}
                title={
                  job.label ? (
                    job.label
                  ) : (
                    <span className="font-mono">{job.command}</span>
                  )
                }
                badges={
                  !job.enabled ? (
                    <ListBadge>{t("jobs.off")}</ListBadge>
                  ) : undefined
                }
                meta={
                  <span>
                    <span className="font-mono">{job.schedule}</span>
                    {` | ${scheduleText(t, job.schedule)}`}
                    {next ? ` | ${t("jobs.next", { time: next })}` : ""}
                    {job.label ? (
                      <span className="font-mono">{` | ${job.command}`}</span>
                    ) : null}
                  </span>
                }
                onClick={canEdit ? () => onOpen(job) : undefined}
                actions={
                  canEdit ? (
                    <>
                      <ListRowAction
                        label={t("jobs.run")}
                        tone="brand"
                        disabled={busy === job.id}
                        onClick={() => void run(job)}
                      >
                        <Play className="size-4" />
                      </ListRowAction>
                      <ListRowAction
                        label={
                          job.enabled ? t("jobs.turnOff") : t("jobs.turnOn")
                        }
                        disabled={busy === job.id}
                        onClick={() =>
                          void act(job, () =>
                            setJobEnabled(hostId, user, job.id, !job.enabled),
                          )
                        }
                      >
                        <Power className="size-4" />
                      </ListRowAction>
                      <ListRowAction
                        label={t("common.delete")}
                        tone="destructive"
                        disabled={busy === job.id}
                        onClick={() => void remove(job)}
                      >
                        <Trash2 className="size-4" />
                      </ListRowAction>
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </PanelList>
      )}
      <InlineView
        open={output !== null}
        onOpenChange={(open) => !open && setOutput(null)}
        title={t("jobs.outputTitle")}
        status={
          output
            ? output.result.code === 0
              ? t("jobs.exitOk")
              : t("jobs.exitCode", { code: output.result.code ?? "?" })
            : undefined
        }
        bare
      >
        {output && (
          <div className="flex flex-col">
            <p className="border-b border-border px-3 py-2 font-mono text-xs text-muted-foreground">
              {output.job.command}
            </p>
            <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
              {output.result.output || t("jobs.noOutput")}
            </pre>
          </div>
        )}
      </InlineView>
    </div>
  );
}
