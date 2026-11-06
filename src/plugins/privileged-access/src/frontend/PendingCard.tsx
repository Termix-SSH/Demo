import { useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  Facts,
  ListRow,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import { createAccessApi, type Summary } from "./api";
import { formatTime } from "./AccessTab";

/** Requests waiting on you, and your own open access. */
export function PendingCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const pluginApi = usePluginApi();
  const api = useMemo(() => createAccessApi(pluginApi), [pluginApi]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    const load = () =>
      void api
        .summary()
        .then((value) => {
          if (!cancelled) setSummary(value);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, isVisible]);

  const open = () => shell.openSingletonTab("access");
  const rows = [
    ...(summary?.latest ?? []).map((row) => ({
      id: `p${row.id}`,
      title: row.hostName ?? `#${row.hostId}`,
      meta: [
        row.username ?? row.userId,
        t("list.hours", { count: row.hours }),
        t("card.waiting"),
      ],
    })),
    ...(summary?.active ?? []).map((row) => ({
      id: `a${row.id}`,
      title: row.hostName ?? `#${row.hostId}`,
      meta: [t("list.until", { time: formatTime(row.expiresAt) })],
    })),
  ];

  return (
    <PanelList
      empty={
        <EmptyState
          icon={KeyRound}
          title={t("card.empty")}
          hint={summary?.approver ? undefined : t("card.emptyHint")}
        />
      }
    >
      {rows.map((row, index) => (
        <ListRow
          key={row.id}
          stripe={index}
          tone="muted"
          icon={<KeyRound />}
          title={row.title}
          onClick={open}
          meta={
            <Facts>
              {row.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </Facts>
          }
        />
      ))}
    </PanelList>
  );
}
