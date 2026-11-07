import { useCallback, useEffect, useMemo, useState } from "react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import type { Device } from "../shared/types";
import { createApi } from "./api";
import { formatUptime } from "./format";

const POLL_MS = 30_000;

/** Dashboard card: each device with its state. */
const ROW_TONE = {
  ok: "brand",
  warn: "warning",
  bad: "destructive",
  idle: "muted",
} as const;

export function NetworkCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const canView = usePermission("view");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await api.devices());
    } catch {
      setDevices([]);
    }
  }, [api]);

  useEffect(() => {
    if (!isVisible || !canView) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, canView, load]);

  if (!canView) return null;
  if (!devices) {
    return <LoadingState compact label={t("card.loading")} />;
  }

  return (
    <PanelList
      empty={
        <button
          type="button"
          onClick={() => shell.openSingletonTab("network-devices")}
          className="p-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {t("empty")}
        </button>
      }
    >
      {devices.map((device, index) => (
        <ListRow
          key={device.id}
          stripe={index}
          tone={
            ROW_TONE[
              device.status === "up"
                ? "ok"
                : device.status === "down"
                  ? "bad"
                  : "idle"
            ]
          }
          title={device.name}
          meta={[
            device.address,
            device.status === "down"
              ? (device.lastError ?? t("status.down"))
              : device.snapshot?.info?.uptimeSec !== undefined
                ? t("card.uptime", {
                    time: formatUptime(device.snapshot.info.uptimeSec),
                  })
                : null,
          ]
            .filter(Boolean)
            .join(" | ")}
          onClick={() => shell.openSingletonTab("network-devices")}
        />
      ))}
    </PanelList>
  );
}
