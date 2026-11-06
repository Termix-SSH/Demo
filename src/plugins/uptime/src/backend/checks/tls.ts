import tls from "node:tls";
import { isIP } from "node:net";
import type { CertInfo, CheckResult } from "../../shared/types.js";
import { resolveTarget } from "../target-guard.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckEnv,
  type CheckTarget,
} from "./types.js";

const DAY_MS = 86_400_000;

function issuerOf(issuer: unknown): string {
  const fields = issuer as { O?: string; CN?: string } | undefined;
  return fields?.O || fields?.CN || "";
}

export interface CertRead {
  cert: CertInfo;
  authorized: boolean;
  reason: string;
  latencyMs: number;
}

/** Reads a server's certificate. Trust is reported, not enforced here. */
export async function readCert(
  host: string,
  port: number,
  timeoutMs: number,
  allowPrivate: boolean,
  signal: AbortSignal,
): Promise<CertRead> {
  const { address } = await resolveTarget(host, allowPrivate);
  const started = performance.now();
  return new Promise<CertRead>((resolve, reject) => {
    const socket = tls.connect({
      host: address,
      port,
      servername: isIP(host) ? undefined : host,
      rejectUnauthorized: false,
    });
    const finish = (error: Error | null, read?: CertRead) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      socket.destroy();
      if (read) resolve(read);
      else reject(error);
    };
    const stop = () => finish(new Error("Stopped"));
    const timer = setTimeout(
      () => finish(new Error(`No answer in ${timeoutMs / 1000} s`)),
      timeoutMs,
    );
    signal.addEventListener("abort", stop, { once: true });
    socket.once("error", (error) => finish(error));
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      if (!peer?.valid_to) {
        finish(new Error("The server sent no certificate"));
        return;
      }
      const validTo = new Date(peer.valid_to);
      finish(null, {
        cert: {
          daysLeft: Math.floor((validTo.getTime() - Date.now()) / DAY_MS),
          validTo: validTo.toISOString(),
          issuer: issuerOf(peer.issuer),
        },
        authorized: socket.authorized,
        reason: String(socket.authorizationError ?? ""),
        latencyMs: round(performance.now() - started),
      });
    });
  });
}

export function judgeCert(
  cert: CertInfo,
  latencyMs: number | null,
  trust: { trusted: boolean; reason: string },
): CheckResult {
  if (cert.daysLeft < 0) {
    return { ...failed("The certificate has expired", latencyMs), cert };
  }
  if (!trust.trusted) {
    return {
      ...failed(trust.reason || "The certificate is not trusted", latencyMs),
      cert,
    };
  }
  return {
    ...passed(`Certificate is good for ${cert.daysLeft} days`, latencyMs),
    cert,
  };
}

export async function checkTls(
  target: CheckTarget,
  env: CheckEnv,
): Promise<CheckResult> {
  const { target: host = "", port = 443, ignoreTls } = target.config;
  try {
    const read = await readCert(
      host,
      port,
      target.timeoutSec * 1000,
      env.allowPrivate,
      env.signal,
    );
    return judgeCert(read.cert, read.latencyMs, {
      trusted: read.authorized || ignoreTls === true,
      reason: read.reason,
    });
  } catch (error) {
    return failed(errorText(error));
  }
}
