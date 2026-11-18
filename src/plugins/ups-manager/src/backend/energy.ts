export const MAX_ENERGY_INTERVAL_SEC = 60;

export interface PowerSample {
  /** UTC seconds, for buckets and charts. */
  at: number;
  /** Monotonic seconds in this process; never restored after a restart. */
  monotonic: number;
  watts: number;
  /** Source identity and power method; changes break continuity. */
  epoch: string;
}

export interface EnergyInterval {
  start: number;
  end: number;
  wh: number;
  coveredSec: number;
  startW: number;
  endW: number;
}

function valid(sample: PowerSample): boolean {
  return (
    Number.isFinite(sample.at) &&
    Number.isFinite(sample.monotonic) &&
    Number.isFinite(sample.watts) &&
    sample.watts >= 0 &&
    sample.epoch.length > 0
  );
}

/**
 * Integrates one continuous interval. The caller must discard its previous
 * sample on any known read/access failure, restart or disabled collection.
 */
export function integratePower(
  previous: PowerSample | null,
  current: PowerSample,
): EnergyInterval | null {
  if (!previous || !valid(previous) || !valid(current)) return null;
  if (previous.epoch !== current.epoch) return null;
  const elapsed = current.monotonic - previous.monotonic;
  const wallElapsed = current.at - previous.at;
  if (
    elapsed <= 0 ||
    elapsed > MAX_ENERGY_INTERVAL_SEC ||
    wallElapsed <= 0 ||
    wallElapsed > MAX_ENERGY_INTERVAL_SEC ||
    Math.abs(wallElapsed - elapsed) > 1
  )
    return null;
  const wh = (((previous.watts + current.watts) / 2) * elapsed) / 3600;
  if (!Number.isFinite(wh)) return null;
  return {
    start: previous.at,
    end: current.at,
    wh,
    coveredSec: elapsed,
    startW: previous.watts,
    endW: current.watts,
  };
}

/** Split a validated interval without losing energy at UTC hour boundaries. */
export function hourlyEnergy(interval: EnergyInterval): Array<{
  hour: number;
  wh: number;
  coveredSec: number;
}> {
  const out: Array<{ hour: number; wh: number; coveredSec: number }> = [];
  const duration = interval.end - interval.start;
  for (let at = interval.start; at < interval.end;) {
    const hour = Math.floor(at / 3600) * 3600;
    const end = Math.min(interval.end, hour + 3600);
    const left = (at - interval.start) / duration;
    const right = (end - interval.start) / duration;
    const startW = interval.startW + (interval.endW - interval.startW) * left;
    const endW = interval.startW + (interval.endW - interval.startW) * right;
    const coveredSec = (interval.coveredSec * (end - at)) / duration;
    out.push({
      hour,
      wh: (((startW + endW) / 2) * coveredSec) / 3600,
      coveredSec,
    });
    at = end;
  }
  return out;
}
