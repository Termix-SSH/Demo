import { useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { InfoGrid, StatTile, TileWall } from "@termix-ssh/plugin-sdk/ui";
import type { EnergyHistory, HistoryRange } from "../shared/types";
import { errorMessage, getEnergy } from "./api";
import { EnergyChart } from "./EnergyChart";
import { formatEnergy, formatNumber } from "./format";

export function EnergyView({
  hostId,
  sourceId,
  range,
  isVisible,
}: {
  hostId: number;
  sourceId: number;
  range: HistoryRange;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<EnergyHistory | null>(null);
  const [error, setError] = useState("");
  let total = 0;
  const cumulative = (data?.points ?? []).map((p) => {
    total += p.wh;
    return { ...p, wh: total };
  });
  useEffect(() => {
    setData(null);
    setError("");
    if (!isVisible) return;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const report = await getEnergy(hostId, sourceId, range);
        if (active) {
          setData(report);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(errorMessage(e, t("energy.error")));
        }
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [hostId, sourceId, range, isVisible, t]);
  return (
    <div>
      {error && (
        <p role="alert" className="p-3 text-xs text-destructive">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.persistenceError && (
            <p role="alert" className="p-3 text-xs text-destructive">
              {data.persistenceError}
            </p>
          )}
          <TileWall minWidth={180}>
            <StatTile
              label={t("energy.period")}
              {...(data.epochs.some((e) => e.origin !== "unavailable")
                ? formatEnergy(data.observedWh)
                : { value: "-", unit: "Wh" })}
              hint={t("energy.estimated")}
            />
            <StatTile
              label={t("energy.coverage")}
              value={formatNumber(data.coveragePct, 1)}
              unit="%"
              hint={
                data.incomplete ? t("energy.incomplete") : t("energy.complete")
              }
            />
            <StatTile
              label={t("energy.average")}
              value={formatNumber(data.averageW, 2)}
              unit="W"
            />
            <StatTile
              label={t("energy.peak")}
              value={formatNumber(data.sampledPeakW, 2)}
              unit="W"
            />
          </TileWall>
          <p className="p-3 text-xs text-muted-foreground">
            {t("energy.scope")}{" "}
            {t("energy.resolution", { seconds: data.resolutionSec })}
          </p>
          {!data.points.length && (
            <p className="p-3 text-xs text-muted-foreground">
              {t("energy.empty")}
            </p>
          )}
          {(
            [
              ["outputW", "electrical.outputPower", "W"],
              ["inputW", "electrical.inputPower", "W"],
              ["outputA", "electrical.outputCurrent", "A"],
              ["inputA", "electrical.inputCurrent", "A"],
              ["batteryA", "electrical.batteryCurrent", "A"],
              ["wh", "energy.bucket", "Wh"],
            ] as const
          ).map(([field, title, unit]) => (
            <EnergyChart
              key={field}
              field={field}
              title={t(title)}
              unit={unit}
              points={data.points}
              start={data.start}
              end={data.end}
            />
          ))}
          {data.points.some((p) => p.coveredSec > 0) && (
            <EnergyChart
              field="wh"
              title={t("energy.cumulativeChart")}
              unit="Wh"
              points={cumulative}
              start={data.start}
              end={data.end}
              cumulative
            />
          )}
          <details className="border-b border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("energy.samples")}
            </summary>
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] text-xs">
                <caption>{t("energy.tableHelp")}</caption>
                <thead>
                  <tr>
                    {[
                      t("energy.time"),
                      `${t("electrical.outputPower")} (W)`,
                      `${t("energy.sampledRange")} (W)`,
                      `${t("electrical.inputPower")} (W)`,
                      `${t("electrical.outputCurrent")} (A)`,
                      `${t("electrical.inputCurrent")} (A)`,
                      `${t("electrical.batteryCurrent")} (A)`,
                      "Wh",
                      t("energy.cumulative"),
                      t("energy.covered"),
                    ].map((label) => (
                      <th key={label} className="p-2 text-left">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((p, index) => (
                    <tr key={`${p.epoch}:${p.t}`}>
                      <td className="p-2">
                        {new Date(p.t * 1000).toLocaleString(undefined, {
                          timeZoneName: "short",
                        })}
                      </td>
                      <td>{formatNumber(p.outputW, 3)}</td>
                      <td>
                        {formatNumber(p.minW, 3)} - {formatNumber(p.maxW, 3)}
                      </td>
                      <td>{formatNumber(p.inputW, 3)}</td>
                      <td>{formatNumber(p.outputA, 3)}</td>
                      <td>{formatNumber(p.inputA, 3)}</td>
                      <td>{formatNumber(p.batteryA, 3)}</td>
                      <td>{p.coveredSec ? formatNumber(p.wh, 5) : "-"}</td>
                      <td>{formatNumber(cumulative[index].wh, 5)}</td>
                      <td>{formatNumber(p.coveredSec, 1)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="p-3">
            <h3 className="mb-2 text-xs font-medium">{t("energy.epochs")}</h3>
            {data.epochs.map((epoch) => (
              <InfoGrid
                key={epoch.id}
                items={[
                  {
                    label: t("energy.started"),
                    value: new Date(epoch.startedAt * 1000).toLocaleString(
                      undefined,
                      { timeZoneName: "short" },
                    ),
                  },
                  {
                    label: t("energy.method"),
                    value: t(
                      epoch.origin === "unavailable"
                        ? "energy.unavailable"
                        : epoch.origin === "calculated-dc"
                          ? "electrical.calculated"
                          : "electrical.reported",
                    ),
                  },
                  {
                    label: t("energy.epochTotal"),
                    value:
                      epoch.origin === "unavailable"
                        ? "-"
                        : `${formatEnergy(epoch.observedWh).value} ${formatEnergy(epoch.observedWh).unit}`,
                  },
                  {
                    label: t("energy.covered"),
                    value: `${formatNumber(epoch.coveredSec, 1)} s`,
                  },
                ]}
              />
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("energy.correlationBlocked")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
