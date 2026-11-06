import { useCallback, useEffect, useState } from "react";
import { Bell, BrickWall, Timer } from "lucide-react";
import {
  useHosts,
  usePermission,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { HostSummary } from "../shared/types";
import { errorMessage, getSummary } from "./api";

const POLL_MS = 60_000;

/** Dashboard card: the firewall state of every host with Firewall on. */
export function FirewallHostsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<HostSummary[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await getSummary());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
  }, [t]);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!rows) {
    return <LoadingState compact label={t("common.loading")} />;
  }

  const rank = (r: HostSummary) =>
    r.error ? 0 : !r.backend || !r.active ? 1 : 2;
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {sorted.map((row, index) => {
        const host = hosts.find((h) => Number(h.id) === row.hostId);
        const off = !row.error && (!row.backend || !row.active);
        return (
          <ListRow
            key={row.hostId}
            stripe={index}
            tone={row.error ? "destructive" : off ? "warning" : "success"}
            icon={<BrickWall className="size-3.5" />}
            title={host?.name || host?.ip || `#${row.hostId}`}
            meta={
              row.error
                ? row.error
                : row.backend
                  ? t("tab.ruleCount", { count: row.rules })
                  : t("tab.noFirewall")
            }
            badges={
              <>
                {!row.error && row.backend && (
                  <ListBadge tone={row.active ? "success" : "warning"}>
                    {row.backend} {row.active ? t("tab.on") : t("tab.off")}
                  </ListBadge>
                )}
                {row.banned > 0 && (
                  <ListBadge tone="warning">
                    {t("card.banned", { count: row.banned })}
                  </ListBadge>
                )}
                {row.pending && (
                  <ListBadge tone="warning">
                    <Timer />
                    {t("card.pending")}
                  </ListBadge>
                )}
                {row.watched && (
                  <ListBadge tone="muted">
                    <Bell />
                  </ListBadge>
                )}
              </>
            }
            onClick={() => host && tabs.openTab(host, "firewall")}
          />
        );
      })}
    </PanelList>
  );
}
