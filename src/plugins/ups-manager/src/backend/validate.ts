import type { Backend, SourceInput, SourceSecrets } from "../shared/types.js";
import { SNMP_TARGET_RE } from "./backends/snmp.js";
import { UpsError } from "./errors.js";

export const NUT_TARGET_RE =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:@[A-Za-z0-9][A-Za-z0-9.-]{0,252}(?::\d{1,5})?)?$/;
export const APC_TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}(?::\d{1,5})?$/;
const LOGIN_RE = /^[A-Za-z0-9._@-]{1,64}$/;
const PASSWORD_RE = /^[^\u0000-\u001f]{1,128}$/;

export const BACKENDS: Backend[] = ["nut", "apcupsd", "snmp"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function int(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string,
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UpsError(`${label} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

export function requireId(value: unknown, what: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new UpsError(`The ${what} id is not valid`);
  }
  return n;
}

/** Secrets that came in the request. Empty text means keep what is saved. */
export function parseSecrets(value: unknown): SourceSecrets {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: SourceSecrets = {};
  const nutUser = text(raw.nutUser);
  if (nutUser) {
    if (!LOGIN_RE.test(nutUser))
      throw new UpsError("The NUT user is not valid");
    out.nutUser = nutUser;
  }
  const password = typeof raw.nutPassword === "string" ? raw.nutPassword : "";
  if (password) {
    if (!PASSWORD_RE.test(password))
      throw new UpsError("The NUT password is not valid");
    out.nutPassword = password;
  }
  for (const key of [
    "community",
    "v3User",
    "v3AuthPass",
    "v3PrivPass",
  ] as const) {
    const v = typeof raw[key] === "string" ? (raw[key] as string) : "";
    if (v) out[key] = v;
  }
  if (
    raw.v3Level === "noAuthNoPriv" ||
    raw.v3Level === "authNoPriv" ||
    raw.v3Level === "authPriv"
  )
    out.v3Level = raw.v3Level;
  if (raw.v3AuthProto === "MD5" || raw.v3AuthProto === "SHA")
    out.v3AuthProto = raw.v3AuthProto;
  if (raw.v3PrivProto === "DES" || raw.v3PrivProto === "AES")
    out.v3PrivProto = raw.v3PrivProto;
  return out;
}

export interface ParsedSource {
  backend: Backend;
  label: string;
  target: string;
  snmpVersion: "1" | "2c" | "3";
  lowCharge: number;
  lowRuntimeMin: number;
  alerts: boolean;
  enabled: boolean;
  secrets: SourceSecrets;
}

/** Checks a source from a request. Throws UpsError with a plain message. */
export function parseSource(body: Record<string, unknown>): ParsedSource {
  const input = body as Partial<SourceInput>;
  const backend = text(input.backend) as Backend;
  if (!BACKENDS.includes(backend))
    throw new UpsError("Pick NUT, apcupsd or SNMP");
  const label = text(input.label);
  if (!label || label.length > 80)
    throw new UpsError("Give the UPS a name of up to 80 characters");
  const target = text(input.target);
  if (backend === "nut" && !NUT_TARGET_RE.test(target)) {
    throw new UpsError("The NUT name looks like ups or ups@host:3493");
  }
  if (backend === "apcupsd" && target && !APC_TARGET_RE.test(target)) {
    throw new UpsError("The apcupsd address looks like host or host:3551");
  }
  if (backend === "snmp" && !SNMP_TARGET_RE.test(target)) {
    throw new UpsError("The SNMP address looks like 192.168.1.20 or host:161");
  }
  const version = text(input.snmpVersion) || "2c";
  if (version !== "1" && version !== "2c" && version !== "3") {
    throw new UpsError("SNMP version must be 1, 2c or 3");
  }
  return {
    backend,
    label,
    target,
    snmpVersion: version,
    lowCharge: int(input.lowCharge, 30, 1, 99, "Low charge"),
    lowRuntimeMin: int(input.lowRuntimeMin, 5, 0, 600, "Low runtime"),
    alerts: input.alerts !== false,
    enabled: input.enabled !== false,
    secrets: parseSecrets(input.secrets),
  };
}
