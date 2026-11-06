import { DriverError, type DriverIo, type Target } from "./types.js";

const TIMEOUT_MS = 15_000;

export function baseUrl(target: Target, fallbackScheme = "https"): string {
  const scheme = target.options.scheme ?? fallbackScheme;
  const host =
    target.address.includes(":") && !target.address.startsWith("[")
      ? `[${target.address}]`
      : target.address;
  return `${scheme}://${host}:${target.port}`;
}

export function socketUrl(target: Target, path: string, scheme = "https") {
  return baseUrl(target, scheme).replace(/^http/, "ws") + path;
}

export function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "The KVM refused the login";
  if (status === 404) return "The KVM does not have this API";
  return `The KVM answered ${status}`;
}

/** One request to a KVM. Private addresses are allowed for this KVM only. */
export async function send(
  target: Target,
  io: DriverIo,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  try {
    const pin = target.options.pin;
    if (pin && url.startsWith("https:") && io.fetchPinned) {
      return await io.fetchPinned(url, pin, init);
    }
    return await io.fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      timeoutMs: init.timeoutMs ?? TIMEOUT_MS,
      signal: init.signal,
      allowPrivateHosts: [target.address.replace(/^\[|\]$/g, "")],
      tls: target.ca ? { ca: target.ca } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DriverError(`Could not reach the KVM: ${message}`);
  }
}

export async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new DriverError("The KVM sent an answer that is not JSON");
  }
}
