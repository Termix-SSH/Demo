export type Backend = "nut" | "apcupsd" | "snmp";

export type PowerState = "online" | "battery" | "bypass" | "off" | "unknown";

export type PowerOrigin = "reported" | "calculated-dc" | "unavailable";
export type LoadOrigin = "reported" | "estimated" | "unavailable";

export interface ElectricalReading {
  inputCurrentA: number | null;
  outputCurrentA: number | null;
  batteryCurrentA: number | null;
  inputPowerW: number | null;
  outputPowerW: number | null;
  inputPowerOrigin: PowerOrigin;
  outputPowerOrigin: PowerOrigin;
}

export interface NutDetails {
  batteryType: string;
  batteryChargeLow: number | null;
  batteryChargeWarning: number | null;
  batteryManufactured: string;
  driver: string;
  driverVersion: string;
  subdriver: string;
  driverState: string;
  vendorId: string;
  productId: string;
  variables: Record<string, string>;
}

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
  loadOrigin?: LoadOrigin;
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
  /** Optional for older persisted readings and backends without electrical data. */
  electrical?: ElectricalReading;
  nut?: NutDetails;
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
  inputDc?: boolean;
  outputDc?: boolean;
  energy?: EnergyReport;
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
  /** Explicit DC confirmation; never inferred from the model or voltage. */
  inputDc?: boolean;
  outputDc?: boolean;
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

export interface EnergyEpoch {
  id: string;
  identity: string;
  origin: PowerOrigin;
  startedAt: number;
  lastAt: number;
  observedWh: number;
  coveredSec: number;
}

export interface EnergyPoint {
  t: number;
  end: number;
  epoch: string;
  wh: number;
  coveredSec: number;
  observedSec: number;
  outputW: number | null;
  minW: number | null;
  maxW: number | null;
  inputW: number | null;
  inputA: number | null;
  outputA: number | null;
  batteryA: number | null;
}

export interface EnergyReport {
  epochs: EnergyEpoch[];
  /** Current physical identity/method only. Earlier epochs remain separate. */
  current: EnergyEpoch | null;
  persistenceError: string;
  correlationStatus: "timestamped-service-required";
}

export interface EnergyHistory extends EnergyReport {
  range: HistoryRange;
  start: number;
  end: number;
  points: EnergyPoint[];
  observedWh: number;
  coveredSec: number;
  eligibleSec: number;
  coveragePct: number;
  averageW: number | null;
  sampledPeakW: number | null;
  incomplete: boolean;
  resolutionSec: number;
}

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
  loadOrigin?: LoadOrigin;
  error: string;
  outputPowerW?: number | null;
  outputPowerOrigin?: PowerOrigin;
  observedOutputWh?: number | null;
  energyError?: string;
}
