import { useCallback, useEffect, useState } from "react";
import { HeartPulse } from "lucide-react";
import {
  useDocsUrl,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type { MonitorView } from "../shared/types";
import {
  errorMessage,
  getPermissions,
  listMonitors,
  type Permissions,
} from "./api";
import { POLL_MS } from "./format";
import { IncidentsView } from "./IncidentsView";
import { MaintenanceView } from "./MaintenanceView";
import { MonitorsView } from "./MonitorsView";
import { StatusPagesView } from "./StatusPagesView";

type View = "monitors" | "incidents" | "maintenance" | "pages";

export const NO_PERMISSIONS: Permissions = {
  manage: false,
  privateTargets: false,
  runCommands: false,
  publish: false,
  publicPages: false,
  minIntervalSec: 20,
  defaultIntervalSec: 60,
};

/** Every monitor, with incidents, maintenance and status pages beside them. */
export function UptimeTab({ isVisible, tab }: TabProps) {
  const { t } = useTranslation();
  const docs = useDocsUrl();
  const [view, setView] = useState<View>("monitors");
  const [monitors, setMonitors] = useState<MonitorView[] | null>(null);
  const [permissions, setPermissions] = useState(NO_PERMISSIONS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stamp, setStamp] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMonitors(await listMonitors());
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("tab.error")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void getPermissions()
      .then(setPermissions)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  // Embedded in a host page, only that host's monitors show.
  const forHost = tab.host ? Number(tab.host.id) : undefined;
  const shown =
    forHost === undefined
      ? monitors
      : (monitors?.filter((m) => m.hostId === forHost) ?? null);
  const down = shown?.filter((m) => m.status === "down").length ?? 0;
  const tabs = [
    { id: "monitors", label: t("tab.monitors"), count: down || undefined },
    { id: "incidents", label: t("tab.incidents") },
    { id: "maintenance", label: t("tab.maintenance") },
    ...(permissions.publish && forHost === undefined
      ? [{ id: "pages", label: t("tab.pages") }]
      : []),
  ];

  return (
    <PanelFrame>
      <PanelShell
        icon={<HeartPulse className="size-4" />}
        title={t("tab.title")}
        docs={docs}
        actions={
          <RefreshButton
            onClick={() => {
              void load();
              setStamp((value) => value + 1);
            }}
            loading={loading}
            label={t("common.refresh")}
          />
        }
        tabs={
          <TabStrip
            tabs={tabs}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        {error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {view === "monitors" ? (
          <MonitorsView
            monitors={shown}
            permissions={permissions}
            reload={load}
            presetHostId={
              typeof tab.data?.addForHost === "number"
                ? tab.data.addForHost
                : undefined
            }
            forHostId={forHost}
          />
        ) : null}
        {view === "incidents" ? (
          <IncidentsView
            key={stamp}
            canAck={permissions.manage}
            isVisible={isVisible}
          />
        ) : null}
        {view === "maintenance" ? (
          <MaintenanceView
            key={stamp}
            monitors={shown ?? []}
            canManage={permissions.manage}
          />
        ) : null}
        {view === "pages" ? (
          <StatusPagesView
            key={stamp}
            monitors={monitors ?? []}
            publicPages={permissions.publicPages}
          />
        ) : null}
      </PanelShell>
    </PanelFrame>
  );
}
