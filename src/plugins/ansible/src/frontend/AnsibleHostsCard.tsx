import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Workflow } from "lucide-react";
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
import type { AnsibleHostSummary } from "../shared/types";

const POLL_MS = 5 * 60_000;

/** Dashboard card: recent Ansible runs on each host with Ansible on. */
export function AnsibleHostsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<AnsibleHostSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<AnsibleHostSummary[]>("/summary", {
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
    (a, b) =>
      Number(!!b.error) - Number(!!a.error) ||
      b.failed - a.failed ||
      b.running - a.running,
  );
  const failed = rows.reduce((sum, row) => sum + row.failed, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="flex-1 text-xs text-muted-foreground">
          {t("card.summary", { count: failed, hosts: rows.length })}
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
                row.error || row.failed > 0
                  ? "destructive"
                  : row.running > 0
                    ? "brand"
                    : "success"
              }
              icon={<Workflow className="size-3.5" />}
              title={host?.name || host?.ip || `#${row.hostId}`}
              badges={
                <>
                  {row.failed > 0 && (
                    <ListBadge tone="warning">
                      {t("card.failed", { count: row.failed })}
                    </ListBadge>
                  )}
                  {row.running > 0 && (
                    <ListBadge>
                      {t("card.running", { count: row.running })}
                    </ListBadge>
                  )}
                </>
              }
              meta={
                row.error ??
                (row.last
                  ? t("card.last", {
                      title: row.last.title,
                      state: t(`runs.state.${row.last.state}`),
                    })
                  : t("card.noRuns"))
              }
              onClick={() => host && tabs.openTab(host, "ansible")}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
