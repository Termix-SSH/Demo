import {
  Activity,
  BatteryCharging,
  Gauge,
  Thermometer,
  Timer,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  AlertDescription,
  InfoGrid,
  StatTile,
  TileStack,
  TileWall,
} from "@termix-ssh/plugin-sdk/ui";
import type { SourceView } from "../shared/types";
import {
  flagKey,
  formatNumber,
  formatEnergy,
  formatRuntime,
  stateKey,
  timeAgo,
  toneOf,
} from "./format";

/** The live numbers for one UPS. */
export function OverviewView({ source }: { source: SourceView }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
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
  const e = r.electrical;
  const nut = r.nut;
  const epoch = source.energy?.current;
  const variables = Object.entries(nut?.variables ?? {}).filter(
    ([key, value]) =>
      `${key} ${value}`.toLowerCase().includes(filter.toLowerCase()),
  );
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
    <TileStack>
      {source.error && (
        <div className="px-3 py-2 text-xs text-destructive">
          {t("overview.stale", { error: source.error })}
        </div>
      )}
      {source.energy?.persistenceError && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {source.energy.persistenceError}
        </p>
      )}
      <TileWall minWidth={180}>
        {epoch && (
          <StatTile
            label={t("energy.lifetime")}
            {...formatEnergy(epoch.observedWh)}
            hint={t("energy.estimated")}
          />
        )}
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
          label={t(
            r.loadOrigin === "estimated"
              ? "overview.estimatedLoad"
              : "overview.load",
          )}
          icon={<Gauge className="size-3.5" />}
          value={formatNumber(r.loadPct, r.loadOrigin === "estimated" ? 2 : 0)}
          unit="%"
          percent={
            r.loadPct === null ? null : Math.min(100, Math.max(0, r.loadPct))
          }
          tone={loadTone}
          hint={
            r.loadOrigin === "estimated"
              ? t("overview.estimatedLoadHint", {
                  watts: r.nominalW,
                  method: t(
                    r.electrical?.outputPowerOrigin === "calculated-dc"
                      ? "electrical.calculated"
                      : "electrical.reported",
                  ),
                })
              : r.nominalW
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
        {e &&
          (
            [
              ["inputCurrent", e.inputCurrentA],
              ["outputCurrent", e.outputCurrentA],
              ["batteryCurrent", e.batteryCurrentA],
            ] as const
          ).map(([key, value]) =>
            value === null ? null : (
              <StatTile
                key={key}
                label={t(`electrical.${key}`)}
                icon={<Activity className="size-3.5" />}
                value={formatNumber(value, 3)}
                unit="A"
              />
            ),
          )}
        {e &&
          (
            [
              ["inputPower", e.inputPowerW, e.inputPowerOrigin, source.inputDc],
              [
                "outputPower",
                e.outputPowerW,
                e.outputPowerOrigin,
                source.outputDc,
              ],
            ] as const
          ).map(([key, value, origin, configured]) =>
            value === null && !configured ? null : (
              <StatTile
                key={key}
                label={t(`electrical.${key}`)}
                icon={<Zap className="size-3.5" />}
                value={formatNumber(value, 2)}
                unit="W"
                hint={
                  origin === "calculated-dc"
                    ? t("electrical.calculated")
                    : origin === "reported"
                      ? t("electrical.reported")
                      : undefined
                }
              />
            ),
          )}
      </TileWall>
      {(e?.inputPowerOrigin === "calculated-dc" ||
        e?.outputPowerOrigin === "calculated-dc") && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("electrical.dcDisclaimer")}
        </p>
      )}
      <div className="p-3">
        <InfoGrid
          items={[
            ...(epoch
              ? [
                  {
                    label: t("energy.started"),
                    value: new Date(epoch.startedAt * 1000).toLocaleString(
                      undefined,
                      { timeZoneName: "short" },
                    ),
                  },
                  {
                    label: t("energy.covered"),
                    value: `${formatNumber(epoch.coveredSec, 1)} s`,
                  },
                ]
              : []),
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
            ...(nut
              ? [
                  {
                    label: t("electrical.batteryType"),
                    value: nut.batteryType,
                  },
                  {
                    label: t("electrical.chargeLow"),
                    value:
                      nut.batteryChargeLow === null
                        ? ""
                        : `${nut.batteryChargeLow}%`,
                  },
                  {
                    label: t("electrical.chargeWarning"),
                    value:
                      nut.batteryChargeWarning === null
                        ? ""
                        : `${nut.batteryChargeWarning}%`,
                  },
                  {
                    label: t("electrical.manufactured"),
                    value: nut.batteryManufactured,
                  },
                  { label: t("electrical.driver"), value: nut.driver },
                  {
                    label: t("electrical.driverVersion"),
                    value: nut.driverVersion,
                  },
                  { label: t("electrical.subdriver"), value: nut.subdriver },
                  {
                    label: t("electrical.driverState"),
                    value: nut.driverState,
                  },
                  {
                    label: t("electrical.usb"),
                    value: [nut.vendorId, nut.productId]
                      .filter(Boolean)
                      .join(" / "),
                  },
                ]
              : []),
          ]}
        />
      </div>
      {nut && (
        <details className="p-3">
          <summary className="cursor-pointer text-sm">
            {t("electrical.raw")}
          </summary>
          <input
            type="search"
            className="my-2 w-full border border-border bg-background p-2 text-sm"
            aria-label={t("electrical.search")}
            placeholder={t("electrical.search")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <dl className="text-xs">
            {variables.map(([key, value]) => (
              <div
                key={key}
                className="grid gap-1 border-b border-border py-1 sm:grid-cols-2"
              >
                <dt className="break-all font-mono">{key}</dt>
                <dd className="break-all font-mono">{value}</dd>
              </div>
            ))}
          </dl>
          {!variables.length && (
            <p className="text-xs">{t("electrical.noVariables")}</p>
          )}
        </details>
      )}
    </TileStack>
  );
}
