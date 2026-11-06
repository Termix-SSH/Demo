import { useCallback, useEffect, useRef, useState } from "react";
import { Square, Trash2, Workflow } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  PanelShell,
  StatusBadge,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { RunDetail as Detail } from "../shared/types";
import { cancelRun, deleteRun, errorMessage, getRun } from "./api";
import { formatDuration, formatTime, stateTone } from "./format";
import { Loading } from "./Loading";

const POLL_MS = 2000;

/** One run: live output while it runs, then the recap per host. */
export function RunDetail({
  hostId,
  runId,
  canEdit,
  onClose,
}: {
  hostId: number;
  runId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [run, setRun] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  const load = useCallback(async () => {
    try {
      setRun(await getRun(hostId, runId));
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("runs.loadFailed")));
    }
  }, [hostId, runId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = run?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  useEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [run?.log]);

  const stop = async () => {
    try {
      await cancelRun(hostId, runId);
      void load();
    } catch (e) {
      toast.error(errorMessage(e, t("runs.stopFailed")));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("runs.deleteTitle"),
      description: run?.title ?? runId,
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteRun(hostId, runId);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t("runs.deleteFailed")));
    }
  };

  const status = run
    ? [
        formatTime(run.startedAt, language),
        formatDuration(run.startedAt, run.endedAt),
        run.check ? t("runs.checkMode") : "",
      ]
        .filter(Boolean)
        .join(" | ")
    : undefined;

  return (
    <PanelShell
      icon={<Workflow className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={run?.title ?? t("runs.title")}
      status={status}
      scroll={false}
      actions={
        run && canEdit ? (
          running ? (
            <Button variant="outline" size="sm" onClick={() => void stop()}>
              <Square className="size-4" />
              {t("runs.stop")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void remove()}>
              <Trash2 className="size-4" />
              {t("common.delete")}
            </Button>
          )
        ) : undefined
      }
    >
      {!run ? (
        error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : (
          <Loading />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
            <StatusBadge tone={stateTone(run.state)}>
              {t(`runs.state.${run.state}`)}
            </StatusBadge>
            <code className="min-w-0 flex-1 truncate text-muted-foreground">
              {run.command}
            </code>
          </div>
          {run.recap.length > 0 && (
            <div className="shrink-0 overflow-auto border-b border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    {[
                      "host",
                      "ok",
                      "changed",
                      "unreachable",
                      "failed",
                      "skipped",
                    ].map((key) => (
                      <th key={key} className="px-3 py-1.5 font-medium">
                        {t(`runs.recap.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {run.recap.map((row) => (
                    <tr key={row.host} className="border-t border-border">
                      <td className="px-3 py-1.5 font-medium">{row.host}</td>
                      <td className="px-3 py-1.5">{row.ok}</td>
                      <td className="px-3 py-1.5">{row.changed}</td>
                      <td
                        className={`px-3 py-1.5 ${row.unreachable ? "text-destructive" : ""}`}
                      >
                        {row.unreachable}
                      </td>
                      <td
                        className={`px-3 py-1.5 ${row.failed ? "text-destructive" : ""}`}
                      >
                        {row.failed}
                      </td>
                      <td className="px-3 py-1.5">{row.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {run.truncated && (
            <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              {t("runs.truncated")}
            </p>
          )}
          <pre
            ref={logRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs"
          >
            {run.log || t("runs.noOutput")}
          </pre>
        </div>
      )}
    </PanelShell>
  );
}
