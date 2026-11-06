import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import { createApi, type Summary } from "./api";

const POLL_MS = 5 * 60_000;

/** Dashboard card: domains close to expiry and anything failing. */
export function DnsCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const canView = usePermission("view");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!isVisible || !canView) return;
    const load = () =>
      api
        .summary()
        .then(setSummary)
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, canView, api]);

  if (!canView) return null;
  if (!summary) {
    return <LoadingState compact label={t("card.loading")} />;
  }
  const open = () => shell.openSingletonTab("dns");

  return (
    <PanelList
      empty={
        <button
          type="button"
          onClick={open}
          className="p-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {t("card.empty")}
        </button>
      }
    >
      {summary.expiring.map((domain, index) => (
        <ListRow
          key={domain.name}
          stripe={index}
          tone={domain.daysLeft <= 14 ? "destructive" : "none"}
          icon={<Globe className="size-3.5" />}
          title={domain.name}
          meta={
            domain.daysLeft < 0
              ? t("domains.expired")
              : t("domains.days", { count: domain.daysLeft })
          }
          onClick={open}
        />
      ))}
      {summary.failingLinks > 0 && (
        <ListRow
          stripe={summary.expiring.length}
          tone="destructive"
          icon={<Globe className="size-3.5" />}
          title={t("card.failingLinks", { count: summary.failingLinks })}
          onClick={open}
        />
      )}
      {summary.expiring.length === 0 && summary.failingLinks === 0 && (
        <ListRow
          icon={<Globe className="size-3.5" />}
          title={t("card.ok", { domains: summary.domains })}
          meta={t("card.accounts", { count: summary.accounts })}
          onClick={open}
        />
      )}
    </PanelList>
  );
}
