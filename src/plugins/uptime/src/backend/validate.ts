import { isContainerId, isUnit } from "@termix-ssh/plugin-sdk/host-scripts";
import {
  DNS_RECORD_TYPES,
  HTTP_METHODS,
  MONITOR_TYPES,
  REMOTE_TYPES,
  SSH_TYPES,
  parseStatusRanges,
  type AuthType,
  type DnsRecordType,
  type HttpMethod,
  type MonitorConfig,
  type MonitorInput,
  type MonitorSecrets,
  type MonitorType,
} from "../shared/types.js";

export class InputError extends Error {}

export const MAX_MONITORS_PER_USER = 500;
export const SSH_MIN_INTERVAL = 60;
const MAX_INTERVAL = 86_400;
const MAX_TEXT = 2000;
const MAX_HEADERS = 30;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
// Stays strict: this text ends up inside a shell string on a Check from host.
const HOST_NAME = /^[a-zA-Z0-9._:-]{1,253}$/;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function whole(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function port(value: unknown): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new InputError("A port from 1 to 65535 is required");
  }
  return number;
}

function hostName(value: unknown): string {
  const name = text(value, 253).replace(/^\[|\]$/g, "");
  if (!HOST_NAME.test(name)) {
    throw new InputError("A valid host name or address is required");
  }
  return name;
}

function hostId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new InputError("That host is not valid");
  }
  return number;
}

function configFor(type: MonitorType, raw: MonitorConfig): MonitorConfig {
  switch (type) {
    case "http": {
      const url = text(raw.url);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new InputError("A full URL is required");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new InputError("Only http and https URLs work");
      }
      if (parsed.username || parsed.password) {
        throw new InputError("Use the login fields, not the URL");
      }
      const accepted = text(raw.acceptedStatus, 100) || "200-299";
      if (!parseStatusRanges(accepted)) {
        throw new InputError("Accepted status must look like 200-299,301");
      }
      const method = HTTP_METHODS.includes(raw.method as HttpMethod)
        ? (raw.method as HttpMethod)
        : "GET";
      const authType: AuthType =
        raw.authType === "basic" || raw.authType === "bearer"
          ? raw.authType
          : "none";
      return {
        url,
        method,
        body: text(raw.body, 64_000),
        acceptedStatus: accepted,
        keyword: text(raw.keyword, 200),
        keywordAbsent: raw.keywordAbsent === true,
        ignoreTls: raw.ignoreTls === true,
        followRedirects: raw.followRedirects !== false,
        authType,
        username: text(raw.username, 200),
        certWarnDays: whole(raw.certWarnDays, 0, 365, 14),
      };
    }
    case "tcp":
      return { target: hostName(raw.target), port: port(raw.port) };
    case "ping":
      return { target: hostName(raw.target) };
    case "dns": {
      const server = text(raw.dnsServer, 64);
      if (server && !HOST_NAME.test(server)) {
        throw new InputError("The DNS server must be an IP address");
      }
      return {
        target: hostName(raw.target),
        recordType: DNS_RECORD_TYPES.includes(raw.recordType as DnsRecordType)
          ? raw.recordType
          : "A",
        dnsServer: server,
        expected: text(raw.expected, 300),
      };
    }
    case "tls":
      return {
        target: hostName(raw.target),
        port: raw.port ? port(raw.port) : 443,
        ignoreTls: raw.ignoreTls === true,
        certWarnDays: whole(raw.certWarnDays, 0, 365, 14),
      };
    case "push":
      return { graceSec: whole(raw.graceSec, 0, MAX_INTERVAL, 60) };
    case "host":
      return { port: raw.port ? port(raw.port) : undefined };
    case "docker": {
      const container = text(raw.container, 200);
      if (!isContainerId(container)) {
        throw new InputError("A container name is required");
      }
      return { container };
    }
    case "systemd": {
      const unit = text(raw.unit, 200);
      if (!isUnit(unit)) throw new InputError("A unit name is required");
      return { unit };
    }
    case "command": {
      const command = text(raw.command, 4000);
      if (!command) throw new InputError("A command is required");
      return {
        command,
        keyword: text(raw.keyword, 200),
        keywordAbsent: raw.keywordAbsent === true,
      };
    }
  }
}

function secretsFrom(raw: unknown): MonitorSecrets | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as MonitorSecrets;
  const secrets: MonitorSecrets = {};
  if (typeof input.password === "string") secrets.password = input.password;
  if (typeof input.token === "string") secrets.token = input.token;
  if (input.headers && typeof input.headers === "object") {
    const entries = Object.entries(input.headers).filter(
      ([name, value]) =>
        /^[A-Za-z0-9-]{1,100}$/.test(name) &&
        typeof value === "string" &&
        !/[\r\n]/.test(value),
    );
    if (entries.length > MAX_HEADERS) {
      throw new InputError(`Up to ${MAX_HEADERS} headers`);
    }
    secrets.headers = Object.fromEntries(entries);
  }
  return secrets;
}

export interface Limits {
  minIntervalSec: number;
  defaultIntervalSec: number;
}

export function parseMonitor(raw: unknown, limits: Limits): MonitorInput {
  const body = (raw ?? {}) as Partial<MonitorInput>;
  const name = text(body.name, 120);
  if (!name) throw new InputError("A name is required");
  const type = body.type as MonitorType;
  if (!MONITOR_TYPES.includes(type)) {
    throw new InputError("That monitor type is not known");
  }
  const ssh = SSH_TYPES.includes(type);
  const config = configFor(type, (body.config ?? {}) as MonitorConfig);
  const hostIdValue = hostId(body.hostId);
  if ((ssh || type === "host") && !hostIdValue) {
    throw new InputError("Pick a host");
  }
  const fromHostId = REMOTE_TYPES.includes(type)
    ? hostId(body.fromHostId)
    : null;
  const least = Math.max(
    limits.minIntervalSec,
    ssh || fromHostId ? SSH_MIN_INTERVAL : 0,
  );
  const intervalSec = whole(
    body.intervalSec,
    least,
    MAX_INTERVAL,
    ssh ? 300 : Math.max(limits.defaultIntervalSec, least),
  );
  const timeoutSec = whole(
    body.timeoutSec,
    1,
    Math.min(intervalSec, ssh ? 120 : 60),
    ssh ? 30 : 10,
  );
  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.map((tag) => text(tag, 60)).filter(Boolean))].slice(
        0,
        20,
      )
    : [];
  return {
    name,
    type,
    groupName: text(body.groupName, 120),
    tags,
    config,
    secrets: secretsFrom(body.secrets),
    hostId: hostIdValue,
    fromHostId,
    intervalSec,
    retries: whole(body.retries, 0, 10, type === "push" ? 0 : 1),
    retryIntervalSec: whole(body.retryIntervalSec, 5, intervalSec, 30),
    timeoutSec,
    resendMinutes: whole(body.resendMinutes, 0, 10_080, 0),
    enabled: body.enabled !== false,
  };
}

export function parseSlug(value: unknown): string {
  const slug = text(value, 64).toLowerCase();
  if (!SLUG.test(slug)) {
    throw new InputError("Use lower case letters, numbers and dashes");
  }
  return slug;
}

export { text as cleanText };
