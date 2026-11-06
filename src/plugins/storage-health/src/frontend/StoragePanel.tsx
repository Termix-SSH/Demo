import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, TabStrip } from "@termix-ssh/plugin-sdk/ui";
import {
  errorCode,
  errorMessage,
  getHost,
  refreshHost,
  type HostView,
} from "./api";
import { DrivesView } from "./DrivesView";
import { EventsView } from "./EventsView";
import { timeAgo } from "./format";
import { PoolsView } from "./PoolsView";
import { SettingsView } from "./SettingsView";

type View = "drives" | "pools" | "events" | "settings";

const POLL_MS = 60_000;

/** The storage views for one host. The tab and the Host Metrics card both draw it. */
export function StoragePanel({
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
  const [view, setView] = useState<View>("drives");
  const [selected, setSelected] = useState<string | null>(null);
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
    onStatus(data?.reading ? t(`health.${data.status}`) : "");
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
    return (
      <p className="p-2 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }

  const tabs: Array<{ id: View; label: string; count?: number }> = [
    {
      id: "drives",
      label: t("tab.viewDrives"),
      count: data.reading?.devices.length,
    },
    {
      id: "pools",
      label: t("tab.viewPools"),
      count: data.reading
        ? data.reading.pools.length +
          data.reading.arrays.length +
          data.reading.btrfs.length
        : undefined,
    },
    { id: "events", label: t("tab.viewEvents") },
    { id: "settings", label: t("tab.viewSettings") },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        ) : !data.reading ? (
          <p className="p-3 text-xs text-muted-foreground">
            {data.error || t("drives.noData")}
          </p>
        ) : view === "pools" ? (
          <PoolsView
            hostId={hostId}
            reading={data.reading}
            canEdit={data.canEdit}
            onChanged={() => void load(true)}
          />
        ) : (
          <DrivesView
            hostId={hostId}
            reading={data.reading}
            canEdit={data.canEdit}
            isVisible={isVisible}
            selected={selected}
            onSelect={setSelected}
            onChanged={() => void load(true)}
          />
        )}
      </div>
    </div>
  );
}
