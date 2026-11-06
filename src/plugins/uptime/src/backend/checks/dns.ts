import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import type { CheckResult } from "../../shared/types.js";
import { BlockedTargetError, isPrivateAddress } from "../target-guard.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckEnv,
  type CheckTarget,
} from "./types.js";

/** One line per record, so an expected value can match any of them. */
export function recordLines(records: unknown[]): string[] {
  return records.map((record) => {
    if (typeof record === "string") return record;
    if (Array.isArray(record)) return record.join("");
    const row = record as {
      exchange?: string;
      priority?: number;
      name?: string;
      port?: number;
    };
    if (row.exchange) return `${row.priority} ${row.exchange}`;
    if (row.name) return `${row.name}:${row.port}`;
    return JSON.stringify(record);
  });
}

export function matchRecords(
  lines: string[],
  expected: string | undefined,
): boolean {
  if (!expected) return lines.length > 0;
  const want = expected.trim().toLowerCase();
  return lines.some((line) => line.toLowerCase().includes(want));
}

export async function checkDns(
  target: CheckTarget,
  env: CheckEnv,
): Promise<CheckResult> {
  const { target: name = "", recordType = "A" } = target.config;
  const { dnsServer, expected } = target.config;
  try {
    const resolver = new Resolver({
      timeout: target.timeoutSec * 1000,
      tries: 1,
    });
    if (dnsServer) {
      if (!isIP(dnsServer)) {
        throw new Error("The DNS server must be an IP address");
      }
      if (!env.allowPrivate && isPrivateAddress(dnsServer)) {
        throw new BlockedTargetError(dnsServer);
      }
      resolver.setServers([dnsServer]);
    }
    const stop = () => resolver.cancel();
    env.signal.addEventListener("abort", stop, { once: true });
    const started = performance.now();
    try {
      const records = (await resolver.resolve(name, recordType)) as unknown[];
      const latency = round(performance.now() - started);
      const lines = recordLines(records);
      return matchRecords(lines, expected)
        ? passed(lines.slice(0, 3).join(", "), latency)
        : failed(`No record matches ${expected}`, latency);
    } finally {
      env.signal.removeEventListener("abort", stop);
    }
  } catch (error) {
    return failed(errorText(error));
  }
}
