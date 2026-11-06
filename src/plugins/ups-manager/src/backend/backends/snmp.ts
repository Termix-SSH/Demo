import { shellQuote, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Reading, SourceSecrets } from "../../shared/types.js";
import { UpsError } from "../errors.js";
import { addFlag, emptyReading, needs, num } from "./util.js";

/** RFC 1628 UPS-MIB and APC PowerNet. */
const STD = "1.3.6.1.2.1.33.1";
const APC = "1.3.6.1.4.1.318.1.1.1";

export const SNMP_TARGET_RE =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::\d{1,5})?$/;

const SECRET_RE = /^[^\s"'\u0000-\u001f]{1,128}$/;

function secret(value: string | undefined, label: string): string {
  const text = value ?? "";
  if (!SECRET_RE.test(text)) {
    throw new UpsError(
      `${label} must be 1 to 128 characters with no spaces or quotes`,
    );
  }
  return text;
}

/** The snmp.conf the script writes, so no secret is ever in argv. */
export function buildConf(
  version: "1" | "2c" | "3",
  secrets: SourceSecrets,
): string {
  const lines = [`defVersion ${version}`];
  if (version === "3") {
    const level = secrets.v3Level ?? "noAuthNoPriv";
    lines.push(`defSecurityName ${secret(secrets.v3User, "The SNMP user")}`);
    lines.push(`defSecurityLevel ${level}`);
    if (level !== "noAuthNoPriv") {
      lines.push(
        `defAuthType ${secrets.v3AuthProto === "MD5" ? "MD5" : "SHA"}`,
      );
      lines.push(
        `defAuthPassphrase ${secret(secrets.v3AuthPass, "The auth password")}`,
      );
    }
    if (level === "authPriv") {
      lines.push(
        `defPrivType ${secrets.v3PrivProto === "DES" ? "DES" : "AES"}`,
      );
      lines.push(
        `defPrivPassphrase ${secret(secrets.v3PrivPass, "The privacy password")}`,
      );
    }
  } else {
    lines.push(
      `defCommunity ${secret(secrets.community ?? "public", "The community")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function readScript(
  target: string,
  version: "1" | "2c" | "3",
  secrets: SourceSecrets,
): string {
  if (!SNMP_TARGET_RE.test(target)) {
    throw new UpsError("The SNMP address is not valid");
  }
  const conf = toBase64(buildConf(version, secrets));
  const walk = (oid: string) =>
    `SNMPCONFPATH="$T" snmpwalk -On -m '' -t 3 -r 1 -v ${version} udp:${target} ${oid}`;
  return [
    needs(
      "snmpwalk",
      "snmpwalk is not installed on this host. Install net-snmp (snmp).",
    ),
    "umask 077; T=$(mktemp -d) || exit 1; trap 'rm -rf \"$T\"' EXIT",
    `printf '%s' ${shellQuote(conf)} | base64 -d > "$T/snmp.conf"`,
    "echo '@@std@@'",
    `${walk(STD)} 2>&1 || true`,
    "echo '@@apc@@'",
    `${walk(APC)} 2>/dev/null || true`,
  ].join("\n");
}

/** `.1.3.6... = TYPE: value` lines to a map keyed by OID without the leading dot. */
export function parseWalk(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^\.?(\d+(?:\.\d+)+)\s*=\s*([A-Za-z0-9 -]+):\s*(.*)$/.exec(
      line.trim(),
    );
    if (!match) continue;
    let value = match[3].trim();
    if (match[2].toLowerCase().startsWith("timeticks")) {
      const ticks = /\((\d+)\)/.exec(value);
      value = ticks ? ticks[1] : value;
    } else if (
      value.startsWith('"') &&
      value.endsWith('"') &&
      value.length > 1
    ) {
      value = value.slice(1, -1);
    }
    map.set(match[1], value);
  }
  return map;
}

function first(map: Map<string, string>, prefix: string): string | undefined {
  const keys = [...map.keys()].filter((key) => key.startsWith(prefix)).sort();
  return keys.length ? map.get(keys[0]) : undefined;
}

function sections(output: string): { std: string; apc: string } {
  const [, rest = ""] = output.split("@@std@@\n");
  const [std, apc = ""] = rest.split("@@apc@@\n");
  return { std, apc };
}

export function parseSnmp(output: string): Reading {
  const { std, apc } = sections(output);
  const s = parseWalk(std);
  const a = parseWalk(apc);
  if (!s.size && !a.size) {
    const why = std
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    throw new UpsError(
      !why
        ? "The UPS card did not answer"
        : /No more variables|No Such (Object|Instance)/i.test(why)
          ? "The device answers SNMP but has no UPS data. Check the address and community."
          : why,
    );
  }
  const reading = emptyReading();
  const base = "1.3.6.1.2.1.33.1.";
  if (s.size) {
    reading.manufacturer = s.get(`${base}1.1.0`) ?? "";
    reading.model = s.get(`${base}1.2.0`) ?? "";
    const source = num(s.get(`${base}4.1.0`));
    reading.state =
      source === 3 || source === 6 || source === 7
        ? "online"
        : source === 5
          ? "battery"
          : source === 4
            ? "bypass"
            : source === 2
              ? "off"
              : "unknown";
    reading.rawStatus = source === null ? "" : `output source ${source}`;
    const battery = num(s.get(`${base}2.1.0`));
    if (battery === 3) addFlag(reading.flags, "low-battery");
    if (battery === 4) {
      addFlag(reading.flags, "low-battery");
      addFlag(reading.flags, "replace-battery");
    }
    reading.chargePct = num(s.get(`${base}2.4.0`));
    const minutes = num(s.get(`${base}2.3.0`));
    reading.runtimeSec = minutes === null ? null : minutes * 60;
    const dcTenths = num(s.get(`${base}2.5.0`));
    reading.batteryV = dcTenths === null ? null : dcTenths / 10;
    reading.tempC = num(s.get(`${base}2.7.0`));
    reading.inputV = num(first(s, `${base}3.3.1.3.`));
    reading.outputV = num(first(s, `${base}4.4.1.2.`));
    reading.loadPct = num(first(s, `${base}4.4.1.5.`));
    reading.nominalW = num(s.get(`${base}1.5.0`));
  }
  if (a.size) {
    const p = "1.3.6.1.4.1.318.1.1.1.";
    if (!reading.model) reading.model = a.get(`${p}1.1.1.0`) ?? "";
    if (!reading.serial) reading.serial = a.get(`${p}1.2.3.0`) ?? "";
    reading.chargePct ??= num(a.get(`${p}2.2.1.0`));
    if (reading.runtimeSec === null) {
      const ticks = num(a.get(`${p}2.2.3.0`));
      reading.runtimeSec = ticks === null ? null : Math.round(ticks / 100);
    }
    reading.tempC ??= num(a.get(`${p}2.2.2.0`));
    reading.inputV ??= num(a.get(`${p}3.2.1.0`));
    reading.outputV ??= num(a.get(`${p}4.2.1.0`));
    reading.loadPct ??= num(a.get(`${p}4.2.3.0`));
    if (reading.state === "unknown") {
      const out = num(a.get(`${p}4.1.1.0`));
      reading.state =
        out === 2 || out === 4 || out === 12
          ? "online"
          : out === 3
            ? "battery"
            : out === 6 || out === 9 || out === 10
              ? "bypass"
              : out === 7
                ? "off"
                : "unknown";
      reading.rawStatus = out === null ? "" : `output status ${out}`;
    }
    const replace = num(a.get(`${p}2.2.4.0`));
    if (replace === 2) addFlag(reading.flags, "replace-battery");
    if (num(a.get(`${p}2.1.1.0`)) === 3) addFlag(reading.flags, "low-battery");
  }
  return reading;
}
