import { parseKeys } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  Backend,
  Detect,
  Reading,
  SourceSecrets,
  UpsCommand,
} from "../shared/types.js";
import { parseApcupsd, readScript as apcScript } from "./backends/apcupsd.js";
import {
  listCommandsScript,
  parseCommands,
  parseNut,
  readScript as nutScript,
  runCommandScript,
} from "./backends/nut.js";
import { parseSnmp, readScript as snmpScript } from "./backends/snmp.js";
import { UpsError } from "./errors.js";
import type { Remote } from "./remote.js";

export interface Target {
  hostId: number;
  backend: Backend;
  target: string;
  snmpVersion: "1" | "2c" | "3";
}

/** One reading from a UPS, whatever it speaks. */
export async function readTarget(
  remote: Remote,
  target: Target,
  secrets: SourceSecrets,
): Promise<Reading> {
  if (target.backend === "nut") {
    return parseNut(await remote.run(target.hostId, nutScript(target.target)));
  }
  if (target.backend === "apcupsd") {
    return parseApcupsd(
      await remote.run(target.hostId, apcScript(target.target)),
    );
  }
  return parseSnmp(
    await remote.run(
      target.hostId,
      snmpScript(target.target, target.snmpVersion, secrets),
      40_000,
    ),
  );
}

export async function listCommands(
  remote: Remote,
  target: Target,
): Promise<UpsCommand[]> {
  if (target.backend !== "nut") {
    throw new UpsError("Only NUT UPS devices take commands", 400, {
      code: "unsupported",
    });
  }
  return parseCommands(
    await remote.run(target.hostId, listCommandsScript(target.target)),
  );
}

export async function runCommand(
  remote: Remote,
  target: Target,
  command: string,
  secrets: SourceSecrets,
): Promise<string> {
  if (target.backend !== "nut") {
    throw new UpsError("Only NUT UPS devices take commands", 400, {
      code: "unsupported",
    });
  }
  const login =
    secrets.nutUser && secrets.nutPassword
      ? { user: secrets.nutUser, password: secrets.nutPassword }
      : null;
  const out = await remote.run(
    target.hostId,
    runCommandScript(target.target, command, login),
  );
  return out.trim();
}

/** What a host has: which tools, which NUT devices and which services run. */
export const DETECT_SCRIPT = [
  'has() { command -v "$1" >/dev/null 2>&1; }',
  "echo '@@detect@@'",
  'for c in upsc upscmd apcaccess snmpwalk; do if has $c; then echo "$c=1"; else echo "$c=0"; fi; done',
  "echo '@@nut@@'",
  "if has upsc; then upsc -l 2>/dev/null; fi",
  "echo '@@services@@'",
  "if has systemctl; then for s in nut-server nut-monitor nut-driver apcupsd; do systemctl is-active --quiet $s 2>/dev/null && echo $s; done; fi",
  "true",
].join("\n");

export function parseDetect(output: string): Detect {
  const parts = output.split(/^@@(\w+)@@$/m);
  const sections: Record<string, string> = {};
  for (let at = 1; at < parts.length; at += 2)
    sections[parts[at]] = parts[at + 1] ?? "";
  const keys = parseKeys(sections.detect ?? "");
  const lines = (text: string | undefined) =>
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  return {
    upsc: keys.upsc === "1",
    upscmd: keys.upscmd === "1",
    apcaccess: keys.apcaccess === "1",
    snmpwalk: keys.snmpwalk === "1",
    nutUps: lines(sections.nut).filter((name) =>
      /^[A-Za-z0-9._@:-]+$/.test(name),
    ),
    services: lines(sections.services),
  };
}
