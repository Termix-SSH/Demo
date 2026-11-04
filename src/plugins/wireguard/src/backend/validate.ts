import { WireguardError } from "./errors.js";

const IFACE = /^[a-z][a-z0-9_-]{0,14}$/;
const CLIENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const HOST = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const V6 = /^[0-9A-Fa-f:]{2,39}$/;

/** Single quotes a value for a shell. */
export function q(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function isV4(value: string): boolean {
  const m = V4.exec(value);
  return !!m && m.slice(1).every((n) => Number(n) <= 255);
}

export function isV6(value: string): boolean {
  return V6.test(value) && value.includes(":") && !value.includes(":::");
}

function isIp(value: string): boolean {
  return isV4(value) || isV6(value);
}

/** An interface name wg-quick accepts. wgtx* belongs to the Tunnels plugin. */
export function ifaceName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!IFACE.test(name) || name.startsWith("wgtx")) {
    throw new WireguardError("The interface name is not valid");
  }
  return name;
}

export function clientName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!CLIENT.test(name)) {
    throw new WireguardError("The client name is not valid");
  }
  return name;
}

function cidr(value: string): string {
  const [ip = "", bits = "", ...rest] = value.split("/");
  const max = isV4(ip) ? 32 : isV6(ip) ? 128 : -1;
  if (rest.length || max < 0 || !/^\d{1,3}$/.test(bits) || Number(bits) > max) {
    throw new WireguardError(`${value} is not a valid address`);
  }
  return value;
}

/** One or more CIDR addresses, like 10.8.0.1/24, fd42::1/64. */
export function addressList(value: unknown): string[] {
  const raw = typeof value === "string" ? value : "";
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) {
    throw new WireguardError("The interface address is not valid");
  }
  const out = parts.map(cidr);
  const v4 = out.find((a) => isV4(a.split("/")[0] ?? ""));
  if (v4 && Number(v4.split("/")[1]) > 30) {
    throw new WireguardError("The IPv4 subnet is too small for clients");
  }
  return out;
}

export function port(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new WireguardError("The port is not valid");
  }
  return n;
}

/** host:port, with IPv6 hosts in brackets. Empty is allowed. */
export function endpoint(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const m = /^(\[[0-9A-Fa-f:]+\]|[^:\s]+):(\d{1,5})$/.exec(raw);
  const host = m?.[1] ?? "";
  const ok = host.startsWith("[")
    ? isV6(host.slice(1, -1))
    : isV4(host) || HOST.test(host);
  if (!m || !ok || Number(m[2]) < 1 || Number(m[2]) > 65535) {
    throw new WireguardError(
      "The endpoint must look like vpn.example.com:51820",
    );
  }
  return raw;
}

/** Comma separated DNS servers. Empty is allowed. */
export function dnsList(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length > 4 || !parts.every((p) => isIp(p) || HOST.test(p))) {
    throw new WireguardError("The DNS servers are not valid");
  }
  return parts.join(", ");
}

/** Comma separated CIDR ranges. Empty means everything. */
export function allowedList(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "0.0.0.0/0, ::/0";
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length > 32) throw new WireguardError("Too many allowed ranges");
  return parts.map(cidr).join(", ");
}

export function keepalive(value: unknown): number {
  if (value === undefined || value === null || value === "") return 25;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3600) {
    throw new WireguardError("The keepalive is not valid");
  }
  return n;
}

export function flag(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
