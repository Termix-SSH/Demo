import { useCallback, useEffect, useMemo, useState } from "react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList, StatusDot } from "@termix-ssh/plugin-sdk/ui";
import type { Device } from "../shared/types";
import { createApi } from "./api";
import { statusTone } from "./format";

const POLL_MS = 30_000;
const RANK = { critical: 0, warning: 1, unknown: 2, ok: 3 } as const;

function rank(device: Device): number {
  if (device.status === "down") return -1;
  return RANK[device.reading?.health ?? "unknown"];
}

/** Dashboard card: each BMC with its power and health, worst first. */
export function OobCard({ isVisible, shell }: DashboardCardProps) {
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
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }

  const sorted = [...devices].sort((a, b) => rank(a) - rank(b));
  return (
    <PanelList
      empty={
        <button
          type="button"
          onClick={() => shell.openSingletonTab("out-of-band")}
          className="p-3 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          {t("empty")}
        </button>
      }
    >
      {sorted.map((device, index) => (
        <ListRow
          key={device.id}
          stripe={index}
          tone={device.status === "down" ? "destructive" : "none"}
          icon={
            <StatusDot
              tone={statusTone(device.status, device.reading?.health)}
            />
          }
          title={device.name}
          meta={[
            device.status === "down"
              ? (device.lastError ?? t("status.down"))
              : t(`power.${device.reading?.power ?? "unknown"}`),
            device.reading && device.reading.health !== "unknown"
              ? t(`health.${device.reading.health}`)
              : null,
          ]
            .filter(Boolean)
            .join(" | ")}
          onClick={() =>
            shell.openSingletonTab("out-of-band", {
              data: { deviceId: device.id },
            })
          }
        />
      ))}
    </PanelList>
  );
}
