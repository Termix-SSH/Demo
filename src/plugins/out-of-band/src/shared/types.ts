// Types shared by the backend routes and the frontend.

export type DriverId = "redfish" | "ipmi" | "amt";

export type DeviceStatus = "unknown" | "up" | "down";

export type PowerState = "on" | "off" | "unknown";

export type Health = "ok" | "warning" | "critical" | "unknown";

export type PowerAction =
  "on" | "off" | "graceful-shutdown" | "cycle" | "reset";

export type BootTarget = "none" | "pxe" | "disk" | "cd" | "usb" | "bios";

export interface CredentialField {
  key: string;
  type: "text" | "secret";
  required: boolean;
}

export interface DriverFeatures {
  sensors: boolean;
  eventLog: boolean;
  boot: boolean;
  media: boolean;
  console: boolean;
}

export interface DriverInfo {
  id: DriverId;
  defaultPort: number;
  // Reached over http or https
  web: boolean;
  fields: CredentialField[];
  features: DriverFeatures;
  powerActions: PowerAction[];
}

export interface DeviceOptions {
  scheme?: "http" | "https";
  // IPMI cipher suite, for BMCs that refuse the default
  cipher?: number;
  // Run the commands on this Termix host instead of the Termix server
  relayHostId?: number;
}

export interface SystemInfo {
  manufacturer?: string;
  model?: string;
  serial?: string;
  biosVersion?: string;
  bmcVersion?: string;
  hostname?: string;
}

export type SensorKind =
  "temperature" | "fan" | "voltage" | "power" | "psu" | "other";

export interface Sensor {
  id: string;
  name: string;
  kind: SensorKind;
  value?: number;
  unit?: string;
  state: Health;
}

export interface Reading {
  at: string;
  info: SystemInfo;
  power: PowerState;
  health: Health;
  sensors: Sensor[];
}

export interface LogEntry {
  id: string;
  at: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface MediaSlot {
  id: string;
  name: string;
  inserted: boolean;
  image?: string;
}

export interface Device {
  id: number;
  hostId: number | null;
  name: string;
  driver: DriverId;
  address: string;
  port: number | null;
  options: DeviceOptions;
  hasCa: boolean;
  pollSeconds: number;
  status: DeviceStatus;
  lastError: string | null;
  lastSeenAt: string | null;
  reading: Reading | null;
}

export interface DeviceInput {
  name?: string;
  hostId?: number | null;
  driver?: DriverId;
  address?: string;
  port?: number | null;
  options?: DeviceOptions;
  pollSeconds?: number;
  // Replaced only when sent
  ca?: string;
  credentials?: Record<string, string>;
}
