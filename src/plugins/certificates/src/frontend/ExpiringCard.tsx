import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
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
import type { HostCertSummary } from "../shared/types";
import { ExpiryBadge, expiryTone } from "./expiry";

const POLL_MS = 10 * 60_000;
const WARN_DAYS = 14;
const SHOWN = 30;

/** Dashboard card: the certificates that expire next across hosts. */
export function ExpiringCard({
  isVisible,
}: Pick<DashboardCardProps, "isVisible">) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<HostCertSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<HostCertSummary[]>("/summary", {
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

  const certs = rows
    .flatMap((row) =>
      row.certs.map((cert) => ({ ...cert, hostId: row.hostId })),
    )
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const failed = rows.filter((row) => row.error);
  const expiring = certs.filter(
    (cert) => cert.daysLeft !== null && cert.daysLeft <= WARN_DAYS,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="flex-1 text-xs text-muted-foreground">
          {t("card.summary", { count: certs.length, expiring })}
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
        {failed.map((row, index) => {
          const host = hosts.find((h) => Number(h.id) === row.hostId);
          return (
            <ListRow
              key={`failed-${row.hostId}`}
              stripe={index}
              tone="destructive"
              icon={<ShieldCheck className="size-3.5" />}
              title={host?.name || host?.ip || `#${row.hostId}`}
              meta={row.error}
            />
          );
        })}
        {certs.slice(0, SHOWN).map((cert, index) => {
          const host = hosts.find((h) => Number(h.id) === cert.hostId);
          return (
            <ListRow
              key={`${cert.hostId}-${cert.client}-${cert.name}`}
              stripe={failed.length + index}
              tone={expiryTone(cert.daysLeft, WARN_DAYS)}
              icon={<ShieldCheck className="size-3.5" />}
              title={<span className="font-mono">{cert.name}</span>}
              badges={
                <>
                  <ExpiryBadge daysLeft={cert.daysLeft} warnDays={WARN_DAYS} />
                  <ListBadge>{cert.client}</ListBadge>
                </>
              }
              meta={host?.name || host?.ip || `#${cert.hostId}`}
              onClick={() => host && tabs.openTab(host, "certificates")}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
