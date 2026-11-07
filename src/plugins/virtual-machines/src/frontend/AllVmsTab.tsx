import { useMemo, useState } from "react";
import { MonitorCog } from "lucide-react";
import {
  useHosts,
  useTabs,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  DataTable,
  DataTableRow,
  EmptyState,
  LoadingState,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  StatusBadge,
  PanelSearch,
} from "@termix-ssh/plugin-sdk/ui";
import { formatBytes, stateTone, statusText } from "./format";
import { openVm } from "./focus";
import { useStateLabel } from "./VmList";
import { useSummary } from "./useSummary";

/** Every VM on every host, with a way to jump to any of them. */
export function AllVmsTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const stateLabel = useStateLabel();
  const { rows, failed, load } = useSummary(isVisible, t("tab.error"));
  const [search, setSearch] = useState("");

  const vms = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (rows ?? []).flatMap((summary) =>
      summary.vms
        .filter(
          (vm) =>
            !text ||
            vm.name.toLowerCase().includes(text) ||
            summary.hostName.toLowerCase().includes(text) ||
            vm.ips.some((ip) => ip.includes(text)),
        )
        .map((vm) => ({ vm, summary })),
    );
  }, [rows, search]);

  const broken = (rows ?? []).filter((summary) => summary.error);
  const line =
    rows &&
    statusText([
      t("all.hostCount", { count: rows.length }),
      t("tab.runningCount", {
        running: rows.reduce((n, s) => n + s.running, 0),
        total: rows.reduce((n, s) => n + s.total, 0),
      }),
    ]);

  return (
    <PanelFrame>
      <PanelShell
        icon={<MonitorCog className="size-4" />}
        title={t("all.title")}
        status={line || undefined}
        actions={
          <RefreshButton
            onClick={() => void load(true)}
            label={t("tab.refresh")}
          />
        }
        toolbar={
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder={t("all.search")}
            fill
          />
        }
      >
        {failed && (
          <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
        )}
        {broken.map((summary) => (
          <NoticePanel
            key={summary.hostId}
            tone="warning"
            title={summary.hostName}
          >
            {summary.error}
          </NoticePanel>
        ))}
        {!rows && !failed && <LoadingState label={t("common.loading")} />}
        {rows && !rows.length && (
          <EmptyState title={t("all.noHosts")} hint={t("all.noHostsHint")} />
        )}
        {rows && rows.length > 0 && (
          <DataTable>
            <thead>
              <tr>
                <th>{t("vm.name")}</th>
                <th>{t("all.host")}</th>
                <th>{t("vm.state")}</th>
                <th>{t("vm.size")}</th>
                <th>{t("vm.ip")}</th>
              </tr>
            </thead>
            <tbody>
              {vms.map(({ vm, summary }) => (
                <DataTableRow
                  key={`${summary.hostId}:${vm.uuid}`}
                  onClick={() => {
                    const host = hosts.find(
                      (item) => Number(item.id) === summary.hostId,
                    );
                    if (host) openVm(tabs, host, vm.uuid);
                  }}
                >
                  <td>{vm.name}</td>
                  <td>{summary.hostName}</td>
                  <td>
                    <StatusBadge tone={stateTone(vm.state)}>
                      {stateLabel(vm.state)}
                    </StatusBadge>
                  </td>
                  <td>
                    {statusText([
                      t("vm.cpus", { count: vm.vcpus }),
                      formatBytes(vm.maxMemoryKib * 1024),
                    ])}
                  </td>
                  <td>{vm.ips[0] ?? ""}</td>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        )}
      </PanelShell>
    </PanelFrame>
  );
}
