/**
 * One usage ramp for every resource readout: amber past 75, red past 90, brand
 * accent below. Kept apart from resource-bits.tsx so that file only exports
 * components and stays fast-refreshable.
 */

/** Tailwind text-color class for a percentage. */
export function usageColor(percent: number | null): string {
  if (percent === null) return "text-muted-foreground";
  if (percent >= 90) return "text-destructive";
  if (percent >= 75) return "text-warning";
  return "text-accent-brand";
}

/** Tailwind background class for the same ramp. */
export function usageBarColor(percent: number | null): string {
  if (percent === null) return "bg-muted-foreground/30";
  if (percent >= 90) return "bg-destructive";
  if (percent >= 75) return "bg-warning";
  return "bg-accent-brand";
}
