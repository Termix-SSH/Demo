import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type {
  BootTarget,
  DeviceOptions,
  DriverInfo,
  LogEntry,
  MediaSlot,
  PowerAction,
  Reading,
} from "../../shared/types.js";

export type Credentials = Record<string, string>;

/** Everything a driver needs to reach one BMC. */
export interface Target {
  address: string;
  port: number;
  options: DeviceOptions;
  credentials: Credentials;
  ca?: string;
  // The user whose access a relay host login is resolved for
  actor?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface DriverIo {
  fetch: PluginFetch;
  /** Runs ipmitool here or on the relay host. Replaced in tests. */
  ipmitool: (target: Target, args: string[]) => Promise<CommandResult>;
}

export interface Driver {
  info: DriverInfo;
  /** Reads everything. Throws when the BMC cannot be reached or refuses the login. */
  read: (target: Target, io: DriverIo) => Promise<Reading>;
  power: (target: Target, io: DriverIo, action: PowerAction) => Promise<void>;
  eventLog?: (target: Target, io: DriverIo) => Promise<LogEntry[]>;
  clearLog?: (target: Target, io: DriverIo) => Promise<void>;
  bootOnce?: (
    target: Target,
    io: DriverIo,
    device: BootTarget,
    uefi: boolean,
  ) => Promise<void>;
  media?: {
    list: (target: Target, io: DriverIo) => Promise<MediaSlot[]>;
    mount: (
      target: Target,
      io: DriverIo,
      slotId: string,
      url: string,
    ) => Promise<void>;
    eject: (target: Target, io: DriverIo, slotId: string) => Promise<void>;
  };
}

export class DriverError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DriverError";
  }
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function worst(
  states: Array<"ok" | "warning" | "critical" | "unknown">,
): "ok" | "warning" | "critical" | "unknown" {
  if (states.includes("critical")) return "critical";
  if (states.includes("warning")) return "warning";
  if (states.includes("ok")) return "ok";
  return "unknown";
}
