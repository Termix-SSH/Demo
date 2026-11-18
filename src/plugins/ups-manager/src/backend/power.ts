import type { ElectricalReading, Reading } from "../shared/types.js";

/** NUT electrical fields are plain decimal values, not unit-suffixed strings. */
export function electricalNumber(
  value: string | undefined,
  signed = false,
): number | null {
  if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))
    return null;
  const n = Number(value);
  return Number.isFinite(n) && (signed || n >= 0) ? n : null;
}

export function emptyElectrical(): ElectricalReading {
  return {
    inputCurrentA: null,
    outputCurrentA: null,
    batteryCurrentA: null,
    inputPowerW: null,
    outputPowerW: null,
    inputPowerOrigin: "unavailable",
    outputPowerOrigin: "unavailable",
  };
}

/** Call once on a freshly parsed reading, before it reaches any history. */
export function applyDcPower(
  reading: Reading,
  source: { inputDc?: boolean; outputDc?: boolean },
): Reading {
  if (!reading.electrical) return reading;
  const e = reading.electrical;
  const derive = (volts: number | null, amps: number | null) => {
    if (volts === null || amps === null || volts < 0 || amps < 0) return null;
    const watts = volts * amps;
    return Number.isFinite(watts) ? watts : null;
  };
  if (source.inputDc && e.inputPowerW === null) {
    e.inputPowerW = derive(reading.inputV, e.inputCurrentA);
    if (e.inputPowerW !== null) e.inputPowerOrigin = "calculated-dc";
  }
  if (source.outputDc && e.outputPowerW === null) {
    e.outputPowerW = derive(reading.outputV, e.outputCurrentA);
    if (e.outputPowerW !== null) e.outputPowerOrigin = "calculated-dc";
  }
  applyEstimatedLoad(reading);
  return reading;
}

function applyEstimatedLoad(reading: Reading): void {
  const valid = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (reading.loadOrigin !== "estimated" && valid(reading.loadPct)) {
    reading.loadOrigin = "reported";
    return;
  }
  reading.loadPct = null;
  reading.loadOrigin = "unavailable";
  const watts = reading.electrical?.outputPowerW;
  const capacity = reading.nominalW;
  if (!valid(watts) || !valid(capacity) || capacity === 0) return;
  const percent = (watts / capacity) * 100;
  if (!Number.isFinite(percent)) return;
  reading.loadPct = percent;
  reading.loadOrigin = "estimated";
}
