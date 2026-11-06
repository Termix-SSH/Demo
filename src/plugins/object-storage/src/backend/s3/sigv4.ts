import { createHash, createHmac } from "node:crypto";

export interface SignInput {
  method: string;
  url: string;
  region: string;
  headers?: Record<string, string>;
  // Hex sha256 of the body, or UNSIGNED-PAYLOAD
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
}

export const EMPTY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const sha256Hex = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** Strict URI encoding, as AWS wants it. */
export function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A key as a path: each segment encoded once, slashes kept. */
export function encodePath(value: string): string {
  return value.split("/").map(encode).join("/");
}

function canonicalQuery(search: URLSearchParams, skip?: string): string {
  return [...search.entries()]
    .filter(([k]) => k !== skip)
    .map(([k, v]) => [encode(k), encode(v)] as const)
    .sort((a, b) =>
      a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1,
    )
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function stamp(now: Date) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, day: amzDate.slice(0, 8) };
}

function signingKey(secret: string, day: string, region: string) {
  return hmac(
    hmac(hmac(hmac(`AWS4${secret}`, day), region), "s3"),
    "aws4_request",
  );
}

/** Signs an S3 request with Signature Version 4 and returns the headers to send. */
export function signS3(input: SignInput): Record<string, string> {
  const url = new URL(input.url);
  const { amzDate, day } = stamp(input.now ?? new Date());
  const headers: Record<string, string> = {
    ...input.headers,
    host: url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": input.payloadHash,
  };
  if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;

  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = String(v).trim().replace(/\s+/g, " ");
  }
  const names = Object.keys(lower).sort();
  const canonical = [
    input.method.toUpperCase(),
    url.pathname || "/",
    canonicalQuery(url.searchParams),
    names.map((n) => `${n}:${lower[n]}\n`).join(""),
    names.join(";"),
    input.payloadHash,
  ].join("\n");
  const scope = `${day}/${input.region}/s3/aws4_request`;
  const toSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonical),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(input.secretAccessKey, day, input.region),
  )
    .update(toSign, "utf8")
    .digest("hex");
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
  };
}

export interface PresignInput {
  method: string;
  url: string;
  region: string;
  expiresSeconds: number;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
}

/** A URL anyone can use until it expires, signed in the query string. */
export function presignS3(input: PresignInput): string {
  const url = new URL(input.url);
  const { amzDate, day } = stamp(input.now ?? new Date());
  const scope = `${day}/${input.region}/s3/aws4_request`;
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${input.accessKeyId}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(input.expiresSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", "host");
  if (input.sessionToken) {
    url.searchParams.set("X-Amz-Security-Token", input.sessionToken);
  }
  const canonical = [
    input.method.toUpperCase(),
    url.pathname || "/",
    canonicalQuery(url.searchParams),
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonical),
  ].join("\n");
  const signature = createHmac(
    "sha256",
    signingKey(input.secretAccessKey, day, input.region),
  )
    .update(toSign, "utf8")
    .digest("hex");
  url.searchParams.set("X-Amz-Signature", signature);
  // Re-encode the query the strict way so every client reads it the same
  const query = [...url.searchParams.entries()]
    .map(([k, v]) => `${encode(k)}=${encode(v)}`)
    .join("&");
  return `${url.origin}${url.pathname}?${query}`;
}
