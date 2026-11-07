import { useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { LineChart, Segmented } from "@termix-ssh/plugin-sdk/ui";
import type { HistoryPoint, HistoryRange } from "../shared/types";
import { errorMessage, getHistory } from "./api";

interface Props {
  hostId: number;
  sourceId: number;
  isVisible: boolean;
}

// LineChart reads ISO times and labels the axis itself.
function stamp(t: number): string {
  return new Date(t * 1000).toISOString();
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="px-2 pb-2">{children}</div>
    </div>
  );
}

/** Charge, load, runtime and voltage over the last day, week or month. */
export function HistoryView({ hostId, sourceId, isVisible }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<HistoryRange>("24h");
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isVisible) return;
    let live = true;
    const load = () =>
      getHistory(hostId, sourceId, range)
        .then((rows) => {
          if (!live) return;
          setPoints(rows);
          setError("");
        })
        .catch((e) => live && setError(errorMessage(e, t("history.error"))));
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostId, sourceId, range, isVisible, t]);

  const stamps = (points ?? []).map((p) => stamp(p.t));
  const col = (key: "c" | "l" | "r" | "i" | "o") =>
    (points ?? []).map((p) => p[key]);
  const has = (key: "c" | "l" | "r" | "i" | "o") =>
    col(key).some((v) => v !== null);
  const voltages = [...col("i"), ...col("o")].filter(
    (v): v is number => v !== null,
  );
  const vMin = voltages.length ? Math.floor(Math.min(...voltages) - 5) : 90;
  const vMax = voltages.length ? Math.ceil(Math.max(...voltages) + 5) : 260;
  const runtimes = col("r").filter((v): v is number => v !== null);
  const rMax = runtimes.length ? Math.max(60, ...runtimes) / 60 : 60;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Segmented<HistoryRange>
          value={range}
          onChange={setRange}
          options={[
            { value: "24h", label: t("history.24h") },
            { value: "7d", label: t("history.7d") },
            { value: "30d", label: t("history.30d") },
          ]}
        />
      </div>
      {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
      {points && points.length < 2 && !error && (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {t("history.empty")}
        </p>
      )}
      {points && points.length >= 2 && (
        <>
          {has("c") && (
            <Block title={t("history.charge")}>
              <LineChart
                series={[
                  {
                    key: "c",
                    label: t("overview.charge"),
                    color: "var(--chart-2, hsl(var(--primary)))",
                    data: col("c"),
                  },
                ]}
                timestamps={stamps}
                domain={[0, 100]}
                yFormatter={(v) => `${Math.round(v)}%`}
                height={150}
              />
            </Block>
          )}
          {has("l") && (
            <Block title={t("history.load")}>
              <LineChart
                series={[
                  {
                    key: "l",
                    label: t("overview.load"),
                    color: "var(--chart-4, hsl(var(--primary)))",
                    data: col("l"),
                  },
                ]}
                timestamps={stamps}
                domain={[0, 100]}
                yFormatter={(v) => `${Math.round(v)}%`}
                height={150}
              />
            </Block>
          )}
          {has("r") && (
            <Block title={t("history.runtime")}>
              <LineChart
                series={[
                  {
                    key: "r",
                    label: t("overview.runtime"),
                    color: "var(--chart-1, hsl(var(--primary)))",
                    data: col("r").map((v) => (v === null ? null : v / 60)),
                  },
                ]}
                timestamps={stamps}
                domain={[0, Math.ceil(rMax)]}
                yFormatter={(v) => `${Math.round(v)}m`}
                height={150}
              />
            </Block>
          )}
          {(has("i") || has("o")) && (
            <Block title={t("history.voltage")}>
              <LineChart
                series={[
                  {
                    key: "i",
                    label: t("overview.input"),
                    color: "var(--chart-3, hsl(var(--primary)))",
                    data: col("i"),
                  },
                  {
                    key: "o",
                    label: t("overview.output"),
                    color: "var(--chart-5, hsl(var(--muted-foreground)))",
                    data: col("o"),
                  },
                ]}
                timestamps={stamps}
                domain={[vMin, vMax]}
                yFormatter={(v) => `${Math.round(v)}V`}
                height={150}
              />
            </Block>
          )}
        </>
      )}
    </div>
  );
}
