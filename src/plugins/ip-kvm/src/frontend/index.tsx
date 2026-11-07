import { useCallback, useEffect, useMemo, useState } from "react";
import { kvmWidget } from "./HomepageWidget";
import { MonitorSmartphone, Pencil, RefreshCw, Trash2 } from "lucide-react";
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
  StatusBadge,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Device, DeviceInput, DriverInfo } from "../shared/types";
import { createApi, errorMessage, initApi } from "./api";
import { DeviceForm } from "./DeviceForm";
import { DeviceView } from "./DeviceView";
import { statusTone } from "./format";
import { KvmCard } from "./KvmCard";
import { deviceForHost, remember, startWatching, stopWatching } from "./store";

const TAB_ID = "ip-kvm";
const REFRESH_MS = 20_000;

type View =
  | { kind: "list" }
  | { kind: "device"; id: number }
  | { kind: "form"; device: Device | null };

function KvmTab({ isVisible, tab }: TabProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canManage = usePermission("manage");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const first = tab.data?.deviceId;
  const [devices, setDevices] = useState<Device[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [view, setView] = useState<View>(
    typeof first === "number"
      ? { kind: "device", id: first }
      : { kind: "list" },
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [list, known] = await Promise.all([api.devices(), api.drivers()]);
      setDevices(list);
      remember(list);
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

  // Opened again for another BMC (host button, dashboard card)
  useEffect(() => {
    if (typeof first === "number") setView({ kind: "device", id: first });
  }, [first]);

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
        onBack={() => setView({ kind: "list" })}
        onSave={(input) => save(view.device, input)}
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
          isVisible={isVisible}
          onBack={() => setView({ kind: "list" })}
          onEdit={() => setView({ kind: "form", device })}
          onChanged={replace}
        />
      );
    }
  }

  const attention = devices.filter((device) => device.status === "down").length;

  return (
    <PanelShell
      icon={<MonitorSmartphone className="size-4" />}
      title={t("tab.title")}
      status={
        devices.length
          ? t("summary", { count: devices.length, attention })
          : undefined
      }
      actions={
        canManage ? (
          <AddButton
            label={t("add")}
            onClick={() => setView({ kind: "form", device: null })}
          />
        ) : undefined
      }
    >
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {t("description")}
      </p>
      {!loaded && <LoadingState />}
      <PanelList
        empty={
          loaded ? (
            <EmptyState icon={MonitorSmartphone} title={t("empty")} />
          ) : null
        }
      >
        {devices.map((device, index) => (
          <ListRow
            key={device.id}
            stripe={index}
            tone={ROW_TONE[statusTone(device.status, device.reading?.power)]}
            title={device.name}
            badges={
              <>
                <StatusBadge
                  tone={statusTone(device.status, device.reading?.power)}
                >
                  {t(`status.${device.status}`)}
                </StatusBadge>
                <ListBadge>{t(`drivers.${device.driver}`)}</ListBadge>
              </>
            }
            meta={[
              device.address,
              device.status === "down"
                ? (device.lastError ?? t("status.down"))
                : t(`power.${device.reading?.power ?? "unknown"}`),
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
        ))}
      </PanelList>
    </PanelShell>
  );
}

const ROW_TONE = {
  ok: "brand",
  warn: "warning",
  bad: "destructive",
  idle: "muted",
} as const;

export function activate(app: TermixApp): void {
  initApi(app.api);
  startWatching();

  app.registerRailItem({
    id: TAB_ID,
    icon: MonitorSmartphone,
    titleKey: "tab.title",
    kind: "tab",
    permission: "view",
  });
  app.registerTab(TAB_ID, KvmTab, {
    icon: MonitorSmartphone,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerExtension("homepage.widgets", kvmWidget(app.t));

  app.registerDashboardCard({
    id: "ip-kvm",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 180,
    frame: "framed",
    component: KvmCard,
  });
  // The list fills in shortly after start, so the button appears a moment later
  app.registerHostAction({
    id: "ip-kvm",
    titleKey: "host.open",
    icon: MonitorSmartphone,
    kind: "open",
    order: 55,
    when: (host) => !!deviceForHost(Number(host.id)),
    run: (host, shell) => {
      const device = deviceForHost(Number(host.id));
      if (device) {
        shell.openSingletonTab(TAB_ID, { data: { deviceId: device.id } });
      }
    },
  });
}

export function deactivate(): void {
  stopWatching();
}
