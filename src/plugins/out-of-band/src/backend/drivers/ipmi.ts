import type {
  BootTarget,
  Health,
  LogEntry,
  PowerAction,
  Reading,
  Sensor,
  SensorKind,
} from "../../shared/types.js";
import {
  DriverError,
  num,
  worst,
  type CommandResult,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

const LOG_LIMIT = 100;

/** The ipmitool arguments that reach one BMC. The password is never here, it goes in IPMI_PASSWORD. */
export function connectionArgs(target: Target): string[] {
  const args = [
    "-I",
    "lanplus",
    "-H",
    target.address,
    "-p",
    String(target.port),
    "-U",
    target.credentials.username ?? "",
    "-E",
    "-N",
    "5",
    "-R",
    "2",
  ];
  if (target.options.cipher !== undefined) {
    args.push("-C", String(target.options.cipher));
  }
  return args;
}

async function run(
  target: Target,
  io: DriverIo,
  args: string[],
): Promise<CommandResult> {
  const result = await io.ipmitool(target, args);
  if (result.code !== 0) {
    const text = (result.stderr || result.stdout).trim().split("\n").pop();
    throw new DriverError(text || "ipmitool failed");
  }
  return result;
}

function field(text: string, name: string): string | undefined {
  const match = new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, "mi").exec(text);
  return match?.[1]?.trim() || undefined;
}

const STATE: Record<string, Health> = {
  ok: "ok",
  nc: "warning",
  cr: "critical",
  nr: "critical",
  ns: "unknown",
  na: "unknown",
};

function kindOf(unit: string): SensorKind {
  const text = unit.toLowerCase();
  if (text.includes("degrees")) return "temperature";
  if (text.includes("rpm")) return "fan";
  if (text.includes("volt")) return "voltage";
  if (text.includes("watt")) return "power";
  return "other";
}

/** Reads `sdr elist` lines: name | id | status | entity | reading. */
export function parseSensors(text: string): Sensor[] {
  const out: Sensor[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5) continue;
    const [name, id, status, , reading] = parts;
    if (!name) continue;
    const match = /^(-?\d+(?:\.\d+)?)\s+(.*)$/.exec(reading);
    const value = match ? num(match[1]) : undefined;
    const unitText = match?.[2] ?? "";
    // Discrete sensors have no number, so only keep them when they report a fault
    if (value === undefined && (status === "ok" || status === "ns")) continue;
    const unit = unitText.toLowerCase().includes("degrees")
      ? "C"
      : unitText.toLowerCase().includes("volts")
        ? "V"
        : unitText.toLowerCase().includes("watts")
          ? "W"
          : unitText.toLowerCase().includes("rpm")
            ? "RPM"
            : unitText || undefined;
    out.push({
      id: `${id}:${name}`,
      name,
      kind: kindOf(unitText),
      value,
      unit,
      state: STATE[status.toLowerCase()] ?? "unknown",
    });
  }
  return out;
}

function severityOf(text: string): LogEntry["severity"] {
  const lower = text.toLowerCase();
  if (/critical|failure|fault|error|going high|going low|lost/.test(lower)) {
    return lower.includes("non-critical") ? "warning" : "critical";
  }
  if (/warning|non-critical|degraded/.test(lower)) return "warning";
  return "info";
}

/** Reads `sel elist` lines: id | date | time | sensor | event | direction. */
export function parseLog(text: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5 || !/^[0-9a-f]+$/i.test(parts[0])) continue;
    const [id, date, time, sensor, ...rest] = parts;
    const message = [sensor, ...rest].filter(Boolean).join(" | ");
    out.push({
      id,
      at: `${date} ${time}`.trim(),
      severity: severityOf(message),
      message,
    });
  }
  return out.reverse().slice(0, LOG_LIMIT);
}

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const status = await run(target, io, ["chassis", "power", "status"]);
  const state = /power is (on|off)/i.exec(status.stdout)?.[1]?.toLowerCase();
  let sensors: Sensor[] = [];
  try {
    sensors = parseSensors((await run(target, io, ["sdr", "elist"])).stdout);
  } catch {
    // Some BMCs have no sensor repository
  }
  const info: Reading["info"] = {};
  try {
    const mc = (await run(target, io, ["mc", "info"])).stdout;
    info.manufacturer = field(mc, "Manufacturer Name");
    info.bmcVersion = field(mc, "Firmware Revision");
  } catch {
    // Not every BMC answers mc info
  }
  try {
    const fru = (await run(target, io, ["fru", "print", "0"])).stdout;
    info.model = field(fru, "Product Name");
    info.serial = field(fru, "Product Serial");
    info.manufacturer = field(fru, "Product Manufacturer") ?? info.manufacturer;
  } catch {
    // The FRU may be empty
  }
  return {
    at: new Date().toISOString(),
    info,
    power: state === "on" ? "on" : state === "off" ? "off" : "unknown",
    health: sensors.length
      ? worst(sensors.map((sensor) => sensor.state))
      : "unknown",
    sensors,
  };
}

const POWER: Record<PowerAction, string> = {
  on: "on",
  off: "off",
  "graceful-shutdown": "soft",
  cycle: "cycle",
  reset: "reset",
};

const BOOT: Record<BootTarget, string> = {
  none: "none",
  pxe: "pxe",
  disk: "disk",
  cd: "cdrom",
  usb: "floppy",
  bios: "bios",
};

export const ipmi: Driver = {
  info: {
    id: "ipmi",
    defaultPort: 623,
    web: false,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: true,
      eventLog: true,
      boot: true,
      media: false,
      console: true,
    },
    powerActions: ["on", "off", "graceful-shutdown", "cycle", "reset"],
  },
  read,
  async power(target, io, action) {
    await run(target, io, ["chassis", "power", POWER[action]]);
  },
  async eventLog(target, io) {
    return parseLog((await run(target, io, ["sel", "elist"])).stdout);
  },
  async clearLog(target, io) {
    await run(target, io, ["sel", "clear"]);
  },
  async bootOnce(target, io, device, uefi) {
    const args = ["chassis", "bootdev", BOOT[device]];
    if (device !== "none" && uefi) args.push("options=efiboot");
    await run(target, io, args);
  },
};
