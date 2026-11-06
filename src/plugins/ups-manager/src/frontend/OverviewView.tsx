import {
  Activity,
  BatteryCharging,
  Gauge,
  Thermometer,
  Timer,
  Zap,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  AlertDescription,
  InfoGrid,
  StatTile,
  TileWall,
} from "@termix-ssh/plugin-sdk/ui";
import type { SourceView } from "../shared/types";
import {
  flagKey,
  formatNumber,
  formatRuntime,
  stateKey,
  timeAgo,
  toneOf,
} from "./format";

/** The live numbers for one UPS. */
export function OverviewView({ source }: { source: SourceView }) {
  const { t } = useTranslation();
  const r = source.reading;

  if (!r) {
    return (
      <div className="p-3">
        <Alert variant={source.error ? "destructive" : "default"}>
          <AlertDescription>
            {source.error || t("overview.noData")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const tone = toneOf(r);
  const chargeTone =
    r.chargePct === null
      ? "default"
      : r.chargePct <= source.lowCharge
        ? "bad"
        : r.chargePct <= 60
          ? "warn"
          : "ok";
  const loadTone =
    r.loadPct === null
      ? "default"
      : r.loadPct >= 90
        ? "bad"
        : r.loadPct >= 75
          ? "warn"
          : "default";

  return (
    <div className="flex flex-col">
      {source.error && (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">
          {t("overview.stale", { error: source.error })}
        </div>
      )}
      <TileWall minWidth={180}>
        <StatTile
          label={t("overview.power")}
          icon={<Zap className="size-3.5" />}
          value={t(stateKey(r.state))}
          tone={tone}
          hint={
            r.flags.length
              ? r.flags.map((flag) => t(flagKey(flag))).join(" | ")
              : undefined
          }
        />
        <StatTile
          label={t("overview.charge")}
          icon={<BatteryCharging className="size-3.5" />}
          value={formatNumber(r.chargePct)}
          unit="%"
          percent={r.chargePct}
          tone={chargeTone}
        />
        <StatTile
          label={t("overview.runtime")}
          icon={<Timer className="size-3.5" />}
          value={formatRuntime(r.runtimeSec)}
          tone={
            r.state === "battery" &&
            r.runtimeSec !== null &&
            r.runtimeSec <= source.lowRuntimeMin * 60
              ? "bad"
              : "default"
          }
        />
        <StatTile
          label={t("overview.load")}
          icon={<Gauge className="size-3.5" />}
          value={formatNumber(r.loadPct)}
          unit="%"
          percent={r.loadPct}
          tone={loadTone}
          hint={
            r.nominalW
              ? t("overview.nominal", { watts: r.nominalW })
              : undefined
          }
        />
        <StatTile
          label={t("overview.input")}
          icon={<Activity className="size-3.5" />}
          value={formatNumber(r.inputV, 1)}
          unit="V"
        />
        <StatTile
          label={t("overview.output")}
          icon={<Activity className="size-3.5" />}
          value={formatNumber(r.outputV, 1)}
          unit="V"
        />
        <StatTile
          label={t("overview.batteryVolts")}
          icon={<BatteryCharging className="size-3.5" />}
          value={formatNumber(r.batteryV, 1)}
          unit="V"
        />
        <StatTile
          label={t("overview.temp")}
          icon={<Thermometer className="size-3.5" />}
          value={formatNumber(r.tempC, 1)}
          unit="C"
        />
      </TileWall>
      <div className="border-t border-border p-3">
        <InfoGrid
          items={[
            {
              label: t("overview.model"),
              value: [r.manufacturer, r.model].filter(Boolean).join(" "),
            },
            { label: t("overview.serial"), value: r.serial, mono: true },
            { label: t("overview.status"), value: r.rawStatus, mono: true },
            { label: t("overview.lastTest"), value: r.lastTest },
            {
              label: t("overview.readAt"),
              value: source.readAt
                ? t("overview.ago", { time: timeAgo(source.readAt) })
                : "",
            },
          ]}
        />
      </div>
    </div>
  );
}
