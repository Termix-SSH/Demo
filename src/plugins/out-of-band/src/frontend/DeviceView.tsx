import { useCallback, useEffect, useState } from "react";
import { Pencil, ServerCog } from "lucide-react";
import { toast } from "sonner";
import { usePermission, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  DataTable,
  DataTableRow,
  EmptyState,
  InfoGrid,
  PanelShell,
  RefreshButton,
  SelectField,
  StatusBadge,
  StatusDot,
  TabStrip,
  TextField,
  useConfirm,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  BootTarget,
  Device,
  DriverInfo,
  LogEntry,
  MediaSlot,
  PowerAction,
} from "../shared/types";
import { errorMessage, type OobApi } from "./api";
import { formatValue, healthTone, SENSOR_ORDER, statusTone } from "./format";
import { Sol } from "./Sol";

type Section = "overview" | "sensors" | "log" | "boot" | "media" | "console";

const th =
  "px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
const td = "px-3 py-1.5 text-xs";
const iconButton =
  "inline-flex size-7 items-center justify-center border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-40";
const POWER_ACTIONS: PowerAction[] = [
  "on",
  "graceful-shutdown",
  "reset",
  "cycle",
  "off",
];
const HARD: PowerAction[] = ["off", "cycle", "reset"];
const BOOT_TARGETS: BootTarget[] = ["pxe", "disk", "cd", "usb", "bios", "none"];

export function DeviceView({
  device,
  driver,
  api,
  isVisible,
  onBack,
  onEdit,
  onChanged,
}: {
  device: Device;
  driver: DriverInfo | undefined;
  api: OobApi;
  isVisible: boolean;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (device: Device) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canPower = usePermission("power");
  const canMedia = usePermission("media");
  const canConsole = usePermission("console");
  const canManage = usePermission("manage");
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [slots, setSlots] = useState<MediaSlot[] | null>(null);
  const [bootDevice, setBootDevice] = useState<BootTarget>("pxe");
  const [uefi, setUefi] = useState("yes");
  const [url, setUrl] = useState("");

  const features = driver?.features;
  const reading = device.reading;
  const relay = !!device.options.relayHostId;

  const tabs = [
    { id: "overview", label: t("view.overview") },
    ...(features?.sensors
      ? [
          {
            id: "sensors",
            label: t("view.sensors"),
            count: reading?.sensors.length,
          },
        ]
      : []),
    ...(features?.eventLog ? [{ id: "log", label: t("view.log") }] : []),
    ...(features?.boot && canPower
      ? [{ id: "boot", label: t("view.boot") }]
      : []),
    ...(features?.media && canMedia
      ? [{ id: "media", label: t("view.media") }]
      : []),
    ...(features?.console && canConsole
      ? [{ id: "console", label: t("view.console") }]
      : []),
  ];

  const load = useCallback(async () => {
    try {
      if (section === "log") setLog(await api.log(device.id));
      if (section === "media") setSlots(await api.media(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
      if (section === "log") setLog([]);
      if (section === "media") setSlots([]);
    }
  }, [api, device.id, section]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    try {
      onChanged(await api.poll(device.id));
      await load();
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
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function power(action: PowerAction) {
    const ok = await confirm({
      title: t(`power.confirm.${action}`, { name: device.name }),
      confirmLabel: t(`power.action.${action}`),
      destructive: HARD.includes(action),
    });
    if (!ok) return;
    await run(
      () => api.power(device.id, action),
      t("power.sent", { name: device.name }),
    );
  }

  async function clearLog() {
    const ok = await confirm({
      title: t("log.clearConfirm", { name: device.name }),
      confirmLabel: t("log.clear"),
    });
    if (!ok) return;
    await run(() => api.clearLog(device.id), t("log.cleared"));
  }

  const grouped = SENSOR_ORDER.map((kind) => ({
    kind,
    items: (reading?.sensors ?? []).filter((sensor) => sensor.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <PanelShell
      icon={<ServerCog className="size-4" />}
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
      {section === "overview" && (
        <>
          <div className="grid gap-3 border-b border-border p-3 md:grid-cols-2">
            <InfoGrid
              items={[
                { label: t("view.type"), value: t(`drivers.${device.driver}`) },
                { label: t("view.address"), value: device.address, mono: true },
                {
                  label: t("view.power"),
                  value: t(`power.${reading?.power ?? "unknown"}`),
                },
                {
                  label: t("view.health"),
                  value: t(`health.${reading?.health ?? "unknown"}`),
                },
                {
                  label: t("view.manufacturer"),
                  value: reading?.info.manufacturer,
                },
                { label: t("view.model"), value: reading?.info.model },
                {
                  label: t("view.serial"),
                  value: reading?.info.serial,
                  mono: true,
                },
                { label: t("view.bios"), value: reading?.info.biosVersion },
                { label: t("view.bmc"), value: reading?.info.bmcVersion },
              ]}
            />
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("view.status")}
              </span>
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone={statusTone(device.status, reading?.health)} />
                {t(`status.${device.status}`)}
              </span>
              {device.lastError && (
                <span className="text-xs text-destructive">
                  {device.lastError}
                </span>
              )}
              {relay && (
                <span className="text-xs text-muted-foreground">
                  {t("view.viaRelay")}
                </span>
              )}
            </div>
          </div>
          {canPower && (
            <ToolbarBand>
              {POWER_ACTIONS.filter((action) =>
                driver?.powerActions.includes(action),
              ).map((action) => (
                <Button
                  key={action}
                  variant={HARD.includes(action) ? "outline" : "default"}
                  disabled={busy || device.status === "down"}
                  onClick={() => void power(action)}
                >
                  {t(`power.action.${action}`)}
                </Button>
              ))}
            </ToolbarBand>
          )}
        </>
      )}

      {section === "sensors" &&
        (grouped.length === 0 ? (
          <EmptyState icon={ServerCog} title={t("view.noSensors")} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className={th}>{t("view.sensor")}</th>
                <th className={th}>{t("view.reading")}</th>
                <th className={th}>{t("view.state")}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap((group) =>
                group.items.map((sensor) => (
                  <DataTableRow key={sensor.id}>
                    <td className={td}>
                      <span className="font-medium">{sensor.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        {t(`kind.${sensor.kind}`)}
                      </span>
                    </td>
                    <td className={td}>
                      {formatValue(sensor.value, sensor.unit)}
                    </td>
                    <td className={td}>
                      <StatusBadge tone={healthTone(sensor.state)}>
                        {t(`health.${sensor.state}`)}
                      </StatusBadge>
                    </td>
                  </DataTableRow>
                )),
              )}
            </tbody>
          </DataTable>
        ))}

      {section === "log" && (
        <>
          {canManage && (
            <div className="flex justify-end border-b border-border p-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void clearLog()}
              >
                {t("log.clear")}
              </Button>
            </div>
          )}
          {log && log.length === 0 ? (
            <EmptyState icon={ServerCog} title={t("log.empty")} />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th className={th}>{t("log.time")}</th>
                  <th className={th}>{t("log.severity")}</th>
                  <th className={th}>{t("log.message")}</th>
                </tr>
              </thead>
              <tbody>
                {(log ?? []).map((entry) => (
                  <DataTableRow key={entry.id}>
                    <td className={`${td} whitespace-nowrap`}>{entry.at}</td>
                    <td className={td}>
                      <StatusBadge
                        tone={
                          entry.severity === "critical"
                            ? "bad"
                            : entry.severity === "warning"
                              ? "warn"
                              : "idle"
                        }
                      >
                        {t(`log.level.${entry.severity}`)}
                      </StatusBadge>
                    </td>
                    <td className={td}>{entry.message}</td>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {section === "boot" && (
        <div className="flex max-w-md flex-col gap-4 p-3">
          <p className="text-xs text-muted-foreground">{t("boot.hint")}</p>
          <SelectField
            label={t("boot.device")}
            value={bootDevice}
            onChange={(value) => setBootDevice(value as BootTarget)}
            options={BOOT_TARGETS.map((value) => ({
              value,
              label: t(`boot.${value}`),
            }))}
          />
          <SelectField
            label={t("boot.mode")}
            value={uefi}
            onChange={setUefi}
            options={[
              { value: "yes", label: t("boot.uefi") },
              { value: "no", label: t("boot.legacy") },
            ]}
          />
          <div>
            <Button
              disabled={busy}
              onClick={() =>
                void run(
                  () => api.boot(device.id, bootDevice, uefi === "yes"),
                  t("boot.done", { name: device.name }),
                )
              }
            >
              {t("boot.apply")}
            </Button>
          </div>
        </div>
      )}

      {section === "media" && (
        <div className="flex flex-col gap-3 p-3">
          <TextField
            label={t("media.url")}
            value={url}
            onChange={setUrl}
            placeholder="https://example.com/debian.iso"
            mono
          />
          {slots && slots.length === 0 && (
            <EmptyState icon={ServerCog} title={t("media.empty")} />
          )}
          {(slots ?? []).map((slot) => (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-xs"
            >
              <span>
                <span className="font-medium">{slot.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {slot.inserted
                    ? slot.image || t("media.mounted")
                    : t("media.free")}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  disabled={busy || !url.trim()}
                  onClick={() =>
                    void run(
                      () => api.mount(device.id, slot.id, url.trim()),
                      t("media.mountedDone"),
                    )
                  }
                >
                  {t("media.mount")}
                </Button>
                {slot.inserted && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api.eject(device.id, slot.id),
                        t("media.ejected"),
                      )
                    }
                  >
                    {t("media.eject")}
                  </Button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {section === "console" &&
        (relay ? (
          <Sol deviceId={device.id} isVisible={isVisible} />
        ) : (
          <EmptyState icon={ServerCog} title={t("console.needsRelay")} />
        ))}
    </PanelShell>
  );
}
