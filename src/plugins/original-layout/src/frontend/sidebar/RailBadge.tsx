/**
 * The count a rail item shows on its icon. Each badge is its own component so
 * the item's useBadge hook runs once per render of a stable element.
 */
export function RailBadge({
  useBadge,
  variant = "count",
  className = "",
}: {
  useBadge: () => number | null | undefined;
  variant?: "count" | "dot";
  className?: string;
}) {
  const count = useBadge();
  if (!count || count <= 0) return null;
  if (variant === "dot") {
    return (
      <span
        className={`absolute size-1.5 rounded-full bg-accent-brand ${className}`}
      />
    );
  }
  return (
    <span
      className={`absolute min-w-[14px] h-[14px] px-[3px] rounded-full bg-accent-brand text-[9px] font-bold leading-[14px] text-center text-white tabular-nums ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export type RailStatusTone = "ok" | "warning" | "error";

const TONES: Record<RailStatusTone, string> = {
  ok: "bg-green-500",
  warning: "bg-warning",
  error: "bg-destructive",
};

/** A small colored dot for a rail item that reports a state, like sync. */
export function RailStatus({
  useStatus,
  className = "",
}: {
  useStatus: () => RailStatusTone | null | undefined;
  className?: string;
}) {
  const tone = useStatus();
  if (!tone || !TONES[tone]) return null;
  return (
    <span
      data-tone={tone}
      className={`absolute size-1.5 rounded-full ${TONES[tone]} ${className}`}
    />
  );
}
