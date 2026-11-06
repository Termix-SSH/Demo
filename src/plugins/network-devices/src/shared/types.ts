// Types shared by the backend routes and the frontend.

export type DriverId = "snmp" | "routeros" | "opnsense" | "openwrt";

export type DeviceStatus = "unknown" | "up" | "down";

export interface CredentialField {
  key: string;
  type: "text" | "secret" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface DriverFeatures {
  portControl: boolean;
  poe: boolean;
  reboot: boolean;
  clients: boolean;
  neighbors: boolean;
}

export interface DriverInfo {
  id: DriverId;
  defaultPort: number;
  // Whether the address is reached over http or https
  web: boolean;
  fields: CredentialField[];
  features: DriverFeatures;
}

export interface DeviceInfo {
  name: string;
  model?: string;
  version?: string;
  description?: string;
  uptimeSec?: number;
  // Percent, 0 to 100
  cpu?: number;
  memory?: number;
}

export interface PortPoe {
  enabled: boolean;
  // Watts being delivered, when the device reports it
  watts?: number;
  delivering?: boolean;
}

export interface PortInfo {
  id: string;
  name: string;
  description?: string;
  up: boolean;
  adminUp: boolean;
  speedMbps?: number;
  mac?: string;
  vlan?: number;
  rxBytes?: number;
  txBytes?: number;
  rxErrors?: number;
  txErrors?: number;
  poe?: PortPoe;
  // Filled in by the poller from two counter readings
  rxBps?: number;
  txBps?: number;
}

export interface ClientInfo {
  mac: string;
  ip?: string;
  name?: string;
  port?: string;
  kind: "dhcp" | "arp" | "wifi" | "table";
  // dBm for wifi clients
  signal?: number;
  vlan?: number;
}

export interface NeighborInfo {
  localPort: string;
  remoteName?: string;
  remotePort?: string;
  remoteMac?: string;
  remoteAddress?: string;
}

export interface Snapshot {
  at: string;
  info: DeviceInfo | null;
  ports: PortInfo[];
}

export interface TrafficPoint {
  at: number;
  rxBps: number;
  txBps: number;
}

export interface DeviceOptions {
  // http or https for the API drivers
  scheme?: "http" | "https";
  // SNMP only: 1, 2c or 3
  snmpVersion?: "1" | "2c" | "3";
  // Port ids that raise an alert when their link changes
  watchedPorts?: string[];
}

export interface Device {
  id: number;
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
  snapshot: Snapshot | null;
  traffic: TrafficPoint[];
}

export interface DeviceInput {
  name: string;
  driver?: DriverId;
  address: string;
  port?: number | null;
  options?: DeviceOptions;
  pollSeconds?: number;
  ca?: string;
  // Only sent when the keys are new or replaced
  credentials?: Record<string, string>;
}

export interface DiscoveryResult {
  address: string;
  driver: DriverId;
  name: string;
  description?: string;
  added: boolean;
}
