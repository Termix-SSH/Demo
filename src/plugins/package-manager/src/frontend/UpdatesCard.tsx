import { useCallback, useEffect, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
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
} from "@termix-ssh/plugin-sdk/ui";
import type { HostUpdateSummary } from "../shared/types";

const POLL_MS = 10 * 60_000;

/** Dashboard card: pending updates on each host with Packages on. */
export function UpdatesCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<HostUpdateSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<HostUpdateSummary[]>("/summary", {
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
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }

  const sorted = [...rows].sort(
    (a, b) => b.security - a.security || b.updates - a.updates,
  );
  const total = rows.reduce((sum, row) => sum + row.updates, 0);

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
          return (
            <ListRow
              key={row.hostId}
              stripe={index}
              tone={
                row.error
                  ? "destructive"
                  : row.security > 0
                    ? "warning"
                    : row.updates > 0
                      ? "brand"
                      : "success"
              }
              icon={<Package className="size-3.5" />}
              title={host?.name || host?.ip || `#${row.hostId}`}
              badges={
                <>
                  {row.security > 0 && (
                    <ListBadge tone="warning">
                      {t("card.security", { count: row.security })}
                    </ListBadge>
                  )}
                  {row.reboot && (
                    <ListBadge tone="warning">{t("card.reboot")}</ListBadge>
                  )}
                </>
              }
              meta={
                row.error ??
                (row.updates > 0
                  ? t("card.updates", { count: row.updates })
                  : t("card.upToDate"))
              }
              onClick={() => host && tabs.openTab(host, "package-manager")}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
