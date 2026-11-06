import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { Summary } from "../shared/types";
import { createApi } from "./api";
import { formatBytes } from "./format";

const POLL_MS = 5 * 60_000;

/** Dashboard card: stored size and buckets close to their limit. */
export function StorageCard({ isVisible, shell }: DashboardCardProps) {
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
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }
  const open = () => shell.openSingletonTab("object-storage");

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
      {summary.overQuota.map((item, index) => (
        <ListRow
          key={`${item.account}/${item.bucket}`}
          stripe={index}
          tone={item.percent >= 100 ? "destructive" : "none"}
          icon={<Package className="size-3.5" />}
          title={item.bucket}
          meta={t("card.percent", { percent: item.percent })}
          onClick={open}
        />
      ))}
      {summary.accounts > 0 && (
        <ListRow
          stripe={summary.overQuota.length}
          icon={<Package className="size-3.5" />}
          title={t("card.total", {
            size: formatBytes(summary.bytes),
            count: summary.buckets,
          })}
          meta={
            summary.failingAccounts
              ? t("card.failing", { count: summary.failingAccounts })
              : t("card.logins", { count: summary.accounts })
          }
          onClick={open}
        />
      )}
    </PanelList>
  );
}
