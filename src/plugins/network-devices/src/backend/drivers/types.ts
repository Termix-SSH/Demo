import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type {
  ClientInfo,
  DeviceInfo,
  DeviceOptions,
  DriverInfo,
  NeighborInfo,
  PortInfo,
} from "../../shared/types.js";

export type Credentials = Record<string, string>;

/** Everything a driver needs to reach one device. */
export interface Target {
  address: string;
  port: number;
  options: DeviceOptions;
  credentials: Credentials;
  ca?: string;
  // Shorter wait for scans
  timeoutMs?: number;
}

export interface DriverIo {
  fetch: PluginFetch;
  // Replaced in tests
  snmp?: SnmpFactory;
  sleep?: (ms: number) => Promise<void>;
}

export interface Driver {
  info: DriverInfo;
  /** Returns a message when the keys are not enough for the options. */
  validate?: (
    credentials: Credentials,
    options: DeviceOptions,
  ) => string | null;
  /** Reads the basics. Throws when the device cannot be reached or refuses the login. */
  probe: (target: Target, io: DriverIo) => Promise<DeviceInfo>;
  ports: (target: Target, io: DriverIo) => Promise<PortInfo[]>;
  clients: (target: Target, io: DriverIo) => Promise<ClientInfo[]>;
  neighbors: (target: Target, io: DriverIo) => Promise<NeighborInfo[]>;
  setPort?: (
    target: Target,
    io: DriverIo,
    portId: string,
    up: boolean,
  ) => Promise<void>;
  poeCycle?: (target: Target, io: DriverIo, portId: string) => Promise<void>;
  reboot?: (target: Target, io: DriverIo) => Promise<void>;
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

/** A small SNMP client, so the driver can be tested without a socket. */
export interface SnmpValue {
  oid: string;
  value: string | number | Buffer | bigint;
}

export interface SnmpClient {
  get: (oids: string[]) => Promise<Array<SnmpValue | null>>;
  /** Every value under an oid. */
  walk: (oid: string) => Promise<SnmpValue[]>;
  set: (oid: string, type: "integer", value: number) => Promise<void>;
  close: () => void;
}

export type SnmpFactory = (target: Target) => SnmpClient;
