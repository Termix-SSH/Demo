import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Reading, UpsCommand } from "../../shared/types.js";
import { UpsError } from "../errors.js";
import {
  FAIL_OUT,
  addFlag,
  emptyReading,
  failWith,
  needs,
  num,
} from "./util.js";

/** Reads every variable of one UPS. `target` is `name` or `name@host:port`. */
export function readScript(target: string): string {
  return [
    needs(
      "upsc",
      "upsc is not installed on this host. Install NUT (nut-client).",
    ),
    `out=$(upsc ${shellQuote(target)} 2>&1) || ${FAIL_OUT}`,
    'printf "%s\\n" "$out"',
  ].join("\n");
}

export function parseVars(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (!/^[a-z][a-z0-9._-]*$/i.test(key)) continue;
    vars[key] = line.slice(at + 1).trim();
  }
  return vars;
}

/** NUT status words: OL OB LB RB OVER CHRG DISCHRG BYPASS CAL OFF ALARM TRIM BOOST. */
export function parseNut(text: string): Reading {
  const v = parseVars(text);
  if (!Object.keys(v).length) {
    throw new UpsError("The UPS gave no data");
  }
  const reading = emptyReading();
  const status = (v["ups.status"] ?? "").toUpperCase();
  const words = status.split(/\s+/).filter(Boolean);
  reading.rawStatus = status;
  if (words.includes("OB")) reading.state = "battery";
  else if (words.includes("BYPASS")) reading.state = "bypass";
  else if (words.includes("OFF")) reading.state = "off";
  else if (words.includes("OL")) reading.state = "online";
  if (words.includes("LB")) addFlag(reading.flags, "low-battery");
  if (words.includes("RB")) addFlag(reading.flags, "replace-battery");
  if (words.includes("OVER")) addFlag(reading.flags, "overload");
  if (words.includes("CHRG")) addFlag(reading.flags, "charging");
  if (words.includes("CAL")) addFlag(reading.flags, "calibrating");
  if (words.includes("ALARM")) addFlag(reading.flags, "alarm");
  if (words.includes("BOOST")) addFlag(reading.flags, "boost");
  if (words.includes("TRIM")) addFlag(reading.flags, "trim");
  reading.chargePct = num(v["battery.charge"]);
  reading.runtimeSec = num(v["battery.runtime"]);
  reading.loadPct = num(v["ups.load"]);
  reading.inputV = num(v["input.voltage"]);
  reading.outputV = num(v["output.voltage"]);
  reading.batteryV = num(v["battery.voltage"]);
  reading.tempC = num(v["ups.temperature"] ?? v["battery.temperature"]);
  reading.nominalW = num(v["ups.realpower.nominal"] ?? v["ups.power.nominal"]);
  reading.manufacturer = v["device.mfr"] ?? v["ups.mfr"] ?? "";
  reading.model = v["device.model"] ?? v["ups.model"] ?? "";
  reading.serial = v["device.serial"] ?? v["ups.serial"] ?? "";
  reading.lastTest = v["ups.test.result"] ?? "";
  return reading;
}

/** Tests, beeper and stop commands are changes. Anything that cuts power is destructive. */
export function commandRisk(name: string): "change" | "destructive" {
  return /^(beeper\.|test\.|calibrate\.stop|bypass\.stop|shutdown\.stop)/.test(
    name,
  )
    ? "change"
    : "destructive";
}

/** Output of `upscmd -l`: `name - description` lines. */
export function parseCommands(text: string): UpsCommand[] {
  const out: UpsCommand[] = [];
  for (const line of text.split("\n")) {
    const match = /^([a-z0-9][a-z0-9._-]*)\s+-\s+(.*)$/i.exec(line.trim());
    if (!match) continue;
    out.push({
      name: match[1],
      description: match[2].trim(),
      risk: commandRisk(match[1]),
    });
  }
  return out;
}

export function listCommandsScript(target: string): string {
  return [
    needs("upscmd", "upscmd is not installed on this host."),
    `out=$(upscmd -l ${shellQuote(target)} 2>&1) || ${FAIL_OUT}`,
    'printf "%s\\n" "$out"',
  ].join("\n");
}

export const COMMAND_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** Runs one instant command. The name is checked against the UPS's own list first. */
export function runCommandScript(
  target: string,
  command: string,
  login: { user: string; password: string } | null,
): string {
  if (!COMMAND_RE.test(command)) throw new UpsError("The command is not valid");
  if (!login?.user || !login.password) {
    throw new UpsError("Add a NUT login to this source to send commands", 400, {
      code: "nut-login",
    });
  }
  const t = shellQuote(target);
  return [
    needs("upscmd", "upscmd is not installed on this host."),
    `upscmd -l ${t} 2>/dev/null | grep -q -- ${shellQuote(`^${command} `)} || ${failWith("The UPS does not support that command.")}`,
    `out=$(upscmd -u ${shellQuote(login.user)} -p ${shellQuote(login.password)} ${t} ${shellQuote(command)} </dev/null 2>&1) || ${FAIL_OUT}`,
    'printf "%s\\n" "$out"',
  ].join("\n");
}
