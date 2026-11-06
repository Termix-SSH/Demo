export type Backend = "nut" | "apcupsd" | "snmp";

export type PowerState = "online" | "battery" | "bypass" | "off" | "unknown";

export type Flag =
  | "low-battery"
  | "replace-battery"
  | "overload"
  | "charging"
  | "calibrating"
  | "alarm"
  | "boost"
  | "trim";

/** One UPS reading, the same shape for every backend. Missing values are null. */
export interface Reading {
  state: PowerState;
  flags: Flag[];
  chargePct: number | null;
  runtimeSec: number | null;
  loadPct: number | null;
  inputV: number | null;
  outputV: number | null;
  batteryV: number | null;
  tempC: number | null;
  nominalW: number | null;
  manufacturer: string;
  model: string;
  serial: string;
  lastTest: string;
  /** The status text the UPS gave, for display. */
  rawStatus: string;
}

export interface SourceView {
  id: number;
  hostId: number;
  backend: Backend;
  label: string;
  target: string;
  snmpVersion: "1" | "2c" | "3";
  lowCharge: number;
  lowRuntimeMin: number;
  alerts: boolean;
  enabled: boolean;
  /** True when a login or community is saved. The value is never sent. */
  hasSecrets: boolean;
  reading: Reading | null;
  error: string;
  readAt: number | null;
}

export interface SourceInput {
  backend: Backend;
  label: string;
  target: string;
  snmpVersion?: "1" | "2c" | "3";
  lowCharge?: number;
  lowRuntimeMin?: number;
  alerts?: boolean;
  enabled?: boolean;
  secrets?: SourceSecrets;
}

export interface SourceSecrets {
  /** NUT login for commands. */
  nutUser?: string;
  nutPassword?: string;
  /** SNMP v1 and v2c. */
  community?: string;
  /** SNMP v3. */
  v3User?: string;
  v3Level?: "noAuthNoPriv" | "authNoPriv" | "authPriv";
  v3AuthProto?: "MD5" | "SHA";
  v3AuthPass?: string;
  v3PrivProto?: "DES" | "AES";
  v3PrivPass?: string;
}

export interface Detect {
  upsc: boolean;
  upscmd: boolean;
  apcaccess: boolean;
  snmpwalk: boolean;
  /** UPS names `upsc -l` lists on the host. */
  nutUps: string[];
  services: string[];
}

export interface HistoryPoint {
  t: number;
  c: number | null;
  r: number | null;
  l: number | null;
  i: number | null;
  o: number | null;
}

export type HistoryRange = "24h" | "7d" | "30d";

export interface UpsEvent {
  id: number;
  sourceId: number;
  at: number;
  type: string;
  text: string;
}

export interface UpsCommand {
  name: string;
  description: string;
  risk: "change" | "destructive";
}

export interface HostSummary {
  hostId: number;
  sourceId: number;
  label: string;
  backend: Backend;
  state: PowerState;
  flags: Flag[];
  chargePct: number | null;
  runtimeSec: number | null;
  loadPct: number | null;
  error: string;
}
