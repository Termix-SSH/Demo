import {
  useHosts,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import { useSummary } from "./useSummary";

const TAB_ID = "virtual-machines";

/** Dashboard card: how many VMs run on each hypervisor. */
export function VmHostsCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const { rows, failed, allowed } = useSummary(isVisible, t("tab.error"));

  if (!allowed) return null;
  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!rows) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }
  const rank = (r: (typeof rows)[number]) =>
    r.error || r.crashed ? 0 : r.running ? 1 : 2;
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b));

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("all.noHosts")}</p>
      }
    >
      {sorted.map((row) => (
        <ListRow
          key={row.hostId}
          title={row.hostName}
          meta={
            row.error ||
            t("tab.runningCount", { running: row.running, total: row.total })
          }
          badges={
            row.error ? (
              <ListBadge tone="destructive">{t("card.unreachable")}</ListBadge>
            ) : row.crashed ? (
              <ListBadge tone="destructive">
                {t("card.crashed", { count: row.crashed })}
              </ListBadge>
            ) : undefined
          }
          onClick={() => {
            const host = hosts.find((h) => Number(h.id) === row.hostId);
            if (host) tabs.openTab(host, TAB_ID);
          }}
        />
      ))}
    </PanelList>
  );
}
