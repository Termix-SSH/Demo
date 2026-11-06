import { useCallback, useEffect, useState } from "react";
import { Network, RefreshCw } from "lucide-react";
import {
  useHosts,
  usePermission,
  usePluginApi,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { WireguardHostSummary } from "../shared/types";

const POLL_MS = 5 * 60_000;

/** Dashboard card: interfaces up and down and clients on each host with WireGuard on. */
export function WireguardHostsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<WireguardHostSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<WireguardHostSummary[]>("/summary", {
          params: refresh ? { refresh: "1" } : undefined,
        });
        setRows(data);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  if (!rows) {
    return <LoadingState compact label={t("card.loading")} />;
  }

  const sorted = [...rows].sort(
    (a, b) => Number(!!b.error) - Number(!!a.error) || b.down - a.down,
  );
  const total = rows.reduce((sum, row) => sum + row.clients, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="flex-1 text-xs text-muted-foreground">
          {t("card.summary", { count: total, hosts: rows.length })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={loading}
          onClick={() => void load(true)}
          title={t("card.refresh")}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
        }
      >
        {sorted.map((row, index) => {
          const host = hosts.find((h) => Number(h.id) === row.hostId);
          const stopped = row.down > 0;
          return (
            <ListRow
              key={row.hostId}
              stripe={index}
              tone={
                row.error
                  ? "destructive"
                  : stopped
                    ? "warning"
                    : row.installed
                      ? "success"
                      : "brand"
              }
              icon={<Network className="size-3.5" />}
              title={host?.name || host?.ip || `#${row.hostId}`}
              badges={
                <>
                  {stopped && (
                    <ListBadge tone="warning">
                      {t("card.down", { count: row.down })}
                    </ListBadge>
                  )}
                  {!row.installed && !row.error && (
                    <ListBadge>{t("card.missing")}</ListBadge>
                  )}
                </>
              }
              meta={
                row.error ??
                t("card.interfaces", { count: row.total, clients: row.clients })
              }
              onClick={() => host && tabs.openTab(host, "wireguard")}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
