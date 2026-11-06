import { useCallback, useEffect, useMemo, useState } from "react";
import { networkWidget } from "./HomepageWidget";
import { Network, Pencil, Radar, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type TabProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  PanelShell,
  StatusDot,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Device,
  DeviceInput,
  DiscoveryResult,
  DriverInfo,
} from "../shared/types";
import { createApi, errorMessage } from "./api";
import { DeviceForm } from "./DeviceForm";
import { DeviceView } from "./DeviceView";
import { Discover } from "./Discover";
import { NetworkCard } from "./NetworkCard";
import { formatUptime } from "./format";

const TAB_ID = "network-devices";
const REFRESH_MS = 20_000;

type View =
  | { kind: "list" }
  | { kind: "device"; id: number }
  | {
      kind: "form";
      device: Device | null;
      initial?: {
        address: string;
        driver: DiscoveryResult["driver"];
        name: string;
      };
    }
  | { kind: "discover" };

function NetworkTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canManage = usePermission("manage");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, known] = await Promise.all([api.devices(), api.drivers()]);
      setDevices(list);
      setDrivers(known);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [api]);

  useEffect(() => {
    if (!isVisible) return;
    void reload();
    const timer = setInterval(() => void reload(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [isVisible, reload]);

  function replace(device: Device) {
    setDevices((current) =>
      current.map((item) => (item.id === device.id ? device : item)),
    );
  }

  async function save(device: Device | null, input: DeviceInput) {
    try {
      if (device) await api.update(device.id, input);
      else await api.create(input);
      toast.success(t("saved"));
      setView({ kind: "list" });
      await reload();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function refresh(device: Device) {
    setBusy(device.id);
    try {
      replace(await api.poll(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove(device: Device) {
    const ok = await confirm({
      title: t("deleteConfirm", { name: device.name }),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await api.remove(device.id);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (view.kind === "form") {
    return (
      <DeviceForm
        device={view.device}
        drivers={drivers}
        api={api}
        initial={view.initial}
        onBack={() => setView({ kind: "list" })}
        onSave={(input) => save(view.device, input)}
      />
    );
  }
  if (view.kind === "discover") {
    return (
      <Discover
        api={api}
        onBack={() => setView({ kind: "list" })}
        onAdd={(result) =>
          setView({
            kind: "form",
            device: null,
            initial: {
              address: result.address,
              driver: result.driver,
              name: result.name,
            },
          })
        }
      />
    );
  }
  if (view.kind === "device") {
    const device = devices.find((item) => item.id === view.id);
    if (device) {
      return (
        <DeviceView
          device={device}
          driver={drivers.find((item) => item.id === device.driver)}
          api={api}
          canManage={canManage}
          onBack={() => setView({ kind: "list" })}
          onEdit={() => setView({ kind: "form", device })}
          onChanged={replace}
        />
      );
    }
  }

  const down = devices.filter((device) => device.status === "down").length;

  return (
    <PanelShell
      icon={<Network className="size-4" />}
      title={t("tab.title")}
      status={
        devices.length
          ? t("summary", { count: devices.length, down })
          : undefined
      }
      actions={
        canManage ? (
          <>
            <ListRowAction
              label={t("discover.title")}
              onClick={() => setView({ kind: "discover" })}
            >
              <Radar />
            </ListRowAction>
            <AddButton
              label={t("add")}
              onClick={() => setView({ kind: "form", device: null })}
            />
          </>
        ) : undefined
      }
    >
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {t("description")}
      </p>
      {!loaded && <LoadingState />}
      <PanelList
        empty={loaded ? <EmptyState icon={Network} title={t("empty")} /> : null}
      >
        {devices.map((device, index) => {
          const ports = device.snapshot?.ports ?? [];
          const upPorts = ports.filter((port) => port.up).length;
          return (
            <ListRow
              key={device.id}
              stripe={index}
              tone={device.status === "down" ? "destructive" : "none"}
              icon={
                <StatusDot
                  tone={
                    device.status === "up"
                      ? "ok"
                      : device.status === "down"
                        ? "bad"
                        : "idle"
                  }
                />
              }
              title={device.name}
              badges={<ListBadge>{t(`drivers.${device.driver}`)}</ListBadge>}
              meta={[
                device.address,
                device.status === "down"
                  ? (device.lastError ?? t("status.down"))
                  : null,
                ports.length
                  ? t("ports", { up: upPorts, total: ports.length })
                  : null,
                device.snapshot?.info?.uptimeSec !== undefined
                  ? t("card.uptime", {
                      time: formatUptime(device.snapshot.info.uptimeSec),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => setView({ kind: "device", id: device.id })}
              actions={
                <>
                  <ListRowAction
                    label={t("view.refresh")}
                    disabled={busy === device.id}
                    onClick={() => void refresh(device)}
                  >
                    <RefreshCw />
                  </ListRowAction>
                  {canManage && (
                    <>
                      <ListRowAction
                        label={t("edit")}
                        onClick={() => setView({ kind: "form", device })}
                      >
                        <Pencil />
                      </ListRowAction>
                      <ListRowAction
                        label={t("delete")}
                        tone="destructive"
                        onClick={() => void remove(device)}
                      >
                        <Trash2 />
                      </ListRowAction>
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </PanelList>
    </PanelShell>
  );
}

export function activate(app: TermixApp): void {
  app.registerRailItem({
    id: TAB_ID,
    icon: Network,
    titleKey: "tab.title",
    kind: "tab",
    permission: "view",
  });
  app.registerTab(TAB_ID, NetworkTab, {
    icon: Network,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerExtension("homepage.widgets", networkWidget(app.t));

  app.registerDashboardCard({
    id: "network-devices",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 180,
    frame: "framed",
    component: NetworkCard,
  });
}
