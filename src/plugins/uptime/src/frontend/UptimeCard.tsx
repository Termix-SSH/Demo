import { useCallback, useEffect, useState } from "react";
import {
  useTabs,
  useTranslation,
  type DashboardCardEntry,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, LoadingState, StatusDot } from "@termix-ssh/plugin-sdk/ui";
import type { MonitorView } from "../shared/types";
import { errorMessage, listMonitors } from "./api";
import { BeatBar } from "./BeatBar";
import { latencyText, percentText, POLL_MS, rowToneOf, toneOf } from "./format";

export const TAB_ID = "uptime";

function useMonitors(isVisible: boolean) {
  const { t } = useTranslation();
  const [monitors, setMonitors] = useState<MonitorView[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setMonitors(await listMonitors());
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("tab.error")));
    }
  }, [t]);
  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS * 2);
    return () => clearInterval(timer);
  }, [isVisible, load]);
  return { monitors, error };
}

function Row({ monitor, index }: { monitor: MonitorView; index: number }) {
  return (
    <ListRow
      stripe={index}
      tone={rowToneOf(monitor.status)}
      title={monitor.name}
      trailing={
        <span className="text-xs text-muted-foreground">
          {percentText(monitor.uptime.day)}
        </span>
      }
    >
      <BeatBar beats={monitor.beats} count={24} className="min-w-0" />
    </ListRow>
  );
}

const rank = (monitor: MonitorView) =>
  monitor.status === "down" ? 0 : monitor.status === "pending" ? 1 : 2;

/** The dashboard card: a list, what needs a look, or one monitor. */
export function UptimeCard({ isVisible, config }: DashboardCardProps) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const { monitors, error } = useMonitors(isVisible);
  const mode = String(config?.mode ?? "overview");

  if (error) return <p className="p-3 text-xs text-destructive">{error}</p>;
  if (monitors === null) {
    return <LoadingState compact label={t("common.loading")} />;
  }

  if (mode === "monitor") {
    const monitor = monitors.find((item) => item.key === config?.monitor);
    if (!monitor) {
      return (
        <p className="p-3 text-xs text-muted-foreground">{t("card.gone")}</p>
      );
    }
    return (
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot tone={toneOf(monitor.status)} />
          <span className="min-w-0 flex-1 truncate font-medium">
            {monitor.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {latencyText(monitor.latencyMs)}
          </span>
        </div>
        <BeatBar beats={monitor.beats} count={40} className="h-6" />
        <p className="text-xs text-muted-foreground">
          {t("list.uptimeDay", { value: percentText(monitor.uptime.day) })} |{" "}
          {t("card.month", { value: percentText(monitor.uptime.month) })}
        </p>
      </div>
    );
  }

  const list = (
    mode === "attention"
      ? monitors.filter((monitor) => rank(monitor) < 2)
      : [...monitors]
  ).sort((a, b) => rank(a) - rank(b));

  if (list.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t(mode === "attention" ? "card.allGood" : "list.empty")}
      </p>
    );
  }
  return (
    <button
      type="button"
      className="w-full cursor-pointer text-left"
      onClick={() => tabs.openSingletonTab(TAB_ID)}
    >
      {list.map((monitor, index) => (
        <Row key={monitor.id} monitor={monitor} index={index} />
      ))}
    </button>
  );
}

/** What the dashboard's add list offers. */
export async function cardEntries(
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<DashboardCardEntry[]> {
  const monitors = await listMonitors().catch(() => []);
  return [
    {
      key: "overview",
      title: t("card.overview"),
      config: { mode: "overview" },
      defaultSize: { w: 4 },
    },
    {
      key: "attention",
      title: t("card.attention"),
      config: { mode: "attention" },
      defaultSize: { w: 4 },
    },
    ...monitors.map((monitor) => ({
      key: `monitor:${monitor.key}`,
      title: monitor.name,
      group: t("card.monitors"),
      config: { mode: "monitor", monitor: monitor.key },
      defaultSize: { w: 3 },
    })),
  ];
}
