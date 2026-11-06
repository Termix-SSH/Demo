import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorCog } from "lucide-react";
import {
  usePluginPanelView,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  EmptyState,
  LoadingState,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
  ViewToggle,
} from "@termix-ssh/plugin-sdk/ui";
import type { HypervisorStatus, Inventory } from "../shared/types";
import {
  errorCode,
  errorMessage,
  getInventory,
  getStatus,
  install,
} from "./api";
import { formatBytes, statusText } from "./format";
import { useWantedVm } from "./focus";
import { JobsView } from "./JobsView";
import { NetworksView } from "./NetworksView";
import { NewVmView } from "./NewVmView";
import { StorageView } from "./StorageView";
import { useAction } from "./useAction";
import { VmDetailView } from "./VmDetailView";
import { VmList } from "./VmList";

type View = "vms" | "storage" | "networks" | "jobs";
const POLL_MS = 10_000;

/** One hypervisor: its VMs, storage, networks and jobs. */
export function VmHostTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const panel = usePluginPanelView("vms");
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<HypervisorStatus | null>(null);
  const known = useRef<HypervisorStatus | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("vms");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useWantedVm(
    hostId,
    useCallback((uuid: string) => {
      setView("vms");
      setSelected(uuid);
    }, []),
  );

  const load = useCallback(
    async (fresh = true) => {
      if (!hostId) return;
      setLoading(true);
      try {
        // The status rarely changes, so a timer tick skips that SSH call.
        const next =
          fresh || !known.current ? await getStatus(hostId) : known.current;
        known.current = next;
        setStatus(next);
        if (next.connected) setInventory(await getInventory(hostId, fresh));
        setFailed("");
      } catch (e) {
        const code = errorCode(e);
        setFailed(
          code === "disabled"
            ? t("tab.disabled")
            : code === "sudo"
              ? t("tab.sudo")
              : errorMessage(e, t("tab.error")),
        );
      } finally {
        setLoading(false);
      }
    },
    [hostId, t],
  );
  const action = useAction(load);

  useEffect(() => {
    if (!isVisible) return;
    void load(false);
    const timer = setInterval(() => void load(false), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <MonitorCog className="size-4" />;
  const shell = (body: React.ReactNode) => (
    <PanelFrame>
      <PanelShell icon={icon} title={title}>
        {body}
      </PanelShell>
    </PanelFrame>
  );

  if (failed && !status) {
    return shell(
      <p className="px-3 py-2 text-xs text-destructive">{failed}</p>,
    );
  }
  if (!status) return shell(<LoadingState label={t("common.loading")} />);

  if (!status.connected) {
    const installNow = async () => {
      const ok = await confirm({
        title: t("setup.installTitle"),
        description: t("setup.installText"),
        confirmLabel: t("setup.install"),
        destructive: false,
      });
      if (ok) await action.run(() => install(hostId), t("setup.installed"));
    };
    return shell(
      <NoticePanel
        icon={MonitorCog}
        title={status.installed ? t("setup.noConnect") : t("setup.missing")}
        tone={status.installed ? "warning" : "default"}
        action={
          !status.installed || !status.serviceActive ? (
            <Button disabled={action.busy} onClick={() => void installNow()}>
              {action.busy ? t("setup.installing") : t("setup.install")}
            </Button>
          ) : undefined
        }
      >
        <p>
          {status.installed
            ? status.error || t("setup.noConnectText")
            : t("setup.missingText")}
        </p>
        {!status.kvm && <p>{t("setup.noKvm")}</p>}
      </NoticePanel>,
    );
  }

  if (selected) {
    return (
      <VmDetailView
        host={host}
        hostId={hostId}
        uuid={selected}
        inventory={inventory}
        isVisible={isVisible}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  }

  const views: Array<{ id: View; label: string }> = [
    { id: "vms", label: t("tab.vms") },
    { id: "storage", label: t("tab.storage") },
    { id: "networks", label: t("tab.networks") },
    { id: "jobs", label: t("tab.jobs") },
  ];
  const vms = inventory?.vms ?? [];
  const line = statusText([
    `libvirt ${status.version}`,
    t("tab.runningCount", {
      running: vms.filter((vm) => vm.state === "running").length,
      total: vms.length,
    }),
    inventory &&
      t("tab.nodeLine", {
        cpus: inventory.node.cpus,
        memory: formatBytes(inventory.node.memoryKib * 1024),
      }),
    !status.kvm && t("tab.noKvm"),
  ]);

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={line}
        actions={
          <>
            <RefreshButton
              onClick={() => void load()}
              loading={loading}
              label={t("tab.refresh")}
            />
            {view === "vms" && (
              <ViewToggle
                view={panel.view}
                onView={panel.setView}
                density={panel.density}
                onDensity={panel.setDensity}
                columns={panel.columns}
                onColumns={panel.setColumns}
              />
            )}
            {view === "vms" && (
              <AddButton
                label={t("vm.new")}
                onClick={() => setCreating(true)}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={views}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        {failed && (
          <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
        )}
        {view === "vms" && (
          <VmList
            hostId={hostId}
            vms={vms}
            onOpen={setSelected}
            onChanged={load}
          />
        )}
        {view === "storage" && (
          <StorageView
            hostId={hostId}
            pools={inventory?.pools ?? []}
            onChanged={load}
            onJobs={() => setView("jobs")}
          />
        )}
        {view === "networks" && (
          <NetworksView hostId={hostId} isVisible={isVisible} />
        )}
        {view === "jobs" && <JobsView hostId={hostId} isVisible={isVisible} />}
        {inventory && (
          <NewVmView
            open={creating}
            onOpenChange={setCreating}
            hostId={hostId}
            status={status}
            pools={inventory.pools}
            onStarted={() => {
              setCreating(false);
              setView("jobs");
            }}
          />
        )}
      </PanelShell>
    </PanelFrame>
  );
}
