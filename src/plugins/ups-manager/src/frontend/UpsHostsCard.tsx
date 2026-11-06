import { useCallback, useEffect, useState } from "react";
import { BatteryCharging } from "lucide-react";
import {
  useHosts,
  usePermission,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { HostSummary } from "../shared/types";
import { errorMessage, getSummary } from "./api";
import { formatRuntime } from "./format";

const POLL_MS = 60_000;

function rank(row: HostSummary): number {
  if (row.error || row.flags.includes("low-battery")) return 0;
  if (row.state === "battery" || row.flags.length) return 1;
  return 2;
}

/** Dashboard card: every UPS on your hosts, worst first. */
export function UpsHostsCard({ isVisible }: DashboardCardProps) {
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
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }

  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {sorted.map((row, index) => {
        const host = hosts.find((h) => Number(h.id) === row.hostId);
        const level = rank(row);
        return (
          <ListRow
            key={row.sourceId}
            stripe={index}
            tone={
              level === 0 ? "destructive" : level === 1 ? "warning" : "success"
            }
            icon={<BatteryCharging className="size-3.5" />}
            title={row.label}
            meta={[
              host?.name || host?.ip || `#${row.hostId}`,
              row.error
                ? row.error
                : row.runtimeSec !== null
                  ? t("card.runtime", { time: formatRuntime(row.runtimeSec) })
                  : "",
            ]
              .filter(Boolean)
              .join(" | ")}
            badges={
              <>
                <ListBadge
                  tone={
                    level === 0
                      ? "destructive"
                      : level === 1
                        ? "warning"
                        : "success"
                  }
                >
                  {t(`state.${row.state}`)}
                </ListBadge>
                {row.chargePct !== null && (
                  <ListBadge tone="muted">
                    {Math.round(row.chargePct)}%
                  </ListBadge>
                )}
                {row.loadPct !== null && (
                  <ListBadge tone="muted">
                    {t("card.load", { value: Math.round(row.loadPct) })}
                  </ListBadge>
                )}
              </>
            }
            onClick={() => host && tabs.openTab(host, "ups-manager")}
          />
        );
      })}
    </PanelList>
  );
}
