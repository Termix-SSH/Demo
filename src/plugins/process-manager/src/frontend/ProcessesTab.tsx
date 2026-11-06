import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  AlertDescription,
  EmptyState,
  PanelFrame,
  PanelShell,
  TabStrip,
  LoadingState,
  RefreshButton,
} from "@termix-ssh/plugin-sdk/ui";
import type { LogTarget, StatusView } from "../shared/types";
import { AppsView } from "./AppsView";
import { errorCode, errorMessage, getStatus } from "./api";
import { LogsView } from "./LogsView";
import { ProcessesView } from "./ProcessesView";
import { WatchesView } from "./WatchesView";

type View = "processes" | "apps" | "logs" | "watches";

/** Processes, pm2 and supervisor apps, logs and watches for one host. */
export function ProcessesTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("processes");
  const [loading, setLoading] = useState(false);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === "sudo"
          ? t("tab.sudo")
          : code === "disabled"
            ? t("tab.disabled")
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
  const icon = <Activity className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <LoadingState label={t("tab.loading")} />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const views: Array<{ id: View; label: string }> = [
    { id: "processes", label: t("tab.viewProcesses") },
    { id: "apps", label: t("tab.viewApps") },
    { id: "logs", label: t("tab.viewLogs") },
    { id: "watches", label: t("tab.viewWatches") },
  ];

  const statusLine = [
    status.os,
    status.root ? "root" : status.user,
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const openLogs = (target: LogTarget) => {
    setLogTarget(target);
    setView("logs");
  };

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <RefreshButton
            onClick={() => void load()}
            loading={loading}
            label={t("tab.refresh")}
          />
        }
        tabs={
          <TabStrip
            tabs={views}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll={view !== "logs"}
      >
        <div
          className={`flex flex-col ${view === "logs" ? "min-h-0 flex-1" : "shrink-0"}`}
        >
          {status.canEdit && !status.root && (
            <Alert className="border-x-0 border-t-0">
              <AlertDescription className="text-xs">
                {t("tab.sudo")}
              </AlertDescription>
            </Alert>
          )}
          {view === "processes" ? (
            <ProcessesView host={host} status={status} isVisible={isVisible} />
          ) : view === "apps" ? (
            <AppsView
              hostId={hostId}
              status={status}
              isVisible={isVisible}
              onLogs={openLogs}
            />
          ) : view === "logs" ? (
            <LogsView host={host} initial={logTarget} isVisible={isVisible} />
          ) : (
            <WatchesView hostId={hostId} isVisible={isVisible} />
          )}
        </div>
      </PanelShell>
    </PanelFrame>
  );
}
