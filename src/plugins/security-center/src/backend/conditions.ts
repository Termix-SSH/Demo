import type {
  Finding,
  Health,
  HostConfig,
  Reading,
  Severity,
  Vuln,
} from "../shared/types.js";

export const UNREACHABLE_AFTER = 3;

export const KINDS = [
  "key-dsa",
  "key-rsa-small",
  "key-unprotected",
  "key-private-perms",
  "authkeys-writable",
  "ssh-dir-writable",
  "key-stale",
  "key-unknown",
  "root-key-open",
  "sshd-root-login",
  "sshd-password-auth",
  "sshd-empty-passwords",
  "sshd-weak-crypto",
  "unreachable",
] as const;

export type Kind = (typeof KINDS)[number];

export const SEVERITY: Record<Kind, Severity> = {
  "key-dsa": "critical",
  "key-rsa-small": "high",
  "key-unprotected": "high",
  "key-private-perms": "high",
  "authkeys-writable": "critical",
  "ssh-dir-writable": "high",
  "key-stale": "medium",
  "key-unknown": "low",
  "root-key-open": "low",
  "sshd-root-login": "medium",
  "sshd-password-auth": "medium",
  "sshd-empty-passwords": "critical",
  "sshd-weak-crypto": "medium",
  unreachable: "medium",
};

export const DEFAULT_LIMITS: Pick<HostConfig, "minRsaBits" | "keyMaxAgeDays"> =
  { minRsaBits: 3072, keyMaxAgeDays: 0 };

const WEAK_CIPHER = /(^|,)(3des-cbc|arcfour\d*|blowfish-cbc|cast128-cbc)(,|$)/i;
const WEAK_KEX =
  /(^|,)(diffie-hellman-group1-sha1|diffie-hellman-group14-sha1|diffie-hellman-group-exchange-sha1)(,|$)/i;
const WEAK_MAC = /(^|,)(hmac-md5[a-z0-9@.-]*|hmac-sha1-96[a-z0-9@.-]*)(,|$)/i;

function finding(
  kind: Kind,
  subject: string,
  title: string,
  detail = "",
): Finding {
  return {
    key: `${kind}|${subject}`,
    kind,
    subject,
    severity: SEVERITY[kind],
    title,
    detail,
  };
}

function open(mode: string, mask: number): boolean {
  const bits = parseInt(mode, 8);
  return Number.isFinite(bits) && (bits & mask) !== 0;
}

/** Everything wrong with the keys and sshd settings in one reading. */
export function findingsOf(
  reading: Reading,
  limits: Pick<HostConfig, "minRsaBits" | "keyMaxAgeDays"> = DEFAULT_LIMITS,
  now = Date.now(),
): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => {
    if (!out.some((x) => x.key === f.key)) out.push(f);
  };
  const rootLogin = (reading.sshd.permitrootlogin ?? "").toLowerCase();

  for (const key of reading.keys) {
    const where = `${key.path}`;
    const id = `${key.fingerprint}@${key.path}`;
    if (key.type === "ssh-dss") {
      add(
        finding(
          "key-dsa",
          id,
          `DSA key in ${where}`,
          "DSA keys are weak and no longer accepted by current OpenSSH.",
        ),
      );
    }
    if (key.type === "ssh-rsa" && key.bits !== null) {
      if (key.bits < limits.minRsaBits) {
        add(
          finding(
            "key-rsa-small",
            id,
            `${key.bits} bit RSA key in ${where}`,
            `The limit is ${limits.minRsaBits} bits.`,
          ),
        );
      }
    }
    if (key.kind === "private") {
      if (key.unprotected) {
        add(
          finding(
            "key-unprotected",
            key.path,
            `Private key without a passphrase: ${key.path}`,
            "Anyone who can read this file can use the key.",
          ),
        );
      }
      if (open(key.mode, 0o077)) {
        add(
          finding(
            "key-private-perms",
            key.path,
            `Private key is readable by others: ${key.path}`,
            `The mode is ${key.mode}. It should be 600.`,
          ),
        );
      }
    }
    if (key.kind === "authorized") {
      if (open(key.mode, 0o022)) {
        add(
          finding(
            "authkeys-writable",
            key.path,
            `Others can change ${key.path}`,
            `The mode is ${key.mode}. Anyone who can write it can add keys.`,
          ),
        );
      }
      if (
        limits.keyMaxAgeDays > 0 &&
        key.mtime !== null &&
        now - key.mtime * 1000 > limits.keyMaxAgeDays * 86_400_000
      ) {
        add(
          finding(
            "key-stale",
            key.path,
            `${key.path} has not changed in ${limits.keyMaxAgeDays} days`,
            "Review the keys in it and remove the ones nobody uses.",
          ),
        );
      }
      if (!key.known) {
        add(
          finding(
            "key-unknown",
            id,
            `Key not in Termix: ${key.comment || key.fingerprint}`,
            `${key.user} accepts ${key.type} ${key.fingerprint}.`,
          ),
        );
      }
      if (key.user === "root" && !key.restricted && rootLogin !== "no") {
        add(
          finding(
            "root-key-open",
            id,
            `Root accepts a key with no restrictions`,
            `${key.comment || key.fingerprint}. Add from= or command= to limit it.`,
          ),
        );
      }
    }
  }

  for (const note of reading.notes) {
    const [kind, user, path, mode] = note.split("|");
    if (kind === "dir-writable") {
      add(
        finding(
          "ssh-dir-writable",
          path,
          `Others can write to ${path}`,
          `The mode is ${mode}, owned by ${user}.`,
        ),
      );
    }
  }

  if (reading.sshdRead) {
    const s = reading.sshd;
    if ((s.permitrootlogin ?? "").toLowerCase() === "yes") {
      add(
        finding(
          "sshd-root-login",
          "sshd",
          "sshd allows root login with a password",
          "Set PermitRootLogin to prohibit-password or no.",
        ),
      );
    }
    if ((s.passwordauthentication ?? "").toLowerCase() === "yes") {
      add(
        finding(
          "sshd-password-auth",
          "sshd",
          "sshd allows password logins",
          "Use keys only and set PasswordAuthentication to no.",
        ),
      );
    }
    if ((s.permitemptypasswords ?? "").toLowerCase() === "yes") {
      add(
        finding(
          "sshd-empty-passwords",
          "sshd",
          "sshd allows empty passwords",
          "Set PermitEmptyPasswords to no.",
        ),
      );
    }
    const weak = [
      WEAK_CIPHER.test(s.ciphers ?? "") ? "ciphers" : "",
      WEAK_KEX.test(s.kexalgorithms ?? "") ? "key exchange" : "",
      WEAK_MAC.test(s.macs ?? "") ? "MACs" : "",
    ].filter(Boolean);
    if (weak.length) {
      add(
        finding(
          "sshd-weak-crypto",
          "sshd",
          "sshd offers weak algorithms",
          `Weak ${weak.join(", ")} are enabled.`,
        ),
      );
    }
  }
  return out;
}

const WEIGHT: Record<string, number> = {
  critical: 25,
  high: 10,
  medium: 4,
  low: 1,
  info: 0,
  unknown: 0,
};

export function openVulns(vulns: Vuln[]): Vuln[] {
  return vulns.filter((v) => !v.ignored);
}

/**
 * 100 is clean. Findings take off up to 40. Vulnerabilities take off up to
 * 60, and one with a fix counts much more than one nobody can fix yet.
 */
export function scoreOf(findings: Finding[], vulns: Vuln[]): number {
  let found = 0;
  for (const f of findings) found += WEIGHT[f.severity] ?? 0;
  let vuln = 0;
  for (const v of openVulns(vulns)) {
    if (v.kev) vuln += 25;
    else vuln += ((WEIGHT[v.severity] ?? 0) / 2) * (v.fixed ? 1 : 0.1);
  }
  return Math.max(
    0,
    Math.round(100 - Math.min(40, found) - Math.min(60, vuln)),
  );
}

export function overall(
  reading: Reading | null,
  findings: Finding[],
  vulns: Vuln[],
): Health {
  if (!reading) return "unknown";
  const open = openVulns(vulns);
  if (
    findings.some((f) => f.severity === "critical") ||
    open.some((v) => v.kev || (v.severity === "critical" && v.fixed))
  ) {
    return "fail";
  }
  if (
    findings.some((f) => f.severity === "high" || f.severity === "medium") ||
    open.some(
      (v) => v.severity === "critical" || (v.severity === "high" && v.fixed),
    )
  ) {
    return "warn";
  }
  return "ok";
}

/** Findings that raise an alert when they start. */
export function loud(severity: Severity): boolean {
  return severity === "critical" || severity === "high";
}

export interface Change {
  kind: Kind;
  subject: string;
  on: boolean;
}

export function conditionsOf(findings: Finding[]): Map<string, Finding> {
  return new Map(findings.map((f) => [f.key, f]));
}

export function diff(before: Set<string>, after: Set<string>): Change[] {
  const changes: Change[] = [];
  for (const key of after) {
    if (!before.has(key)) changes.push(parseKey(key, true));
  }
  for (const key of before) {
    if (!after.has(key)) changes.push(parseKey(key, false));
  }
  return changes;
}

function parseKey(key: string, on: boolean): Change {
  const at = key.indexOf("|");
  return {
    kind: (at === -1 ? key : key.slice(0, at)) as Kind,
    subject: at === -1 ? "" : key.slice(at + 1),
    on,
  };
}

export function alertSeverity(
  severity: Severity,
): "info" | "warning" | "critical" {
  return severity === "critical"
    ? "critical"
    : severity === "high" || severity === "medium"
      ? "warning"
      : "info";
}
