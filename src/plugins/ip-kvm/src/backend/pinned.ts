import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import type { LookupFunction } from "node:net";
import { resolveTarget } from "@termix-ssh/plugin-sdk/net-guard";
import { Readable } from "node:stream";
import type { PeerCertificate } from "../shared/types.js";

export type { PeerCertificate };

/** SHA-256 fingerprint as Node prints it: 32 hex pairs joined by colons. */
export const PIN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function normalizePin(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * An agent whose sockets only finish connecting when the device shows the
 * exact pinned certificate. Many KVMs ship a self signed certificate made
 * before their clock was set (CN=localhost, expired in 1979), so normal
 * checks can never pass. Nothing is sent until the fingerprint matches.
 */
export class PinnedAgent extends https.Agent {
  constructor(private readonly pin: string) {
    super({ keepAlive: false });
  }

  override createConnection(
    options: tls.ConnectionOptions,
    done?: (error: Error | null, socket?: tls.TLSSocket) => void,
  ): undefined {
    const socket = tls.connect({ ...options, rejectUnauthorized: false });
    socket.once("secureConnect", () => {
      const seen = socket.getPeerCertificate()?.fingerprint256 ?? "";
      if (seen.toUpperCase() !== this.pin) {
        socket.destroy();
        done?.(new Error("The KVM certificate does not match the pinned one"));
        return;
      }
      done?.(null, socket);
    });
    socket.once("error", (error) => done?.(error));
    return undefined;
  }
}

export interface NodeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** A fetch over the pinned agent, returning a web Response like ctx.fetch. */
export function pinnedFetch(
  url: string,
  pin: string,
  init: NodeFetchInit,
): Promise<Response> {
  return nodeFetch(url, init, { agent: new PinnedAgent(pin) });
}

/**
 * A fetch whose body streams as it arrives, for video. ctx.fetch hands the
 * body over only once it ends, which a stream never does. Only reaches the
 * saved device: a private address is refused unless it is that device's.
 * Redirects are not followed.
 */
export async function streamFetch(
  url: string,
  init: NodeFetchInit & { ca?: string; allowPrivateHosts: string[] },
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https are allowed");
  }
  const { address, family } = await resolveTarget(parsed.hostname, {
    allowPrivateHosts: init.allowPrivateHosts,
  });
  const lookup = ((_host, options, done) => {
    if (typeof options === "object" && options?.all) {
      done(null, [{ address, family }]);
    } else {
      done(null, address, family);
    }
  }) as LookupFunction;
  return nodeFetch(url, init, {
    lookup,
    ...(parsed.protocol === "https:" && init.ca ? { ca: init.ca } : {}),
  });
}

function nodeFetch(
  url: string,
  init: NodeFetchInit,
  options: https.RequestOptions,
): Promise<Response> {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        ...options,
        method: init.method ?? "GET",
        headers: init.headers,
        timeout: init.timeoutMs,
      },
      (response) => {
        // The timeout covers getting an answer, not a long video stream.
        request.setTimeout(0);
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value))
            for (const v of value) headers.append(key, v);
          else if (value != null) headers.set(key, String(value));
        }
        const status = response.statusCode ?? 0;
        const empty = status === 204 || status === 304;
        if (empty) response.resume();
        resolve(
          new Response(
            empty ? null : (Readable.toWeb(response) as ReadableStream),
            { status, headers },
          ),
        );
      },
    );
    request.on("timeout", () =>
      request.destroy(new Error("The KVM did not answer in time")),
    );
    request.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(new Error("aborted"));
      init.signal.addEventListener("abort", () =>
        request.destroy(new Error("aborted")),
      );
    }
    request.end(init.body);
  });
}

/** Reads the certificate a device shows, without trusting it. */
export function readCertificate(
  address: string,
  port: number,
  timeoutMs = 10_000,
): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: address,
      port,
      rejectUnauthorized: false,
      servername: /^[\d.:[\]]+$/.test(address) ? undefined : address,
      timeout: timeoutMs,
    });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.fingerprint256) {
        reject(new Error("The KVM did not send a certificate"));
        return;
      }
      const name = (part: Record<string, unknown> | undefined) =>
        String(part?.CN ?? part?.O ?? "");
      resolve({
        fingerprint: cert.fingerprint256.toUpperCase(),
        subject: name(cert.subject as never),
        issuer: name(cert.issuer as never),
        validTo: cert.valid_to,
        expired: Date.parse(cert.valid_to) < Date.now(),
        selfSigned:
          JSON.stringify(cert.subject) === JSON.stringify(cert.issuer),
      });
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("The KVM did not answer in time"));
    });
    socket.once("error", reject);
  });
}
