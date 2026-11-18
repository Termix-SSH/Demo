import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { EnergyPoint } from "../shared/types";

type Field = "outputW" | "inputW" | "outputA" | "inputA" | "batteryA" | "wh";

/** Time-proportional chart with explicit breaks, units and absolute-time tooltips. */
export function EnergyChart({
  points,
  start,
  end,
  field,
  title,
  unit,
  cumulative = false,
}: {
  points: EnergyPoint[];
  start: number;
  end: number;
  field: Field;
  title: string;
  unit: string;
  cumulative?: boolean;
}) {
  const { t } = useTranslation();
  const values = points.flatMap((p) => {
    const value = field === "wh" && p.coveredSec === 0 ? null : p[field];
    return value === null
      ? []
      : field === "outputW"
        ? [value, p.minW ?? value, p.maxW ?? value]
        : [value];
  });
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const hasValues = values.length > 0;
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, entry.contentRect.width)),
    );
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, [hasValues]);
  if (!values.length) return null;
  const low = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const high = maximum === low ? low + 1 : maximum;
  const x = (time: number) =>
    55 + ((width - 80) * (time - start)) / Math.max(1, end - start);
  const y = (value: number) => 130 - (110 * (value - low)) / (high - low);
  const timestamp = (at: number) =>
    new Date(at * 1000).toLocaleString(undefined, {
      timeZoneName: "short",
    });
  const tooltip = (p: EnergyPoint) =>
    `${timestamp(p.t)} - ${timestamp(p.end)}\n${title}: ${p[field]?.toFixed(3)} ${unit}\n` +
    `${t("energy.covered")}: ${p.coveredSec.toFixed(1)} s` +
    (field === "outputW"
      ? `\n${t("energy.sampledRange")}: ${p.minW?.toFixed(2)} - ${p.maxW?.toFixed(2)} W`
      : "");
  return (
    <section className="border-b border-border p-3">
      <h3 className="text-xs font-medium">
        {title} ({unit})
      </h3>
      <svg
        ref={svg}
        viewBox={`0 0 ${width} 180`}
        height={180}
        className="w-full"
        role="img"
        aria-label={`${title} (${unit})`}
      >
        <title>{title}</title>
        <desc>{t("energy.chartHelp")}</desc>
        {[low, (high + low) / 2, high].map((value) => (
          <g key={value}>
            <line
              x1="55"
              x2={width - 25}
              y1={y(value)}
              y2={y(value)}
              stroke="currentColor"
              opacity="0.15"
            />
            <text
              x="50"
              y={y(value) + 4}
              textAnchor="end"
              fill="currentColor"
              fontSize="10"
            >
              {Number(value.toPrecision(3))}
            </text>
          </g>
        ))}
        {points.map((p, index) => {
          const value = field === "wh" && p.coveredSec === 0 ? null : p[field];
          if (value === null) return null;
          const previous = points[index - 1];
          const connected =
            previous &&
            previous[field] !== null &&
            previous.epoch === p.epoch &&
            Math.abs(previous.end - p.t) < 0.001 &&
            (field === "outputW" || field === "wh"
              ? p.coveredSec
              : p.observedSec) >=
              p.end - p.t - 1 &&
            (field === "outputW" || field === "wh"
              ? previous.coveredSec
              : previous.observedSec) >=
              previous.end - previous.t - 1;
          const middle = x((p.t + p.end) / 2);
          return (
            <g key={`${p.epoch}:${p.t}`}>
              {connected && (field !== "wh" || cumulative) && (
                <line
                  x1={x((previous.t + previous.end) / 2)}
                  y1={y(previous[field]!)}
                  x2={middle}
                  y2={y(value)}
                  stroke="var(--chart-2, currentColor)"
                  strokeWidth="1.5"
                />
              )}
              {field === "outputW" && p.minW !== null && p.maxW !== null && (
                <line
                  x1={middle}
                  x2={middle}
                  y1={y(p.minW)}
                  y2={y(p.maxW)}
                  stroke="currentColor"
                  opacity="0.35"
                />
              )}
              {field === "wh" && !cumulative ? (
                <rect
                  x={x(p.t)}
                  y={y(value)}
                  width={Math.max(1, x(p.end) - x(p.t) - 1)}
                  height={Math.max(0.5, y(0) - y(value))}
                  fill="var(--chart-2, currentColor)"
                >
                  <title>{tooltip(p)}</title>
                </rect>
              ) : (
                <circle
                  cx={middle}
                  cy={y(value)}
                  r="3"
                  fill="var(--chart-2, currentColor)"
                >
                  <title>{tooltip(p)}</title>
                </circle>
              )}
            </g>
          );
        })}
        {(width < 500 ? [0, 1] : [0, 0.5, 1]).map((fraction) => {
          const at = start + (end - start) * fraction;
          return (
            <text
              key={fraction}
              x={x(at)}
              y="157"
              textAnchor={
                fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"
              }
              fontSize="10"
              fill="currentColor"
            >
              {new Date(at * 1000).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </text>
          );
        })}
      </svg>
    </section>
  );
}
import { useEffect, useRef, useState } from "react";
