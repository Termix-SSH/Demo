import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Reading } from "../../shared/types.js";
import { UpsError } from "../errors.js";
import { FAIL_OUT, addFlag, emptyReading, needs, num } from "./util.js";

/** `target` is empty for the local daemon, or `host` or `host:port`. */
export function readScript(target: string): string {
  const arg = target ? ` ${shellQuote(target)}` : "";
  return [
    needs(
      "apcaccess",
      "apcaccess is not installed on this host. Install apcupsd.",
    ),
    `out=$(apcaccess status${arg} 2>&1) || ${FAIL_OUT}`,
    'printf "%s\\n" "$out"',
  ].join("\n");
}

export function parseVars(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (!/^[A-Z][A-Z0-9]*$/.test(key)) continue;
    vars[key] = line.slice(at + 1).trim();
  }
  return vars;
}

/** TIMELEFT is in minutes. STATUS words: ONLINE ONBATT LOWBATT REPLACEBATT OVERLOAD CAL COMMLOST. */
export function parseApcupsd(text: string): Reading {
  const v = parseVars(text);
  if (!v.STATUS && !v.UPSNAME && !v.MODEL) {
    throw new UpsError("The UPS gave no data");
  }
  const reading = emptyReading();
  const status = (v.STATUS ?? "").toUpperCase();
  reading.rawStatus = status;
  if (status.includes("ONBATT")) reading.state = "battery";
  else if (status.includes("ONLINE")) reading.state = "online";
  if (status.includes("LOWBATT")) addFlag(reading.flags, "low-battery");
  if (status.includes("REPLACEBATT")) addFlag(reading.flags, "replace-battery");
  if (status.includes("OVERLOAD")) addFlag(reading.flags, "overload");
  if (/\bCAL\b/.test(status)) addFlag(reading.flags, "calibrating");
  if (status.includes("BOOST")) addFlag(reading.flags, "boost");
  if (status.includes("TRIM")) addFlag(reading.flags, "trim");
  reading.chargePct = num(v.BCHARGE);
  const minutes = num(v.TIMELEFT);
  reading.runtimeSec = minutes === null ? null : Math.round(minutes * 60);
  reading.loadPct = num(v.LOADPCT);
  reading.inputV = num(v.LINEV);
  reading.outputV = num(v.OUTPUTV);
  reading.batteryV = num(v.BATTV);
  reading.tempC = num(v.ITEMP);
  reading.nominalW = num(v.NOMPOWER);
  reading.model = v.MODEL ?? "";
  reading.serial = v.SERIALNO ?? "";
  reading.lastTest = v.SELFTEST ?? "";
  return reading;
}
