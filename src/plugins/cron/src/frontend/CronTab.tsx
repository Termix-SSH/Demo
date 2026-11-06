import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  EmptyState,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { CronJob, CronStatus } from "../shared/types";
import { errorCode, errorMessage, getStatus } from "./api";
import { JobForm } from "./JobForm";
import { JobsView } from "./JobsView";
import { LogsView } from "./LogsView";
import { RawEditor } from "./RawEditor";
import { SystemFileEditor } from "./SystemFileEditor";
import { SystemView } from "./SystemView";

type View = "jobs" | "system" | "logs";
type Screen =
  | { kind: "list" }
  | { kind: "job"; job: CronJob | null }
  | { kind: "raw" }
  | { kind: "file"; name: string; text: string };

/** Cron jobs, system cron files and the cron log for one host. */
export function CronTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("jobs");
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [user, setUser] = useState("");
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === "disabled"
          ? t("tab.disabled")
          : code === "sudo"
            ? t("tab.sudo")
            : errorMessage(e, t("tab.error")),
      );
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <Clock className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <LoadingState />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const back = () => {
    setScreen({ kind: "list" });
    setTick((n) => n + 1);
  };

  if (screen.kind === "job") {
    return (
      <PanelFrame>
        <JobForm
          hostId={hostId}
          user={user}
          job={screen.job}
          status={status}
          onClose={back}
        />
      </PanelFrame>
    );
  }
  if (screen.kind === "raw") {
    return (
      <PanelFrame>
        <RawEditor hostId={hostId} user={user} onClose={back} />
      </PanelFrame>
    );
  }
  if (screen.kind === "file") {
    return (
      <PanelFrame>
        <SystemFileEditor
          hostId={hostId}
          name={screen.name}
          text={screen.text}
          onClose={back}
        />
      </PanelFrame>
    );
  }

  const statusLine = [
    !status.installed
      ? t("tab.notInstalled")
      : status.running
        ? t("tab.running")
        : t("tab.stopped"),
    status.timezone,
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const fill = view === "logs";

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void load();
                setTick((n) => n + 1);
              }}
              loading={loading}
              label={t("tab.refresh")}
            />
            {status.canEdit && status.installed && view === "jobs" && (
              <AddButton
                label={t("jobs.add")}
                onClick={() => setScreen({ kind: "job", job: null })}
              />
            )}
            {status.canEdit && status.root && view === "system" && (
              <AddButton
                label={t("system.add")}
                onClick={() => setScreen({ kind: "file", name: "", text: "" })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "jobs", label: t("tab.viewJobs") },
              { id: "system", label: t("tab.viewSystem") },
              { id: "logs", label: t("tab.viewLogs") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll={!fill}
      >
        <div
          className={`flex flex-col ${fill ? "min-h-0 flex-1" : "shrink-0"}`}
        >
          {status.installed && !status.running && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.notRunning")}
            </Alert>
          )}
          {!status.installed && view === "jobs" ? (
            <NoticePanel icon={Clock} title={t("tab.notInstalledTitle")}>
              {t("tab.notInstalledHint")}
            </NoticePanel>
          ) : view === "jobs" ? (
            <JobsView
              key={tick}
              hostId={hostId}
              status={status}
              user={user}
              onUser={setUser}
              isVisible={isVisible}
              onOpen={(job) => setScreen({ kind: "job", job })}
              onRaw={() => setScreen({ kind: "raw" })}
            />
          ) : view === "system" ? (
            <SystemView
              key={tick}
              hostId={hostId}
              status={status}
              isVisible={isVisible}
              onEdit={(name, text) => setScreen({ kind: "file", name, text })}
            />
          ) : (
            <LogsView key={tick} hostId={hostId} />
          )}
        </div>
      </PanelShell>
    </PanelFrame>
  );
}
