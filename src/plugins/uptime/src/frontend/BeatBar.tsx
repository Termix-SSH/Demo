import type { BeatView, MonitorStatus } from "../shared/types";

const COLORS: Record<MonitorStatus, string> = {
  up: "bg-green-500",
  down: "bg-destructive",
  pending: "bg-warning",
  maintenance: "bg-accent-brand",
  paused: "bg-muted-foreground/40",
  unknown: "bg-muted",
};

/** The last checks as flat bars, oldest on the left. */
export function BeatBar({
  beats,
  count = 40,
  className = "",
}: {
  beats: BeatView[];
  count?: number;
  className?: string;
}) {
  const shown = beats.slice(-count);
  const empty = Math.max(0, count - shown.length);
  return (
    <div
      className={`flex h-4 min-w-0 gap-px ${className}`}
      role="img"
      aria-hidden="true"
    >
      {Array.from({ length: empty }, (_, index) => (
        <span key={`empty-${index}`} className="min-w-px flex-1 bg-muted" />
      ))}
      {shown.map((beat) => (
        <span
          key={beat.t}
          className={`min-w-px flex-1 ${COLORS[beat.s]}`}
          title={`${new Date(beat.t * 1000).toLocaleString()} | ${beat.s}${
            beat.ms === null ? "" : ` | ${beat.ms} ms`
          }`}
        />
      ))}
    </div>
  );
}
