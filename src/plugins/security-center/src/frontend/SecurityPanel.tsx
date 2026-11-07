import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useToast } from "@termix-ssh/plugin-sdk/frontend";
import { Button, TabStrip, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import {
  errorCode,
  errorMessage,
  getHost,
  refreshHost,
  type HostView,
} from "./api";
import { EventsView } from "./EventsView";
import { timeAgo } from "./format";
import { KeysView } from "./KeysView";
import { OverviewView } from "./OverviewView";
import { SettingsView } from "./SettingsView";
import { VulnsView } from "./VulnsView";

type View = "overview" | "keys" | "vulns" | "events" | "settings";

const POLL_MS = 60_000;

/** The security views for one host. */
export function SecurityPanel({
  hostId,
  isVisible,
  onStatus,
}: {
  hostId: number;
  isVisible: boolean;
  onStatus?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<HostView | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (force = false) => {
      try {
        setData(force ? await refreshHost(hostId) : await getHost(hostId));
        setError("");
      } catch (e) {
        setError(
          errorCode(e) === "disabled"
            ? t("tab.disabled")
            : errorMessage(e, t("tab.error")),
        );
      }
    },
    [hostId, t],
  );

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  useEffect(() => {
    if (!onStatus) return;
    onStatus(
      data?.reading && data.score !== null
        ? t("tab.score", { score: data.score })
        : "",
    );
  }, [data, onStatus, t]);

  const refresh = async () => {
    setBusy(true);
    try {
      await load(true);
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <p className="px-3 py-2 text-xs text-destructive">{error}</p>;
  }
  if (!data) {
    return <LoadingState compact label={t("common.loading")} />;
  }

  const tabs: Array<{ id: View; label: string; count?: number }> = [
    { id: "overview", label: t("tab.viewOverview") },
    {
      id: "keys",
      label: t("tab.viewKeys"),
      count: data.reading?.keys.length,
    },
    { id: "vulns", label: t("tab.viewVulns"), count: data.scan?.total },
    { id: "events", label: t("tab.viewEvents") },
    { id: "settings", label: t("tab.viewSettings") },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-1">
        <TabStrip
          tabs={tabs}
          activeTab={view}
          onTabChange={(id) => setView(id as View)}
          trailing={
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {data.readAt
                ? t("tab.readAgo", { time: timeAgo(data.readAt) })
                : ""}
              <Button
                size="xs"
                variant="ghost"
                aria-label={t("common.refresh")}
                disabled={busy}
                onClick={() => void refresh()}
              >
                <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
              </Button>
            </span>
          }
        />
      </div>
      {data.error && data.reading && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">
          {t("tab.stale", { error: data.error })}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "events" ? (
          <EventsView hostId={hostId} isVisible={isVisible} />
        ) : view === "settings" ? (
          <SettingsView
            key={data.readAt ?? 0}
            hostId={hostId}
            config={data.config}
            canEdit={data.canEdit}
            onSaved={() => void load()}
          />
        ) : view === "vulns" ? (
          <VulnsView
            hostId={hostId}
            isVisible={isVisible}
            canEdit={data.canEdit}
            scanEnabled={data.scanEnabled}
            onChanged={() => void load()}
          />
        ) : !data.reading ? (
          <p className="p-3 text-xs text-muted-foreground">
            {data.error || t("overview.noData")}
          </p>
        ) : view === "keys" ? (
          <KeysView
            hostId={hostId}
            reading={data.reading}
            seenOn={data.seenOn}
            canManage={data.canManage}
            onChanged={() => void load(true)}
          />
        ) : (
          <OverviewView data={data} onOpen={(id) => setView(id)} />
        )}
      </div>
    </div>
  );
}
