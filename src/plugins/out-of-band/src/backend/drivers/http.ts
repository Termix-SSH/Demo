import { createHash, randomBytes } from "node:crypto";
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

export function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "The BMC refused the login";
  if (status === 404) return "The BMC does not have this API";
  return `The BMC answered ${status}`;
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/** One request to a BMC. Private addresses are allowed for this BMC only. */
export async function send(
  target: Target,
  io: DriverIo,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<Response> {
  try {
    return await io.fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      timeoutMs: TIMEOUT_MS,
      allowPrivateHosts: [target.address.replace(/^\[|\]$/g, "")],
      tls: target.ca ? { ca: target.ca } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DriverError(`Could not reach the BMC: ${message}`);
  }
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function challengeField(header: string, name: string): string | undefined {
  const quoted = new RegExp(`${name}="([^"]*)"`, "i").exec(header);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${name}=([^,\\s]+)`, "i").exec(header);
  return bare?.[1];
}

/** HTTP digest, which Intel AMT requires. Two requests: the challenge, then the answer. */
export async function digestRequest(
  target: Target,
  io: DriverIo,
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
  user: string,
  password: string,
): Promise<Response> {
  const first = await send(target, io, url, init);
  if (first.status !== 401) return first;
  const header = first.headers.get("www-authenticate") ?? "";
  if (!/^digest/i.test(header)) return first;
  const realm = challengeField(header, "realm") ?? "";
  const nonce = challengeField(header, "nonce") ?? "";
  const opaque = challengeField(header, "opaque");
  const qop = challengeField(header, "qop")?.split(",")[0]?.trim();
  const path = new URL(url).pathname;
  const ha1 = md5(`${user}:${realm}:${password}`);
  const ha2 = md5(`${init.method}:${path}`);
  const cnonce = randomBytes(8).toString("hex");
  const nc = "00000001";
  const answer = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);
  const parts = [
    `username="${user}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${path}"`,
    `response="${answer}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  return send(target, io, url, {
    ...init,
    headers: { ...init.headers, authorization: `Digest ${parts.join(", ")}` },
  });
}
