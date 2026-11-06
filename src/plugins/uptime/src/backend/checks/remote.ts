import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";
import type { CheckResult } from "../../shared/types.js";
import { parseStatusRanges, statusAccepted } from "../../shared/types.js";
import { authHeaders, keywordProblem } from "./http.js";
import { matchRecords } from "./dns.js";
import { parsePingLine } from "./ping.js";
import { judgeCert } from "./tls.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckTarget,
  type RemoteResult,
  type RemoteRun,
} from "./types.js";

const MARK = "__TERMIX_UPTIME__";
const DAY_MS = 86_400_000;

/** A value for a curl config file, which stays out of the command line. */
export function curlValue(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/** Headers and logins go on stdin, so they never show in the host's `ps`. */
export function curlConfig(target: CheckTarget): string {
  const { config } = target;
  const lines = [`url = ${curlValue(config.url ?? "")}`];
  lines.push(`request = ${curlValue(config.method ?? "GET")}`);
  for (const [name, value] of Object.entries(authHeaders(target))) {
    lines.push(`header = ${curlValue(`${name}: ${value}`)}`);
  }
  if (config.body && (config.method === "POST" || config.method === "PUT")) {
    lines.push(`data-raw = ${curlValue(config.body)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function curlCommand(target: CheckTarget): string {
  const { config } = target;
  const flags = ["-sS", "-K", "-", "--max-time", String(target.timeoutSec)];
  if (config.followRedirects !== false) flags.push("-L", "--max-redirs", "5");
  if (config.ignoreTls) flags.push("-k");
  if (config.method === "HEAD") flags.push("-I");
  flags.push("-w", shellQuote(`\n${MARK}%{http_code} %{time_total}`));
  return `curl ${flags.join(" ")}`;
}

export function judgeCurl(target: CheckTarget, run: RemoteResult): CheckResult {
  const { config } = target;
  if (run.code === 127) return failed("curl is not installed on that host");
  if (run.code !== 0) {
    return failed(run.stderr.trim().slice(0, 200) || `Exit code ${run.code}`);
  }
  const at = run.stdout.lastIndexOf(MARK);
  if (at < 0) return failed("curl gave no result");
  const [code, seconds] = run.stdout.slice(at + MARK.length).split(" ");
  const latency = round(Number(seconds) * 1000);
  const status = Number(code);
  const ranges = parseStatusRanges(config.acceptedStatus || "200-299");
  if (!ranges) return failed("The accepted status list is not valid");
  if (!statusAccepted(status, ranges)) {
    return failed(`Status ${status}`, latency);
  }
  const problem = keywordProblem(
    run.stdout.slice(0, at),
    config.keyword,
    config.keywordAbsent,
  );
  return problem
    ? failed(problem, latency)
    : passed(`Status ${status}`, latency);
}

export function judgeTcp(run: RemoteResult, port: number): CheckResult {
  if (run.timedOut || run.code !== 0)
    return failed(`Port ${port} did not answer`);
  const value = Number(run.stdout.trim());
  return passed(
    `Port ${port} answered`,
    Number.isFinite(value) ? round(value) : null,
  );
}

export function judgePing(run: RemoteResult): CheckResult {
  if (run.code === 127) return failed("ping is not installed on that host");
  const parsed = run.stdout
    .split("\n")
    .map(parsePingLine)
    .find((line) => line?.kind === "reply");
  return parsed?.kind === "reply"
    ? passed("Ping answered", round(parsed.ms))
    : failed("No ping reply");
}

export function judgeDns(
  run: RemoteResult,
  expected: string | undefined,
): CheckResult {
  if (run.code === 127) return failed("dig is not installed on that host");
  const lines = run.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[0] === "NO_TOOL") {
    return failed("dig is not installed on that host");
  }
  return matchRecords(lines, expected)
    ? passed(lines.slice(0, 3).join(", "), null)
    : failed(expected ? `No record matches ${expected}` : "No records");
}

export function judgeOpenssl(
  run: RemoteResult,
  ignoreTls: boolean,
): CheckResult {
  if (run.code === 127) return failed("openssl is not installed on that host");
  const end = /notAfter=(.+)/.exec(run.stdout)?.[1];
  if (!end) return failed("Could not read the certificate");
  const issuer = /issuer=.*?(?:O\s*=\s*([^,\n]+)|CN\s*=\s*([^,\n]+))/.exec(
    run.stdout,
  );
  const validTo = new Date(end.trim());
  const verify = /Verify return code: (\d+) \((.*)\)/.exec(run.stdout);
  return judgeCert(
    {
      daysLeft: Math.floor((validTo.getTime() - Date.now()) / DAY_MS),
      validTo: validTo.toISOString(),
      issuer: (issuer?.[1] ?? issuer?.[2] ?? "").trim(),
    },
    null,
    { trusted: ignoreTls || verify?.[1] === "0", reason: verify?.[2] ?? "" },
  );
}

/** Network checks run from a chosen host over SSH. */
export async function checkFromHost(
  target: CheckTarget,
  run: RemoteRun,
): Promise<CheckResult> {
  const hostId = target.fromHostId;
  if (!hostId) return failed("This monitor has no host to check from");
  const { config, runAs, timeoutSec } = target;
  // A little longer than the tools' own limit, so they report the failure.
  const limit = (timeoutSec + 5) * 1000;
  const on = (command: string, stdin?: string) =>
    run(hostId, runAs, command, stdin, limit);
  try {
    switch (target.type) {
      case "http":
        return judgeCurl(
          target,
          await on(curlCommand(target), curlConfig(target)),
        );
      case "tcp": {
        const host = shellQuote(config.target ?? "");
        const port = Number(config.port);
        const script = `s=$(date +%s%N); if timeout ${timeoutSec} bash -c "exec 3<>/dev/tcp/"${host}"/${port}" 2>/dev/null; then e=$(date +%s%N); echo $(( (e - s) / 1000000 )); else exit 1; fi`;
        return judgeTcp(await on(script), port);
      }
      case "ping":
        return judgePing(
          await on(
            `ping -n -c 1 -W ${Math.min(timeoutSec, 10)} ${shellQuote(config.target ?? "")}`,
          ),
        );
      case "dns": {
        const name = shellQuote(config.target ?? "");
        const type = shellQuote(config.recordType ?? "A");
        const server = config.dnsServer
          ? ` ${shellQuote(`@${config.dnsServer}`)}`
          : "";
        const script = `if command -v dig >/dev/null; then dig +short +time=${Math.min(timeoutSec, 10)} +tries=1${server} ${name} ${type}; elif [ ${type} = A ]; then getent ahostsv4 ${name} | awk '{print $1}' | sort -u; else echo NO_TOOL; fi`;
        return judgeDns(await on(script), config.expected);
      }
      case "tls": {
        const host = config.target ?? "";
        const port = Number(config.port ?? 443);
        const address = shellQuote(`${host}:${port}`);
        const script = `out=$(timeout ${timeoutSec} openssl s_client -connect ${address} -servername ${shellQuote(host)} </dev/null 2>/dev/null) || true; printf '%s\\n' "$out" | grep 'Verify return code' | head -1; printf '%s' "$out" | openssl x509 -noout -enddate -issuer`;
        return judgeOpenssl(await on(script), config.ignoreTls === true);
      }
      default:
        return failed("This type can't run from a host");
    }
  } catch (error) {
    return failed(errorText(error));
  }
}
