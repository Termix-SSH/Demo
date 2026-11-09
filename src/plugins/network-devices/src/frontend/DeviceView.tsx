import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  Network,
  Pencil,
  Power,
  RotateCw,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  DataTable,
  DataTableRow,
  EmptyState,
  InfoGrid,
  LoadingState,
  PanelShell,
  RefreshButton,
  Sparkline,
  StatusBadge,
  StatusDot,
  TabStrip,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  ClientInfo,
  Device,
  DriverInfo,
  NeighborInfo,
  PortInfo,
} from "../shared/types";
import { errorMessage, type NetworkApi } from "./api";
import { formatRate, formatSpeed, formatUptime } from "./format";

type Section = "ports" | "clients" | "neighbors";

const th =
  "px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
const td = "px-3 py-1.5 text-xs";
const iconButton =
  "inline-flex size-7 items-center justify-center border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-40";

export function DeviceView({
  device,
  driver,
  api,
  canManage,
  onBack,
  onEdit,
  onChanged,
}: {
  device: Device;
  driver: DriverInfo | undefined;
  api: NetworkApi;
  canManage: boolean;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (device: Device) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>("ports");
  const [busy, setBusy] = useState(false);
  const [clients, setClients] = useState<ClientInfo[] | null>(null);
  const [neighbors, setNeighbors] = useState<NeighborInfo[] | null>(null);
  const [filter, setFilter] = useState("");

  const features = driver?.features;
  const info = device.snapshot?.info;
  const ports = device.snapshot?.ports ?? [];
  const watched = useMemo(
    () => new Set(device.options.watchedPorts ?? []),
    [device.options.watchedPorts],
  );

  const tabs = [
    { id: "ports", label: t("view.ports"), count: ports.length },
    ...(features?.clients ? [{ id: "clients", label: t("view.clients") }] : []),
    ...(features?.neighbors
      ? [{ id: "neighbors", label: t("view.neighbors") }]
      : []),
  ];

  const loadSection = useCallback(async () => {
    try {
      if (section === "clients") setClients(await api.clients(device.id));
      if (section === "neighbors") setNeighbors(await api.neighbors(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
      if (section === "clients") setClients([]);
      if (section === "neighbors") setNeighbors([]);
    }
  }, [api, device.id, section]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  async function refresh() {
    setBusy(true);
    try {
      onChanged(await api.poll(device.id));
      if (section !== "ports") await loadSection();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onChanged(await api.poll(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePort(port: PortInfo) {
    const turnOff = port.adminUp;
    if (turnOff) {
      const ok = await confirm({
        title: t("view.portOffConfirm", { name: port.name }),
        confirmLabel: t("view.turnOff"),
      });
      if (!ok) return;
    }
    await run(
      () => api.setPort(device.id, port.id, !turnOff),
      t(turnOff ? "view.portOff" : "view.portOn", { name: port.name }),
    );
  }

  async function cyclePoe(port: PortInfo) {
    const ok = await confirm({
      title: t("view.poeConfirm", { name: port.name }),
      confirmLabel: t("view.poeCycle"),
    });
    if (!ok) return;
    await run(
      () => api.poeCycle(device.id, port.id),
      t("view.poeDone", { name: port.name }),
    );
  }

  async function reboot() {
    const ok = await confirm({
      title: t("view.rebootConfirm", { name: device.name }),
      confirmLabel: t("view.reboot"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.reboot(device.id);
      toast.success(t("view.rebooting", { name: device.name }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWatch(port: PortInfo) {
    const next = new Set(watched);
    if (next.has(port.id)) next.delete(port.id);
    else next.add(port.id);
    try {
      await api.update(device.id, {
        name: device.name,
        address: device.address,
        options: { ...device.options, watchedPorts: [...next] },
      });
      onChanged(await api.poll(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!clients) return [];
    return clients.filter(
      (client) =>
        !needle ||
        [client.mac, client.ip, client.name, client.port]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [clients, filter]);

  const traffic = device.traffic.map((point) => point.rxBps + point.txBps);

  return (
    <PanelShell
      icon={<Network className="size-4" />}
      title={device.name}
      status={t(`status.${device.status}`)}
      leading={<BackButton onClick={onBack} label={t("back")} />}
      actions={
        <>
          <RefreshButton
            onClick={() => void refresh()}
            loading={busy}
            label={t("view.refresh")}
          />
          {canManage && features?.reboot && (
            <button
              type="button"
              className={iconButton}
              title={t("view.reboot")}
              disabled={busy}
              onClick={() => void reboot()}
            >
              <RotateCw className="size-4" />
            </button>
          )}
          {canManage && (
            <button
              type="button"
              className={iconButton}
              title={t("edit")}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </button>
          )}
        </>
      }
      tabs={
        <TabStrip
          tabs={tabs}
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
        />
      }
    >
      <div className="grid gap-3 border-b border-border p-3 md:grid-cols-2">
        <InfoGrid
          items={[
            { label: t("view.type"), value: t(`drivers.${device.driver}`) },
            { label: t("view.address"), value: device.address, mono: true },
            { label: t("view.model"), value: info?.model },
            { label: t("view.version"), value: info?.version },
            {
              label: t("view.uptime"),
              value:
                info?.uptimeSec !== undefined
                  ? formatUptime(info.uptimeSec)
                  : undefined,
            },
            {
              label: t("view.cpu"),
              value: info?.cpu !== undefined ? `${info.cpu}%` : undefined,
            },
            {
              label: t("view.memory"),
              value: info?.memory !== undefined ? `${info.memory}%` : undefined,
            },
          ]}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("view.traffic")}
          </span>
          {traffic.length > 1 ? (
            <Sparkline data={traffic} className="h-16 w-full" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("view.noTraffic")}
            </span>
          )}
          {device.lastError && (
            <span className="text-xs text-destructive">{device.lastError}</span>
          )}
        </div>
      </div>

      {section === "ports" &&
        (ports.length === 0 ? (
          <EmptyState icon={Network} title={t("view.noPorts")} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className={th}>{t("view.port")}</th>
                <th className={th}>{t("view.speed")}</th>
                <th className={th}>{t("view.vlan")}</th>
                <th className={th}>{t("view.rx")}</th>
                <th className={th}>{t("view.tx")}</th>
                <th className={th}>{t("view.errors")}</th>
                <th className={th}>{t("view.poe")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {ports.map((port) => (
                <DataTableRow key={port.id}>
                  <td className={td}>
                    <span className="flex items-center gap-2">
                      <StatusDot
                        tone={port.up ? "ok" : port.adminUp ? "idle" : "warn"}
                        title={t(
                          port.up
                            ? "view.linkUp"
                            : port.adminUp
                              ? "view.linkDown"
                              : "view.disabled",
                        )}
                      />
                      <span>
                        <span className="font-medium">{port.name}</span>
                        {port.description && (
                          <span className="ml-2 text-muted-foreground">
                            {port.description}
                          </span>
                        )}
                      </span>
                      {!port.adminUp && (
                        <StatusBadge tone="warn">
                          {t("view.disabled")}
                        </StatusBadge>
                      )}
                    </span>
                  </td>
                  <td className={td}>
                    {port.up ? formatSpeed(port.speedMbps) : "-"}
                  </td>
                  <td className={td}>{port.vlan ?? "-"}</td>
                  <td className={td}>{formatRate(port.rxBps)}</td>
                  <td className={td}>{formatRate(port.txBps)}</td>
                  <td className={td}>
                    {(port.rxErrors ?? 0) + (port.txErrors ?? 0) || "-"}
                  </td>
                  <td className={td}>
                    {port.poe
                      ? t(
                          port.poe.delivering
                            ? "view.poeOn"
                            : port.poe.enabled
                              ? "view.poeIdle"
                              : "view.poeOff",
                        )
                      : "-"}
                  </td>
                  <td className={`${td} text-right`}>
                    {canManage && (
                      <span className="inline-flex">
                        <button
                          type="button"
                          className={iconButton}
                          title={t(
                            watched.has(port.id)
                              ? "view.unwatch"
                              : "view.watch",
                          )}
                          onClick={() => void toggleWatch(port)}
                        >
                          {watched.has(port.id) ? (
                            <Bell className="size-3.5 text-primary" />
                          ) : (
                            <BellOff className="size-3.5" />
                          )}
                        </button>
                        {features?.portControl && (
                          <button
                            type="button"
                            className={iconButton}
                            title={t(
                              port.adminUp ? "view.turnOff" : "view.turnOn",
                            )}
                            disabled={busy}
                            onClick={() => void togglePort(port)}
                          >
                            <Power className="size-3.5" />
                          </button>
                        )}
                        {features?.poe && port.poe && (
                          <button
                            type="button"
                            className={iconButton}
                            title={t("view.poeCycle")}
                            disabled={busy}
                            onClick={() => void cyclePoe(port)}
                          >
                            <Zap className="size-3.5" />
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        ))}

      {section === "clients" &&
        (clients === null ? (
          <LoadingState />
        ) : (
          <>
            <div className="border-b border-border px-3 py-2">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t("view.filter")}
                className="w-full border border-border bg-popover px-2 py-1 text-xs"
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={Network} title={t("view.noClients")} />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th className={th}>{t("view.client")}</th>
                    <th className={th}>{t("view.ip")}</th>
                    <th className={th}>{t("view.mac")}</th>
                    <th className={th}>{t("view.on")}</th>
                    <th className={th}>{t("view.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((client) => (
                    <DataTableRow key={client.mac}>
                      <td className={td}>{client.name ?? "-"}</td>
                      <td className={`${td} font-mono`}>{client.ip ?? "-"}</td>
                      <td className={`${td} font-mono`}>{client.mac}</td>
                      <td className={td}>
                        {[
                          client.port,
                          client.vlan ? `VLAN ${client.vlan}` : null,
                          client.signal !== undefined
                            ? `${client.signal} dBm`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" | ") || "-"}
                      </td>
                      <td className={td}>{t(`view.kind.${client.kind}`)}</td>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </>
        ))}

      {section === "neighbors" &&
        (neighbors === null ? (
          <LoadingState />
        ) : neighbors.length === 0 ? (
          <EmptyState icon={Network} title={t("view.noNeighbors")} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className={th}>{t("view.port")}</th>
                <th className={th}>{t("view.neighbor")}</th>
                <th className={th}>{t("view.remotePort")}</th>
                <th className={th}>{t("view.mac")}</th>
              </tr>
            </thead>
            <tbody>
              {neighbors.map((neighbor, index) => (
                <DataTableRow key={`${neighbor.localPort}-${index}`}>
                  <td className={td}>{neighbor.localPort}</td>
                  <td className={td}>
                    {neighbor.remoteName ?? neighbor.remoteAddress ?? "-"}
                  </td>
                  <td className={td}>{neighbor.remotePort ?? "-"}</td>
                  <td className={`${td} font-mono`}>
                    {neighbor.remoteMac ?? "-"}
                  </td>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        ))}
    </PanelShell>
  );
}
