import { cn } from "@/lib/utils";
import { usageBarColor, usageColor } from "./usage-color";

/**
 * The usage bar and the percent-plus-label row, shared by Proxmox and host
 * metrics.
 *
 * Both panels had grown their own copy of the same bar, the same thresholds and
 * the same readout, which is why they drifted apart visually. One definition
 * keeps them reading as two views of the same system. The colour ramp itself
 * lives in usage-color.ts so this file only exports components.
 */

export function Meter({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) {
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden bg-muted", className)}>
      <div
        className={cn("motion-meter h-full", usageBarColor(percent))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/**
 * A meter with its readout. Pass `label` for the stacked card form; leave it off
 * for the bare form a table cell wants.
 */
export function UsagePair({
  label,
  percent,
  detail,
}: {
  label?: string;
  percent: number;
  detail?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex min-w-0 items-center gap-2">
      {label && (
        <span className="w-10 shrink-0 text-[10px] uppercase text-muted-foreground">
          {label}
        </span>
      )}
      <Meter percent={clamped} className="flex-1" />
      <span
        className={cn(
          "shrink-0 text-right text-[11px] tabular-nums",
          detail ? "text-muted-foreground" : usageColor(clamped),
        )}
      >
        {detail ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
