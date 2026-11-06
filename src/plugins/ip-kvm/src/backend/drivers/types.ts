import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type {
  DeviceOptions,
  DriverInfo,
  InputEvent,
  MediaState,
  PowerAction,
  Reading,
} from "../../shared/types.js";

export type Credentials = Record<string, string>;

/** Everything a driver needs to reach one KVM. */
export interface Target {
  address: string;
  port: number;
  options: DeviceOptions;
  credentials: Credentials;
  ca?: string;
}

/** The part of a WebSocket the drivers use. Replaced in tests. */
export interface DeviceSocket {
  send: (data: string | Buffer) => void;
  close: () => void;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
}

export interface DriverIo {
  fetch: PluginFetch;
  /** Opens a WebSocket to the KVM. Only called with the saved device's address. */
  connect: (
    url: string,
    options: { headers?: Record<string, string>; ca?: string },
  ) => DeviceSocket;
}

export interface ScreenHandlers {
  onFrame: (jpeg: Buffer) => void;
  onClose: (reason?: string) => void;
}

export interface ScreenSession {
  input: (event: InputEvent) => void;
  close: () => void;
}

export interface Driver {
  info: DriverInfo;
  /** Reads the KVM. Throws when it cannot be reached or refuses the login. */
  read: (target: Target, io: DriverIo) => Promise<Reading>;
  power?: (target: Target, io: DriverIo, action: PowerAction) => Promise<void>;
  /** One JPEG of the current screen. */
  snapshot?: (target: Target, io: DriverIo) => Promise<Buffer>;
  /** Video as JPEG frames plus keyboard and mouse. */
  screen?: (
    target: Target,
    io: DriverIo,
    handlers: ScreenHandlers,
  ) => Promise<ScreenSession>;
  /** Type text on the machine. */
  paste?: (target: Target, io: DriverIo, text: string) => Promise<void>;
  media?: {
    list: (target: Target, io: DriverIo) => Promise<MediaState>;
    mount: (
      target: Target,
      io: DriverIo,
      imageId: string,
      cdrom: boolean,
    ) => Promise<void>;
    eject: (target: Target, io: DriverIo) => Promise<void>;
    fromUrl?: (
      target: Target,
      io: DriverIo,
      url: string,
      name: string,
    ) => Promise<void>;
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

export function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
