import { createHash } from "node:crypto";
import { parseKeys } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  GroupView,
  KeyView,
  PasswordState,
  SessionsView,
  UserDetail,
  UsersList,
  UsersStatus,
} from "../shared/types.js";
import { MARK } from "./scripts.js";

const NO_LOGIN = /(nologin|false|sync|shutdown|halt)$/;

function sections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = { "": [] };
  let current = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith(MARK)) {
      const [key, ...rest] = line.slice(MARK.length).split(" ");
      current = key;
      out[current] = rest.length ? [rest.join(" ")] : [];
    } else if (line) {
      out[current].push(line);
    }
  }
  return out;
}

export function parseStatus(
  stdout: string,
): Omit<UsersStatus, "canEdit" | "readOnly"> {
  const keys = parseKeys(stdout);
  const shells = stdout
    .split("\n")
    .filter((line) => line.startsWith("shell="))
    .map((line) => line.slice(6).trim())
    .filter(Boolean);
  const uidMin = Number(keys.uidmin);
  return {
    os: keys.os ?? "",
    user: keys.user ?? "",
    root: keys.root === "1",
    sudoGroup: keys.sudogroup ?? "",
    shells,
    uidMin: Number.isInteger(uidMin) && uidMin > 0 ? uidMin : 1000,
    tools: keys.tools === "1",
  };
}

/** The password state from a shadow password field. */
export function passwordState(field: string | undefined): PasswordState {
  if (field === undefined) return "unknown";
  if (field === "") return "empty";
  if (/^[!*]+$/.test(field) || field === "!*") return "none";
  if (field.startsWith("!")) return "locked";
  return "set";
}

function dayToDate(days: string): string {
  const n = Number(days);
  if (!days || !Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function parseList(stdout: string, uidMin: number): UsersList {
  const parts = sections(stdout);
  const me = parts.ME?.[0] ?? "";
  const now = Number(parts.NOW?.[0]) || Date.now() / 1000;
  const today = Math.floor(now / 86_400);
  const shadow = new Map<string, string[]>();
  for (const line of parts.SHADOW ?? []) {
    const cols = line.split(":");
    if (cols.length >= 8) shadow.set(cols[0], cols);
  }
  const rawGroups = (parts.GROUP ?? []).flatMap((line) => {
    const cols = line.split(":");
    if (cols.length < 4) return [];
    return [
      {
        name: cols[0],
        gid: Number(cols[2]),
        members: cols[3].split(",").filter(Boolean),
      },
    ];
  });
  const groupByGid = new Map(rawGroups.map((g) => [g.gid, g.name]));
  const sudoers = new Set(
    rawGroups
      .filter((g) => g.name === "sudo" || g.name === "wheel")
      .flatMap((g) => g.members),
  );
  const users = (parts.PASSWD ?? []).flatMap((line) => {
    const cols = line.split(":");
    if (cols.length < 7) return [];
    const uid = Number(cols[2]);
    const gid = Number(cols[3]);
    if (!Number.isFinite(uid)) return [];
    const group = groupByGid.get(gid) ?? String(gid);
    const sh = shadow.get(cols[0]);
    const expire = sh ? Number(sh[7]) : NaN;
    return [
      {
        name: cols[0],
        uid,
        gid,
        group,
        comment: cols[4].split(",")[0] ?? "",
        home: cols[5],
        shell: cols[6],
        groups: rawGroups
          .filter((g) => g.members.includes(cols[0]))
          .map((g) => g.name),
        sudo:
          uid === 0 ||
          sudoers.has(cols[0]) ||
          group === "sudo" ||
          group === "wheel",
        system: (uid < uidMin && uid !== 0) || uid === 65534,
        self: cols[0] === me,
        password: passwordState(sh?.[1]),
        expired: sh ? sh[7] !== "" && expire <= today : false,
        passwordChanged: sh ? dayToDate(sh[2]) : "",
        canLogin: !NO_LOGIN.test(cols[6]),
      },
    ];
  });
  const groups: GroupView[] = rawGroups.map((g) => ({
    ...g,
    primaryOf: users.filter((u) => u.gid === g.gid).map((u) => u.name),
    system: g.gid < uidMin || g.gid === 65534,
  }));
  return { users, groups };
}

/** OpenSSH style SHA256 fingerprint of a public key blob. */
export function fingerprint(base64: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(base64, "base64"))
    .digest("base64")
    .replace(/=+$/, "");
  return `SHA256:${digest}`;
}

const KEY_TYPE =
  /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)$/;

/** One authorized_keys line, or null for blanks, comments and junk. */
export function parseKeyLine(line: string, index: number): KeyView | null {
  const text = line.trim();
  if (!text || text.startsWith("#")) return null;
  const words = text.split(/\s+/);
  const at = words.findIndex((word) => KEY_TYPE.test(word));
  if (at < 0 || !words[at + 1]) return null;
  return {
    line: index,
    type: words[at],
    fingerprint: fingerprint(words[at + 1]),
    comment: words.slice(at + 2).join(" "),
    options: at > 0,
  };
}

/** Checks a key pasted by a user. Options are not allowed here. */
export function checkNewKey(text: string): string {
  const key = text.trim();
  if (/[\r\n]/.test(key)) throw new Error("Paste one key at a time");
  const words = key.split(/\s+/);
  if (
    !KEY_TYPE.test(words[0] ?? "") ||
    !/^[A-Za-z0-9+/]+=*$/.test(words[1] ?? "")
  ) {
    throw new Error("This is not an SSH public key");
  }
  return key;
}

export function parseDetail(stdout: string): UserDetail & { raw: string } {
  const parts = sections(stdout);
  const last = (parts.LAST ?? []).join(" ").trim();
  const denied = parts.DENIED !== undefined;
  const raw = (parts.KEYS ?? []).join("\n");
  const keyLines = raw.split("\n");
  return {
    lastLogin: /never logged in/i.test(last) ? "" : last.replace(/\s+/g, " "),
    loginKnown: parts.NOLOG === undefined,
    keys: keyLines
      .map((line, index) => parseKeyLine(line, index))
      .filter((key): key is KeyView => key !== null),
    keysError: denied ? "denied" : "",
    raw,
  };
}

export function parseSessions(stdout: string): SessionsView {
  const parts = sections(stdout);
  return {
    sessions: (parts.WHO ?? []).flatMap((line) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+(.+?)(?:\s+\((.*)\))?\s*$/);
      if (!match) return [];
      return [
        {
          user: match[1],
          tty: match[2],
          since: match[3],
          from: match[4] ?? "",
        },
      ];
    }),
    recent: parts.LAST ?? [],
  };
}
