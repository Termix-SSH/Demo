import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import {
  parseStatusRanges,
  statusAccepted,
  type CheckResult,
} from "../../shared/types.js";
import { resolveTarget } from "../target-guard.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckEnv,
  type CheckTarget,
} from "./types.js";

export const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 1024 * 1024;

export function authHeaders(target: CheckTarget): Record<string, string> {
  const { authType, username } = target.config;
  const headers = { ...target.secrets.headers };
  if (authType === "basic") {
    const pair = `${username ?? ""}:${target.secrets.password ?? ""}`;
    headers.authorization = `Basic ${Buffer.from(pair).toString("base64")}`;
  } else if (authType === "bearer") {
    headers.authorization = `Bearer ${target.secrets.token ?? ""}`;
  }
  return headers;
}

interface HttpAnswer {
  status: number;
  location: string | undefined;
  /** Reads at most MAX_BODY_BYTES, then closes. */
  text: () => Promise<string>;
  close: () => void;
}

function decoded(response: http.IncomingMessage): Readable {
  const encoding = String(response.headers["content-encoding"] ?? "");
  if (encoding === "gzip") return response.pipe(zlib.createGunzip());
  if (encoding === "br") return response.pipe(zlib.createBrotliDecompress());
  if (encoding === "deflate") return response.pipe(zlib.createInflate());
  return response;
}

function readBody(
  response: http.IncomingMessage,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const stream = decoded(response);
    const timer = setTimeout(() => done(), timeoutMs);
    const done = () => {
      clearTimeout(timer);
      response.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total >= MAX_BODY_BYTES) done();
    });
    stream.on("end", done);
    stream.on("error", done);
    response.on("error", done);
  });
}

/** One request to an address the guard already approved. */
function send(
  url: URL,
  address: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs: number;
    ignoreTls: boolean;
    signal: AbortSignal;
  },
): Promise<HttpAnswer> {
  const secure = url.protocol === "https:";
  const name = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    const request = (secure ? https : http).request({
      host: address,
      port: url.port || (secure ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: options.method,
      headers: {
        host: url.host,
        "user-agent": "Termix-Uptime",
        accept: "*/*",
        ...options.headers,
      },
      servername: secure && !isIP(name) ? name : undefined,
      rejectUnauthorized: !options.ignoreTls,
      agent: false,
    } as https.RequestOptions);
    const stop = (error: Error) => request.destroy(error);
    const onAbort = () => stop(new Error("Stopped"));
    const timer = setTimeout(
      () => stop(new Error(`No answer in ${options.timeoutMs / 1000} s`)),
      options.timeoutMs,
    );
    const settle = () => {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    request.once("error", (error) => {
      settle();
      reject(error);
    });
    request.once("response", (response) => {
      settle();
      resolve({
        status: response.statusCode ?? 0,
        location: response.headers.location,
        text: () => readBody(response, options.timeoutMs),
        close: () => response.destroy(),
      });
    });
    request.end(options.body);
  });
}

export function keywordProblem(
  body: string,
  keyword: string | undefined,
  absent: boolean | undefined,
): string {
  if (!keyword) return "";
  const found = body.includes(keyword);
  if (absent && found) return `Found ${keyword}`;
  if (!absent && !found) return `Did not find ${keyword}`;
  return "";
}

/**
 * Uses node:http, not ctx.fetch, which writes an audit line per call. A check
 * runs all day, so that would bury the audit log. The guard runs on every hop
 * and the socket connects to the address it approved, which is what ctx.fetch
 * would do, so a redirect or a changing DNS answer can't reach a private
 * address without the permission.
 */
export async function checkHttp(
  target: CheckTarget,
  env: CheckEnv,
  resolve: typeof resolveTarget = resolveTarget,
): Promise<CheckResult> {
  const { config } = target;
  const ranges = parseStatusRanges(config.acceptedStatus || "200-299");
  if (!ranges) return failed("The accepted status list is not valid");
  const headers = authHeaders(target);
  const method = config.method ?? "GET";
  const started = performance.now();
  try {
    const first = new URL(config.url ?? "");
    let url = first;
    for (let hop = 0; ; hop++) {
      const { address } = await resolve(url.hostname, env.allowPrivate);
      const answer = await send(url, address, {
        method,
        // A redirect to another site never gets the login.
        headers: url.origin === first.origin ? headers : {},
        body: method === "POST" || method === "PUT" ? config.body : undefined,
        timeoutMs: target.timeoutSec * 1000,
        ignoreTls: config.ignoreTls === true,
        signal: env.signal,
      });
      const moved = answer.status >= 300 && answer.status < 400;
      if (moved && answer.location && config.followRedirects !== false) {
        answer.close();
        if (hop >= MAX_REDIRECTS) return failed("Too many redirects");
        url = new URL(answer.location, url);
        continue;
      }
      const latency = round(performance.now() - started);
      if (!statusAccepted(answer.status, ranges)) {
        answer.close();
        return failed(`Status ${answer.status}`, latency);
      }
      if (config.keyword && method !== "HEAD") {
        const problem = keywordProblem(
          await answer.text(),
          config.keyword,
          config.keywordAbsent,
        );
        if (problem) return failed(problem, latency);
      } else {
        answer.close();
      }
      return passed(`Status ${answer.status}`, latency);
    }
  } catch (error) {
    return failed(errorText(error));
  }
}
