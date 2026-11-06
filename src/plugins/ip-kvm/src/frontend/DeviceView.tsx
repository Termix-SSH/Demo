import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Pencil } from "lucide-react";
import { toast } from "sonner";
import { usePermission, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  EmptyState,
  InfoGrid,
  PanelShell,
  RefreshButton,
  SelectField,
  StatusDot,
  TabStrip,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Device,
  DriverInfo,
  MediaState,
  PowerAction,
} from "../shared/types";
import { errorMessage, type KvmApi } from "./api";
import { statusTone } from "./format";
import { JetScreen } from "./JetScreen";
import { Screen } from "./Screen";

type Section = "screen" | "power" | "media" | "info";

const iconButton =
  "inline-flex size-7 items-center justify-center border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-40";
const POWER_ORDER: PowerAction[] = ["on", "graceful-shutdown", "reset", "off"];
const HARD: PowerAction[] = ["off", "reset"];

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
  api: KvmApi;
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
  const features = driver?.features;
  const hasScreen = !!features && (features.screen || features.browserScreen);
  const showScreen = hasScreen && canConsole;
  const showPower = canPower && (!!features?.power || !!device.options.mac);
  const showMedia = !!features?.media && canMedia;
  const [section, setSection] = useState<Section>(
    showScreen ? "screen" : "info",
  );
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [cdrom, setCdrom] = useState("cd");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const reading = device.reading;

  const tabs = [
    ...(showScreen ? [{ id: "screen", label: t("view.screen") }] : []),
    ...(showPower ? [{ id: "power", label: t("view.power") }] : []),
    ...(showMedia ? [{ id: "media", label: t("view.media") }] : []),
    { id: "info", label: t("view.info") },
  ];

  const load = useCallback(async () => {
    if (section !== "media") return;
    try {
      setMedia(await api.media(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
      setMedia({ images: [], mounted: null, cdrom: true, fromUrl: false });
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

  return (
    <PanelShell
      icon={<MonitorSmartphone className="size-4" />}
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
      {section === "screen" &&
        (device.status === "down" ? (
          <EmptyState
            icon={MonitorSmartphone}
            title={device.lastError ?? t("status.down")}
          />
        ) : features?.browserScreen ? (
          <JetScreen
            deviceId={device.id}
            isVisible={isVisible}
            canPower={canPower}
            api={api}
          />
        ) : (
          <Screen
            deviceId={device.id}
            isVisible={isVisible}
            canPaste={!!features?.paste}
            api={api}
          />
        ))}

      {section === "power" && (
        <div className="flex flex-col gap-3 p-3">
          <p className="text-xs text-muted-foreground">
            {t("power.state", {
              state: t(`power.${reading?.power ?? "unknown"}`),
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {POWER_ORDER.filter((action) =>
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
            {device.options.mac && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => api.wake(device.id), t("power.woke"))
                }
              >
                {t("power.wake")}
              </Button>
            )}
          </div>
        </div>
      )}

      {section === "media" && (
        <div className="flex flex-col gap-3 p-3">
          <p className="text-xs text-muted-foreground">
            {media?.mounted
              ? t("media.mountedNow", { name: media.mounted })
              : t("media.none")}
          </p>
          <SelectField
            label={t("media.as")}
            value={cdrom}
            onChange={setCdrom}
            options={[
              { value: "cd", label: t("media.cd") },
              { value: "usb", label: t("media.usb") },
            ]}
          />
          {media && media.images.length === 0 && (
            <EmptyState icon={MonitorSmartphone} title={t("media.empty")} />
          )}
          {(media?.images ?? []).map((image) => (
            <div
              key={image.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-xs"
            >
              <span className="font-medium">{image.name}</span>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.mount(device.id, image.id, cdrom === "cd"),
                    t("media.mountedDone"),
                  )
                }
              >
                {t("media.mount")}
              </Button>
            </div>
          ))}
          {media?.mounted && (
            <div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => api.eject(device.id), t("media.ejected"))
                }
              >
                {t("media.eject")}
              </Button>
            </div>
          )}
          {media?.fromUrl && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <TextField
                label={t("media.url")}
                value={url}
                onChange={setUrl}
                placeholder="https://example.com/debian.iso"
                mono
              />
              <TextField
                label={t("media.name")}
                value={name}
                onChange={setName}
                placeholder="debian.iso"
                mono
              />
              <div>
                <Button
                  disabled={busy || !url.trim() || !name.trim()}
                  onClick={() =>
                    void run(
                      () => api.fetchImage(device.id, url.trim(), name.trim()),
                      t("media.fetched"),
                    )
                  }
                >
                  {t("media.fetch")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {section === "info" && (
        <div className="grid gap-3 border-b border-border p-3 md:grid-cols-2">
          <InfoGrid
            items={[
              { label: t("view.type"), value: t(`drivers.${device.driver}`) },
              { label: t("view.address"), value: device.address, mono: true },
              { label: t("view.model"), value: reading?.model },
              { label: t("view.version"), value: reading?.version },
              { label: t("view.hostname"), value: reading?.hostname },
              {
                label: t("view.power"),
                value: t(`power.${reading?.power ?? "unknown"}`),
              },
              {
                label: t("view.video"),
                value:
                  reading?.width && reading?.height
                    ? `${reading.width} x ${reading.height}`
                    : reading?.signal === false
                      ? t("view.noSignal")
                      : undefined,
              },
            ]}
          />
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("view.status")}
            </span>
            <span className="flex items-center gap-2 text-xs">
              <StatusDot tone={statusTone(device.status, reading?.power)} />
              {t(`status.${device.status}`)}
            </span>
            {device.lastError && (
              <span className="text-xs text-destructive">
                {device.lastError}
              </span>
            )}
            {driver?.features.browserScreen && (
              <span className="text-xs text-muted-foreground">
                {t("view.jetHint")}
              </span>
            )}
          </div>
        </div>
      )}
    </PanelShell>
  );
}
