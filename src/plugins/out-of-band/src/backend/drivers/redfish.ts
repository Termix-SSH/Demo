import type {
  BootTarget,
  Health,
  LogEntry,
  MediaSlot,
  PowerAction,
  Reading,
  Sensor,
} from "../../shared/types.js";
import { basicAuth, baseUrl, describeStatus, send } from "./http.js";
import {
  DriverError,
  num,
  str,
  worst,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

type Json = Record<string, unknown>;

const LOG_LIMIT = 100;

function auth(target: Target): Record<string, string> {
  return {
    accept: "application/json",
    authorization: basicAuth(
      target.credentials.username ?? "",
      target.credentials.password ?? "",
    ),
  };
}

async function call(
  target: Target,
  io: DriverIo,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Json> {
  const headers = auth(target);
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await send(target, io, `${baseUrl(target)}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    throw new DriverError(describeStatus(response.status), response.status);
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new DriverError("The BMC sent something that is not JSON");
  }
}

/** A read that may be missing on this BMC. */
async function maybe(
  target: Target,
  io: DriverIo,
  path: string | undefined,
): Promise<Json | null> {
  if (!path) return null;
  try {
    return await call(target, io, path);
  } catch {
    return null;
  }
}

function link(value: unknown): string | undefined {
  const id = (value as Json | undefined)?.["@odata.id"];
  return typeof id === "string" ? id : undefined;
}

function members(collection: Json | null): string[] {
  const list = collection?.Members;
  if (!Array.isArray(list)) return [];
  return list.map(link).filter((item): item is string => !!item);
}

function health(value: unknown): Health {
  const text = str(value).toLowerCase();
  if (text === "ok") return "ok";
  if (text === "warning") return "warning";
  if (text === "critical") return "critical";
  return "unknown";
}

function statusOf(item: Json): Health {
  const status = item.Status as Json | undefined;
  if (!status) return "unknown";
  if (str(status.State).toLowerCase() === "absent") return "unknown";
  return health(status.HealthRollup ?? status.Health);
}

async function systemPath(target: Target, io: DriverIo): Promise<string> {
  const root = await call(target, io, "/redfish/v1/Systems");
  const first = members(root)[0];
  if (!first) throw new DriverError("The BMC lists no systems");
  return first;
}

async function managerPaths(target: Target, io: DriverIo): Promise<string[]> {
  return members(await maybe(target, io, "/redfish/v1/Managers"));
}

function temperatureSensors(thermal: Json | null): Sensor[] {
  const out: Sensor[] = [];
  const temps = Array.isArray(thermal?.Temperatures)
    ? (thermal.Temperatures as Json[])
    : [];
  temps.forEach((item, index) => {
    const value = num(item.ReadingCelsius);
    if (value === undefined) return;
    out.push({
      id: `temp:${str(item.MemberID ?? item.MemberId ?? index)}`,
      name: str(item.Name) || `Temperature ${index + 1}`,
      kind: "temperature",
      value,
      unit: "C",
      state: statusOf(item),
    });
  });
  const fans = Array.isArray(thermal?.Fans) ? (thermal.Fans as Json[]) : [];
  fans.forEach((item, index) => {
    const value = num(item.Reading ?? item.SpeedPercent);
    if (value === undefined) return;
    const unit = str(item.ReadingUnits) === "Percent" ? "%" : "RPM";
    out.push({
      id: `fan:${str(item.MemberID ?? item.MemberId ?? index)}`,
      name: str(item.Name ?? item.FanName) || `Fan ${index + 1}`,
      kind: "fan",
      value,
      unit,
      state: statusOf(item),
    });
  });
  return out;
}

function powerSensors(power: Json | null): Sensor[] {
  const out: Sensor[] = [];
  const volts = Array.isArray(power?.Voltages)
    ? (power.Voltages as Json[])
    : [];
  volts.forEach((item, index) => {
    const value = num(item.ReadingVolts);
    if (value === undefined) return;
    out.push({
      id: `volt:${str(item.MemberID ?? item.MemberId ?? index)}`,
      name: str(item.Name) || `Voltage ${index + 1}`,
      kind: "voltage",
      value,
      unit: "V",
      state: statusOf(item),
    });
  });
  const supplies = Array.isArray(power?.PowerSupplies)
    ? (power.PowerSupplies as Json[])
    : [];
  supplies.forEach((item, index) => {
    out.push({
      id: `psu:${str(item.MemberID ?? item.MemberId ?? index)}`,
      name: str(item.Name) || `Power supply ${index + 1}`,
      kind: "psu",
      value: num(item.PowerOutputWatts ?? item.LastPowerOutputWatts),
      unit: "W",
      state: statusOf(item),
    });
  });
  const controls = Array.isArray(power?.PowerControl)
    ? (power.PowerControl as Json[])
    : [];
  controls.forEach((item, index) => {
    const value = num(item.PowerConsumedWatts);
    if (value === undefined) return;
    out.push({
      id: `power:${str(item.MemberID ?? item.MemberId ?? index)}`,
      name: str(item.Name) || "Power draw",
      kind: "power",
      value,
      unit: "W",
      state: statusOf(item),
    });
  });
  return out;
}

/** Newer BMCs list readings in a Sensors collection instead of Thermal and Power. */
async function collectionSensors(
  target: Target,
  io: DriverIo,
  chassis: Json,
): Promise<Sensor[]> {
  const paths = members(await maybe(target, io, link(chassis.Sensors)));
  const out: Sensor[] = [];
  for (const path of paths.slice(0, 80)) {
    const item = await maybe(target, io, path);
    if (!item) continue;
    const value = num(item.Reading);
    if (value === undefined) continue;
    const type = str(item.ReadingType);
    const kind =
      type === "Temperature"
        ? "temperature"
        : type === "Rotational" || type === "Percent"
          ? "fan"
          : type === "Voltage"
            ? "voltage"
            : type === "Power"
              ? "power"
              : "other";
    out.push({
      id: `sensor:${str(item.Id) || path}`,
      name: str(item.Name) || str(item.Id),
      kind,
      value,
      unit: str(item.ReadingUnits) || undefined,
      state: statusOf(item),
    });
  }
  return out;
}

async function sensorsOf(target: Target, io: DriverIo): Promise<Sensor[]> {
  const out: Sensor[] = [];
  const chassisPaths = members(await maybe(target, io, "/redfish/v1/Chassis"));
  for (const path of chassisPaths.slice(0, 6)) {
    const chassis = await maybe(target, io, path);
    if (!chassis) continue;
    const thermal = await maybe(target, io, link(chassis.Thermal));
    const power = await maybe(target, io, link(chassis.Power));
    const found = [...temperatureSensors(thermal), ...powerSensors(power)];
    if (found.length) out.push(...found);
    else out.push(...(await collectionSensors(target, io, chassis)));
  }
  return out;
}

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const path = await systemPath(target, io);
  const system = await call(target, io, path);
  const sensors = await sensorsOf(target, io).catch(() => [] as Sensor[]);
  let bmcVersion: string | undefined;
  const managers = await managerPaths(target, io);
  if (managers[0]) {
    const manager = await maybe(target, io, managers[0]);
    bmcVersion = str(manager?.FirmwareVersion) || undefined;
  }
  const powerText = str(system.PowerState).toLowerCase();
  const own = statusOf(system);
  return {
    at: new Date().toISOString(),
    info: {
      manufacturer: str(system.Manufacturer) || undefined,
      model: str(system.Model) || undefined,
      serial: str(system.SerialNumber) || undefined,
      biosVersion: str(system.BiosVersion) || undefined,
      bmcVersion,
      hostname: str(system.HostName) || undefined,
    },
    power:
      powerText === "on"
        ? "on"
        : powerText === "off"
          ? "off"
          : powerText
            ? "off"
            : "unknown",
    health: worst([own, ...sensors.map((sensor) => sensor.state)]),
    sensors,
  };
}

const RESET_TYPES: Record<PowerAction, string[]> = {
  on: ["On"],
  off: ["ForceOff"],
  "graceful-shutdown": ["GracefulShutdown"],
  cycle: ["PowerCycle", "ForceRestart"],
  reset: ["ForceRestart", "GracefulRestart"],
};

async function power(
  target: Target,
  io: DriverIo,
  action: PowerAction,
): Promise<void> {
  const path = await systemPath(target, io);
  const system = await call(target, io, path);
  const actions = system.Actions as Json | undefined;
  const reset = actions?.["#ComputerSystem.Reset"] as Json | undefined;
  const endpoint =
    str(reset?.target) ||
    `${path.replace(/\/$/, "")}/Actions/ComputerSystem.Reset`;
  const allowed = reset?.["ResetType@Redfish.AllowableValues"];
  const wanted = RESET_TYPES[action];
  const type = Array.isArray(allowed)
    ? wanted.find((item) => (allowed as string[]).includes(item))
    : wanted[0];
  if (!type) throw new DriverError("This BMC does not support that action");
  await call(target, io, endpoint, {
    method: "POST",
    body: { ResetType: type },
  });
}

async function logServices(target: Target, io: DriverIo): Promise<string[]> {
  const out: string[] = [];
  const system = await maybe(target, io, await systemPath(target, io));
  for (const path of members(
    await maybe(target, io, link(system?.LogServices)),
  )) {
    out.push(path);
  }
  for (const manager of await managerPaths(target, io)) {
    const item = await maybe(target, io, manager);
    for (const path of members(
      await maybe(target, io, link(item?.LogServices)),
    )) {
      out.push(path);
    }
  }
  return out;
}

function severity(value: unknown): LogEntry["severity"] {
  const text = str(value).toLowerCase();
  if (text === "critical") return "critical";
  if (text === "warning") return "warning";
  return "info";
}

async function eventLog(target: Target, io: DriverIo): Promise<LogEntry[]> {
  const out: LogEntry[] = [];
  for (const service of await logServices(target, io)) {
    const info = await maybe(target, io, service);
    const entries = await maybe(target, io, link(info?.Entries));
    const list = Array.isArray(entries?.Members)
      ? (entries.Members as Json[])
      : [];
    for (const item of list) {
      out.push({
        id: `${service}:${str(item.Id)}`,
        at: str(item.Created ?? item.EventTimestamp),
        severity: severity(item.Severity),
        message: str(item.Message) || str(item.Name),
      });
    }
    if (out.length) break;
  }
  return out
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, LOG_LIMIT);
}

async function clearLog(target: Target, io: DriverIo): Promise<void> {
  for (const service of await logServices(target, io)) {
    const info = await maybe(target, io, service);
    const clear = (info?.Actions as Json | undefined)?.["#LogService.ClearLog"];
    const endpoint = str((clear as Json | undefined)?.target);
    if (!endpoint) continue;
    await call(target, io, endpoint, { method: "POST", body: {} });
    return;
  }
  throw new DriverError("This BMC cannot clear its log");
}

const BOOT: Record<BootTarget, string> = {
  none: "None",
  pxe: "Pxe",
  disk: "Hdd",
  cd: "Cd",
  usb: "Usb",
  bios: "BiosSetup",
};

async function bootOnce(
  target: Target,
  io: DriverIo,
  device: BootTarget,
  uefi: boolean,
): Promise<void> {
  const path = await systemPath(target, io);
  const boot: Json = {
    BootSourceOverrideTarget: BOOT[device],
    BootSourceOverrideEnabled: device === "none" ? "Disabled" : "Once",
  };
  if (device !== "none" && uefi) boot.BootSourceOverrideMode = "UEFI";
  await call(target, io, path, { method: "PATCH", body: { Boot: boot } });
}

async function slots(
  target: Target,
  io: DriverIo,
): Promise<Array<MediaSlot & { path: string; actions: Json }>> {
  const out: Array<MediaSlot & { path: string; actions: Json }> = [];
  for (const manager of await managerPaths(target, io)) {
    const info = await maybe(target, io, manager);
    for (const path of members(
      await maybe(target, io, link(info?.VirtualMedia)),
    )) {
      const item = await maybe(target, io, path);
      if (!item) continue;
      const types = Array.isArray(item.MediaTypes)
        ? (item.MediaTypes as string[])
        : [];
      if (types.length && !types.some((type) => /cd|dvd/i.test(type))) continue;
      out.push({
        id: path,
        path,
        name: str(item.Name) || str(item.Id),
        inserted: item.Inserted === true,
        image: str(item.Image) || undefined,
        actions: (item.Actions as Json | undefined) ?? {},
      });
    }
  }
  return out;
}

async function find(target: Target, io: DriverIo, slotId: string) {
  const slot = (await slots(target, io)).find((item) => item.id === slotId);
  if (!slot) throw new DriverError("Virtual media slot not found", 404);
  return slot;
}

export const redfish: Driver = {
  info: {
    id: "redfish",
    defaultPort: 443,
    web: true,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      sensors: true,
      eventLog: true,
      boot: true,
      media: true,
      console: false,
    },
    powerActions: ["on", "off", "graceful-shutdown", "cycle", "reset"],
  },
  read,
  power,
  eventLog,
  clearLog,
  bootOnce,
  media: {
    async list(target, io) {
      return (await slots(target, io)).map(
        ({ path: _path, actions: _actions, ...slot }) => slot,
      );
    },
    async mount(target, io, slotId, url) {
      const slot = await find(target, io, slotId);
      const insert = (
        slot.actions["#VirtualMedia.InsertMedia"] as Json | undefined
      )?.target;
      const endpoint =
        str(insert) || `${slot.path}/Actions/VirtualMedia.InsertMedia`;
      await call(target, io, endpoint, {
        method: "POST",
        body: { Image: url, Inserted: true, WriteProtected: true },
      });
    },
    async eject(target, io, slotId) {
      const slot = await find(target, io, slotId);
      const eject = (
        slot.actions["#VirtualMedia.EjectMedia"] as Json | undefined
      )?.target;
      const endpoint =
        str(eject) || `${slot.path}/Actions/VirtualMedia.EjectMedia`;
      await call(target, io, endpoint, { method: "POST", body: {} });
    },
  },
};
