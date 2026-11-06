import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
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
import { rowTone } from "./format";

const POLL_MS = 60_000;
const RANK = { fail: 0, warn: 1, unknown: 2, ok: 3 } as const;

/** Dashboard card: every watched host, worst first. */
export function SecurityHostsCard({ isVisible }: DashboardCardProps) {
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

  const sorted = [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.score ?? 101) - (b.score ?? 101) ||
      a.label.localeCompare(b.label),
  );
  return (
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
            tone={rowTone(row.status)}
            icon={<ShieldCheck className="size-3.5" />}
            title={row.label}
            meta={row.error || t("card.keys", { count: row.keys })}
            badges={
              <>
                <ListBadge tone={rowTone(row.status)}>
                  {row.score === null
                    ? t(`health.${row.status}`)
                    : t("card.score", { score: row.score })}
                </ListBadge>
                {row.kev > 0 && (
                  <ListBadge tone="destructive">
                    {t("card.kev", { count: row.kev })}
                  </ListBadge>
                )}
                {row.critical > 0 && (
                  <ListBadge tone="destructive">
                    {t("card.critical", { count: row.critical })}
                  </ListBadge>
                )}
                {row.findings > 0 && (
                  <ListBadge tone="warning">
                    {t("card.findings", { count: row.findings })}
                  </ListBadge>
                )}
              </>
            }
            onClick={() => host && tabs.openTab(host, "security-center")}
          />
        );
      })}
    </PanelList>
  );
}
