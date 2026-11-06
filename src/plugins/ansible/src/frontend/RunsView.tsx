import { useCallback, useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { RunSummary } from "../shared/types";
import { errorMessage, getRuns } from "./api";
import { formatDuration, formatTime } from "./format";
import { Loading } from "./Loading";

const POLL_MS = 4000;

/** Recent runs kept on the control host. */
export function RunsView({
  hostId,
  isVisible,
  onOpen,
}: {
  hostId: number;
  isVisible: boolean;
  onOpen: (run: RunSummary) => void;
}) {
  const { t, language } = useTranslation();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setRuns(await getRuns(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("runs.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const anyRunning = runs?.some((run) => run.state === "running") ?? false;
  useEffect(() => {
    if (!isVisible || !anyRunning) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, anyRunning, load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!runs) return <Loading />;
  if (runs.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
        {t("runs.empty")}
      </p>
    );
  }

  return (
    <PanelList>
      {runs.map((run, index) => (
        <ListRow
          key={run.id}
          stripe={index}
          icon={<Workflow className="size-4" />}
          tone={
            run.state === "ok"
              ? "success"
              : run.state === "failed"
                ? "destructive"
                : run.state === "running"
                  ? "brand"
                  : "muted"
          }
          title={run.title}
          badges={
            <>
              <ListBadge
                tone={
                  run.state === "ok"
                    ? "success"
                    : run.state === "failed"
                      ? "destructive"
                      : run.state === "running"
                        ? "brand"
                        : "muted"
                }
              >
                {t(`runs.state.${run.state}`)}
              </ListBadge>
              {run.check && <ListBadge>{t("runs.checkMode")}</ListBadge>}
            </>
          }
          meta={[
            t(`runs.kind.${run.kind}`),
            formatTime(run.startedAt, language),
            formatDuration(run.startedAt, run.endedAt),
          ].join(" | ")}
          onClick={() => onOpen(run)}
        />
      ))}
    </PanelList>
  );
}
