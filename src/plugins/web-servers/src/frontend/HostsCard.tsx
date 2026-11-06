import { useCallback, useEffect, useState } from "react";
import { Earth, RefreshCw } from "lucide-react";
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
import type { HostSummary } from "../shared/types";
import { SERVER_LABEL, badgeTone, isUp } from "./format";

const POLL_MS = 2 * 60_000;

/** Dashboard card: web servers and their state on every host. */
export function HostsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<HostSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<HostSummary[]>("/summary", {
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

  const down = rows.filter(
    (row) => row.error || row.servers.some((s) => !isUp(s.state)),
  ).length;
  const sorted = [...rows].sort((a, b) => {
    const bad = (r: HostSummary) =>
      r.error || r.servers.some((s) => !isUp(s.state)) ? 0 : 1;
    return bad(a) - bad(b);
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="flex-1 text-xs text-muted-foreground">
          {t("card.summary", { count: rows.length, down })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={loading}
          onClick={() => void load(true)}
          title={t("card.refresh")}
          aria-label={t("card.refresh")}
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
          const bad = !!row.error || row.servers.some((s) => !isUp(s.state));
          return (
            <ListRow
              key={row.hostId}
              stripe={index}
              tone={
                row.error
                  ? "destructive"
                  : row.servers.length === 0
                    ? "muted"
                    : bad
                      ? "warning"
                      : "success"
              }
              icon={<Earth className="size-3.5" />}
              title={host?.name || host?.ip || `#${row.hostId}`}
              badges={row.servers.map((s) => (
                <ListBadge key={s.kind} tone={badgeTone(s.state)}>
                  {SERVER_LABEL[s.kind]}
                </ListBadge>
              ))}
              meta={
                row.error ||
                (row.servers.length === 0
                  ? t("tab.noServer")
                  : t("card.sites", {
                      count: row.servers.reduce((n, s) => n + s.sites, 0),
                    }))
              }
              onClick={() => host && tabs.openTab(host, "web-servers")}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
