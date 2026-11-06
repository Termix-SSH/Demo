import { DriverError, type DriverIo, type Target } from "./types.js";

const TIMEOUT_MS = 10_000;

export function baseUrl(target: Target, fallbackScheme = "https"): string {
  const scheme = target.options.scheme ?? fallbackScheme;
  const host =
    target.address.includes(":") && !target.address.startsWith("[")
      ? `[${target.address}]`
      : target.address;
  return `${scheme}://${host}:${target.port}`;
}

function describe(status: number): string {
  if (status === 401 || status === 403) {
    return "The device refused the login";
  }
  if (status === 404) return "The device does not have this API";
  return `The device answered ${status}`;
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/** A request to a device web API. Private addresses are allowed for this device only. */
export async function request(
  target: Target,
  io: DriverIo,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...init.headers,
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await io.fetch(url, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: TIMEOUT_MS,
      allowPrivateHosts: [target.address.replace(/^\[|\]$/g, "")],
      tls: target.ca ? { ca: target.ca } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DriverError(`Could not reach the device: ${message}`);
  }
  if (!response.ok) {
    throw new DriverError(describe(response.status), response.status);
  }
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    throw new DriverError("The device sent something that is not JSON");
  }
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export function int(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Runs a read that may be missing on this device and returns a fallback. */
export async function optional<T>(task: Promise<T>, fallback: T): Promise<T> {
  try {
    return await task;
  } catch {
    return fallback;
  }
}
