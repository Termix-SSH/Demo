import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Copy,
  MonitorCog,
  Skull,
  Trash2,
} from "lucide-react";
import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InfoGrid,
  LoadingState,
  PanelFrame,
  PanelShell,
  RefreshButton,
  Sparkline,
  StatTile,
  SwitchRow,
  TabStrip,
  TextField,
  TileStack,
  TileWall,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Inventory, VmDetail, VmRow } from "../shared/types";
import {
  cloneVm,
  deleteVm,
  errorMessage,
  getStats,
  getVm,
  power,
  setAutostart,
  setWatch,
} from "./api";
import { formatBytes, percentOf, statusText } from "./format";
import { useAction } from "./useAction";
import { VmConsole } from "./VmConsole";
import { VmHardware } from "./VmHardware";
import { PowerButtons, useStateLabel } from "./VmList";
import { VmSnapshots } from "./VmSnapshots";
import { VmXml } from "./VmXml";

type View = "overview" | "console" | "snapshots" | "hardware" | "xml";
const SAMPLE_MS = 5000;
const SAMPLES = 60;

interface Rates {
  cpu: number[];
  disk: number[];
  net: number[];
}

/** One VM. Rates come from counters read only while this page is open. */
export function VmDetailView({
  host,
  hostId,
  uuid,
  inventory,
  isVisible,
  onBack,
}: {
  host: PluginHostRecord;
  hostId: number;
  uuid: string;
  inventory: Inventory | null;
  isVisible: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const stateLabel = useStateLabel();
  const [detail, setDetail] = useState<VmDetail | null>(null);
  const [failed, setFailed] = useState("");
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState<Rates>({ cpu: [], disk: [], net: [] });
  const [cloning, setCloning] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteDisks, setDeleteDisks] = useState(false);
  const last = useRef<{ at: number; vm: VmRow } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await getVm(hostId, uuid));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    } finally {
      setLoading(false);
    }
  }, [hostId, uuid, t]);
  const action = useAction(load);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const running = detail?.state === "running";
  const cpus = detail?.vcpus ?? 1;
  useEffect(() => {
    if (!isVisible || !running || view !== "overview") return;
    last.current = null;
    const sample = async () => {
      try {
        const vm = await getStats(hostId, uuid);
        const at = Date.now();
        const before = last.current;
        last.current = { at, vm };
        if (!before) return;
        const seconds = (at - before.at) / 1000;
        const total = (row: VmRow, key: "disk" | "net") =>
          key === "disk"
            ? row.disks.reduce((n, d) => n + d.readBytes + d.writeBytes, 0)
            : row.nics.reduce((n, nic) => n + nic.rxBytes + nic.txBytes, 0);
        const push = (list: number[], value: number) =>
          [...list, Math.max(0, value)].slice(-SAMPLES);
        setRates((old) => ({
          cpu: push(
            old.cpu,
            ((vm.cpuTimeNs - before.vm.cpuTimeNs) / 1e9 / seconds / cpus) * 100,
          ),
          disk: push(
            old.disk,
            (total(vm, "disk") - total(before.vm, "disk")) / seconds,
          ),
          net: push(
            old.net,
            (total(vm, "net") - total(before.vm, "net")) / seconds,
          ),
        }));
      } catch {
        // The next sample tries again.
      }
    };
    void sample();
    const timer = setInterval(() => void sample(), SAMPLE_MS);
    return () => clearInterval(timer);
  }, [isVisible, running, view, hostId, uuid, cpus]);

  const icon = <MonitorCog className="size-4" />;
  const back = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onBack}
      title={t("vm.back")}
      aria-label={t("vm.back")}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );

  if (!detail) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} leading={back} title={t("tab.title")}>
          {failed ? (
            <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
          ) : (
            <LoadingState label={t("common.loading")} />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const stopped = detail.state === "shutoff" || detail.state === "crashed";
  const forceStop = async () => {
    const ok = await confirm({
      title: t("power.stopTitle", { name: detail.name }),
      description: t("power.stopText"),
      confirmLabel: t("power.stop"),
    });
    if (ok) await action.run(() => power(hostId, uuid, "stop"));
  };
  const remove = async () => {
    const done = await action.run(
      () => deleteVm(hostId, uuid, deleteDisks),
      t("vm.deleted"),
    );
    if (done) onBack();
  };
  const watch = () =>
    action.run(() => setWatch(hostId, uuid, detail.name, !detail.watched));

  const views: Array<{ id: View; label: string }> = [
    { id: "overview", label: t("vm.overview") },
    { id: "console", label: t("vm.console") },
    { id: "snapshots", label: t("vm.snapshots") },
    { id: "hardware", label: t("vm.hardware") },
    { id: "xml", label: t("vm.xml") },
  ];
  const latest = (list: number[]) => list[list.length - 1] ?? 0;
  const diskSize = detail.disks.reduce((n, d) => n + d.capacity, 0);
  const diskUsed = detail.disks.reduce((n, d) => n + d.allocation, 0);
  const nodeLine = inventory
    ? t("vm.ofHost", {
        memory: formatBytes(inventory.node.memoryKib * 1024),
      })
    : "";

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        leading={back}
        title={detail.name}
        status={statusText([
          stateLabel(detail.state),
          detail.ips[0],
          host.name,
        ])}
        actions={
          <>
            <RefreshButton
              onClick={() => void load()}
              loading={loading}
              label={t("tab.refresh")}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void watch()}
              title={detail.watched ? t("watch.stop") : t("watch.start")}
              aria-label={detail.watched ? t("watch.stop") : t("watch.start")}
            >
              {detail.watched ? (
                <Bell className="size-4 text-accent-brand" />
              ) : (
                <BellOff className="size-4" />
              )}
            </Button>
            <PowerButtons hostId={hostId} vm={detail} onChanged={load} />
            {!stopped && (
              <Button
                variant="ghost"
                size="icon"
                disabled={action.busy}
                onClick={() => void forceStop()}
                title={t("power.stop")}
                aria-label={t("power.stop")}
              >
                <Skull className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={action.busy || !stopped}
              onClick={() => {
                setCloneName(`${detail.name}-copy`);
                setCloning(true);
              }}
              title={stopped ? t("vm.clone") : t("vm.cloneStopped")}
              aria-label={t("vm.clone")}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={action.busy}
              onClick={() => setDeleting(true)}
              title={t("vm.delete")}
              aria-label={t("vm.delete")}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        }
        tabs={
          <TabStrip
            tabs={views}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll={view !== "console" && view !== "xml"}
      >
        {failed && (
          <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
        )}
        {cloning && (
          <div className="flex items-end gap-2 border-b border-border p-3">
            <TextField
              label={t("vm.cloneName")}
              value={cloneName}
              onChange={setCloneName}
              className="flex-1"
            />
            <Button
              disabled={action.busy || !cloneName.trim()}
              onClick={async () => {
                const ok = await action.run(
                  () => cloneVm(hostId, uuid, cloneName.trim()),
                  t("vm.cloneStarted"),
                );
                if (ok) setCloning(false);
              }}
            >
              {t("vm.clone")}
            </Button>
            <Button variant="ghost" onClick={() => setCloning(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        )}
        {deleting && (
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <p className="text-sm">
              {t("vm.deleteTitle", { name: detail.name })}
            </p>
            <SwitchRow
              label={t("vm.deleteDisks")}
              description={t("vm.deleteDisksHint")}
              checked={deleteDisks}
              onChange={setDeleteDisks}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={action.busy}
                onClick={() => void remove()}
              >
                {t("vm.delete")}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        {view === "overview" && (
          <TileStack>
            <TileWall minWidth={280}>
              <StatTile
                label={t("vm.cpu")}
                value={running ? `${Math.round(latest(rates.cpu))}%` : "-"}
                hint={t("vm.cpus", { count: detail.vcpus })}
                percent={running ? latest(rates.cpu) : undefined}
              >
                <Sparkline data={rates.cpu} domain={[0, 100]} height={32} />
              </StatTile>
              <StatTile
                label={t("vm.memory")}
                value={formatBytes(detail.maxMemoryKib * 1024)}
                hint={
                  detail.usedKib === null
                    ? nodeLine
                    : t("vm.memoryUsed", {
                        used: formatBytes(detail.usedKib * 1024),
                      })
                }
                percent={
                  detail.usedKib === null
                    ? undefined
                    : percentOf(detail.usedKib, detail.maxMemoryKib)
                }
              />
              <StatTile
                label={t("vm.diskIo")}
                value={`${formatBytes(latest(rates.disk))}/s`}
                hint={t("vm.diskUsed", {
                  used: formatBytes(diskUsed),
                  size: formatBytes(diskSize),
                })}
              >
                <Sparkline data={rates.disk} height={32} />
              </StatTile>
              <StatTile
                label={t("vm.netIo")}
                value={`${formatBytes(latest(rates.net))}/s`}
                hint={detail.ips.join(", ") || t("vm.noIp")}
              >
                <Sparkline data={rates.net} height={32} />
              </StatTile>
            </TileWall>
            <div className="p-3">
              <InfoGrid
                items={[
                  { label: t("vm.uuid"), value: detail.uuid },
                  { label: t("vm.machine"), value: detail.machine },
                  {
                    label: t("vm.firmware"),
                    value: t(`vm.${detail.firmware}`),
                  },
                  { label: t("vm.cpuMode"), value: detail.cpuMode || "-" },
                  {
                    label: t("vm.guestAgent"),
                    value: detail.guestAgent ? t("vm.yes") : t("vm.no"),
                  },
                ]}
              />
            </div>
            <div className="px-3">
              <SwitchRow
                label={t("vm.autostart")}
                description={t("vm.autostartHint")}
                checked={detail.autostart}
                disabled={action.busy}
                onChange={(on) =>
                  void action.run(() => setAutostart(hostId, uuid, on))
                }
              />
            </div>
          </TileStack>
        )}
        {view === "console" && (
          <VmConsole
            hostId={hostId}
            vm={detail}
            isVisible={isVisible}
            onChanged={load}
          />
        )}
        {view === "snapshots" && (
          <VmSnapshots hostId={hostId} vm={detail} onChanged={load} />
        )}
        {view === "hardware" && (
          <VmHardware
            hostId={hostId}
            vm={detail}
            pools={inventory?.pools ?? []}
            onChanged={load}
          />
        )}
        {view === "xml" && (
          <VmXml hostId={hostId} uuid={uuid} onChanged={load} />
        )}
      </PanelShell>
    </PanelFrame>
  );
}
