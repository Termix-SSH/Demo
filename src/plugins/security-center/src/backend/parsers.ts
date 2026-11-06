import { createHash } from "node:crypto";
import type { KeyEntry, KeyKind, Reading } from "../shared/types.js";

export interface PackageInfo {
  name: string;
  version: string;
}

export interface PackageList {
  root: boolean;
  os: Reading["os"];
  kernel: string;
  manager: "dpkg" | "rpm" | "apk" | "";
  packages: PackageInfo[];
}

const KEY_TYPES = [
  "ssh-rsa",
  "ssh-dss",
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
];

const KEY_RE = new RegExp(
  `(^|\\s)(${KEY_TYPES.map((t) => t.replace(/[.@]/g, "\\$&")).join("|")})\\s+([A-Za-z0-9+/]+={0,2})`,
  "g",
);

export interface ParsedPublicKey {
  type: string;
  bits: number | null;
  fingerprint: string;
  comment: string;
  options: string;
}

function readString(buf: Buffer, at: number): [Buffer, number] | null {
  if (at + 4 > buf.length) return null;
  const len = buf.readUInt32BE(at);
  if (at + 4 + len > buf.length) return null;
  return [buf.subarray(at + 4, at + 4 + len), at + 4 + len];
}

function bitLength(mpint: Buffer): number {
  let i = 0;
  while (i < mpint.length && mpint[i] === 0) i += 1;
  if (i >= mpint.length) return 0;
  return (mpint.length - i - 1) * 8 + (32 - Math.clz32(mpint[i]));
}

/** Bits of a key blob, or null when the layout is not known. */
export function keyBits(type: string, blob: Buffer): number | null {
  const first = readString(blob, 0);
  if (!first) return null;
  if (type === "ssh-rsa") {
    const e = readString(blob, first[1]);
    const n = e && readString(blob, e[1]);
    return n ? bitLength(n[0]) : null;
  }
  if (type === "ssh-dss") {
    const p = readString(blob, first[1]);
    return p ? bitLength(p[0]) : null;
  }
  if (type.startsWith("ecdsa-sha2-nistp")) {
    return Number(type.slice("ecdsa-sha2-nistp".length)) || null;
  }
  return 256;
}

export function fingerprintOf(blob: Buffer): string {
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

/** Reads one authorized_keys style line, with or without options. */
export function parsePublicKey(line: string): ParsedPublicKey | null {
  const text = line.trim();
  if (!text || text.startsWith("#")) return null;
  const re = new RegExp(KEY_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const before = text.slice(0, match.index);
    const quotes = (before.match(/(?<!\\)"/g) ?? []).length;
    if (quotes % 2 === 1) continue;
    const type = match[2];
    const blob = Buffer.from(match[3], "base64");
    const first = readString(blob, 0);
    if (!first || first[0].toString("utf8") !== type) return null;
    const rest = text.slice(match.index + match[0].length).trim();
    return {
      type,
      bits: keyBits(type, blob),
      fingerprint: fingerprintOf(blob),
      comment: rest.slice(0, 200),
      options: before.trim().slice(0, 400),
    };
  }
  return null;
}

/** The base64 part of a public key line, for removing it from a file. */
export function keyBlob(line: string): string | null {
  const match = new RegExp(KEY_RE.source).exec(line.trim());
  return match ? match[3] : null;
}

function restrictedOptions(options: string): boolean {
  return /(^|,)\s*(restrict|command=|from=)/i.test(options);
}

interface Section {
  name: string;
  args: string;
  lines: string[];
}

function sections(output: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const raw of output.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("@@")) {
      const space = line.search(/\s/);
      const name = space === -1 ? line.slice(2) : line.slice(2, space);
      current = {
        name,
        args: space === -1 ? "" : line.slice(space + 1),
        lines: [],
      };
      out.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return out;
}

/** File content lines come prefixed with "> ". */
function content(lines: string[]): string[] {
  return lines.filter((l) => l.startsWith("> ")).map((l) => l.slice(2));
}

function parseOs(lines: string[]): Reading["os"] {
  const vars: Record<string, string> = {};
  for (const line of content(lines)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return {
    id: (vars.ID ?? "").toLowerCase(),
    version: vars.VERSION_ID ?? "",
    name: vars.PRETTY_NAME ?? vars.NAME ?? "",
  };
}

function parseSettings(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content(lines)) {
    const m = /^\s*([A-Za-z0-9]+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (!(key in out) && Object.keys(out).length < 400) out[key] = m[2].trim();
  }
  return out;
}

function modeAndTime(field: string): { mode: string; mtime: number | null } {
  const [mode, time] = field.trim().split(/\s+/);
  const t = Number(time);
  return {
    mode: /^[0-7]{3,4}$/.test(mode ?? "") ? mode : "",
    mtime: Number.isFinite(t) && t > 0 ? t : null,
  };
}

/** Turns the output of KEYS_SCRIPT into a reading. Keys are not matched to logins yet. */
export function parseReading(output: string, now = Date.now()): Reading {
  const reading: Reading = {
    at: now,
    root: false,
    os: { id: "", version: "", name: "" },
    sshdVersion: "",
    sshd: {},
    sshdRead: false,
    keys: [],
    rebootRequired: false,
    notes: [],
  };
  const seen = new Map<string, number>();
  let fallback: Record<string, string> = {};
  for (const section of sections(output)) {
    if (section.name === "root") {
      reading.root = section.args.trim() === "0";
    } else if (section.name === "os") {
      reading.os = parseOs(section.lines);
    } else if (section.name === "sshdver") {
      reading.sshdVersion = (section.lines.find((l) => l.trim()) ?? "")
        .trim()
        .slice(0, 160);
    } else if (section.name === "sshd") {
      reading.sshd = parseSettings(section.lines);
      reading.sshdRead = Object.keys(reading.sshd).length > 0;
    } else if (section.name === "sshdconf") {
      fallback = parseSettings(section.lines);
    } else if (section.name === "reboot") {
      reading.rebootRequired = section.args.trim() === "1";
    } else if (section.name === "dir") {
      const [user, path, mode] = section.args.split("\t");
      const bits = parseInt(mode ?? "", 8);
      if (path && Number.isFinite(bits) && (bits & 0o022) !== 0) {
        reading.notes.push(`dir-writable|${user}|${path}|${mode}`);
      }
    } else if (section.name === "file") {
      const [kindRaw, user, path, stat, prot] = section.args.split("\t");
      if (!["authorized", "host", "private"].includes(kindRaw ?? "")) continue;
      const kind = kindRaw as KeyKind;
      if (!path) continue;
      const { mode, mtime } = modeAndTime(stat ?? "");
      for (const line of content(section.lines)) {
        const parsed = parsePublicKey(line);
        if (!parsed) continue;
        const base = `${kind}|${path}|${parsed.fingerprint}`;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const entry: KeyEntry = {
          id: n ? `${base}|${n}` : base,
          kind,
          user: user ?? "",
          path,
          type: parsed.type,
          bits: parsed.bits,
          fingerprint: parsed.fingerprint,
          comment: parsed.comment,
          options: parsed.options,
          restricted: restrictedOptions(parsed.options),
          mode,
          mtime,
          unprotected: kind === "private" && prot?.trim() === "0",
          known: false,
          knownAs: "",
        };
        reading.keys.push(entry);
      }
    }
  }
  if (!reading.sshdRead && Object.keys(fallback).length) {
    reading.sshd = fallback;
  }
  return reading;
}

/** Turns the output of PACKAGES_SCRIPT into a package list. */
export function parsePackages(output: string): PackageList {
  const list: PackageList = {
    root: false,
    os: { id: "", version: "", name: "" },
    kernel: "",
    manager: "",
    packages: [],
  };
  const seen = new Set<string>();
  const add = (name: string, version: string) => {
    if (!name || !version) return;
    const key = `${name}\u0000${version}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.packages.push({ name, version });
  };
  for (const section of sections(output)) {
    if (section.name === "root") {
      list.root = section.args.trim() === "0";
    } else if (section.name === "os") {
      list.os = parseOs(section.lines);
    } else if (section.name === "kernel") {
      list.kernel = (section.lines.find((l) => l.trim()) ?? "").trim();
    } else if (section.name === "pkgs") {
      const manager = section.args.trim();
      if (manager === "dpkg" || manager === "rpm" || manager === "apk") {
        list.manager = manager;
      }
      for (const line of section.lines) {
        if (!line.trim()) continue;
        if (manager === "dpkg") {
          const [status, src, srcVer, bin, binVer] = line.split("\t");
          if (!/^(ii|hi)/.test(status ?? "")) continue;
          add((src || bin || "").trim(), (srcVer || binVer || "").trim());
        } else if (manager === "rpm") {
          const [name, epoch, ver] = line.split("\t");
          if (!name || name === "gpg-pubkey") continue;
          const e = Number(epoch);
          add(name, e > 0 ? `${e}:${ver}` : (ver ?? ""));
        } else if (manager === "apk") {
          const m = /^(.+?)-(\d[^-]*-r\d+)$/.exec(line.trim());
          if (m) add(m[1], m[2]);
        }
      }
    }
  }
  return list;
}
