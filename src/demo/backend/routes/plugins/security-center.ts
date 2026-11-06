import { del, get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/security-center";
const DAY = 86_400_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const print = (seed: string) => `SHA256:${seed.padEnd(43, "x").slice(0, 43)}`;

const key = (
  n: number,
  kind: "authorized" | "host" | "private",
  user: string,
  path: string,
  type: string,
  bits: number,
  comment: string,
  extra: Record<string, unknown> = {},
) => ({
  id: `${kind}|${path}|${n}`,
  kind,
  user,
  path,
  type,
  bits,
  fingerprint: print(`demoKey${n}AbCdEfGhIjKlMnOpQrStUvWxYz`),
  comment,
  options: "",
  restricted: false,
  mode: kind === "private" ? "600" : "644",
  mtime: Math.floor((Date.now() - 200 * DAY) / 1000),
  unprotected: false,
  known: true,
  knownAs: "",
  ...extra,
});

const keys = [
  key(
    1,
    "authorized",
    "root",
    "/root/.ssh/authorized_keys",
    "ssh-ed25519",
    256,
    "termix",
    {
      knownAs: "Termix login key",
    },
  ),
  key(
    2,
    "authorized",
    "deploy",
    "/home/deploy/.ssh/authorized_keys",
    "ssh-ed25519",
    256,
    "ci@runner",
    {
      restricted: true,
      options: 'from="10.0.0.0/8",command="/usr/local/bin/deploy"',
      knownAs: "CI key",
    },
  ),
  key(
    3,
    "authorized",
    "deploy",
    "/home/deploy/.ssh/authorized_keys",
    "ssh-rsa",
    1024,
    "old@laptop",
    {
      known: false,
    },
  ),
  key(
    4,
    "authorized",
    "luke",
    "/home/luke/.ssh/authorized_keys",
    "ssh-ed25519",
    256,
    "luke@desktop",
    {
      knownAs: "Desktop",
    },
  ),
  key(
    5,
    "host",
    "root",
    "/etc/ssh/ssh_host_ed25519_key.pub",
    "ssh-ed25519",
    256,
    "root@demo",
  ),
  key(
    6,
    "host",
    "root",
    "/etc/ssh/ssh_host_rsa_key.pub",
    "ssh-rsa",
    3072,
    "root@demo",
  ),
  key(7, "private", "luke", "/home/luke/.ssh/id_rsa", "ssh-rsa", 2048, "", {
    unprotected: true,
    mode: "644",
  }),
];

const findings = [
  {
    key: "key-rsa-small|3",
    kind: "key-rsa-small",
    subject: "3",
    severity: "high",
    title: "1024 bit RSA key in /home/deploy/.ssh/authorized_keys",
    detail: "The limit is 3072 bits.",
  },
  {
    key: "key-unprotected|/home/luke/.ssh/id_rsa",
    kind: "key-unprotected",
    subject: "/home/luke/.ssh/id_rsa",
    severity: "high",
    title: "Private key without a passphrase: /home/luke/.ssh/id_rsa",
    detail: "Anyone who can read this file can use the key.",
  },
  {
    key: "key-private-perms|/home/luke/.ssh/id_rsa",
    kind: "key-private-perms",
    subject: "/home/luke/.ssh/id_rsa",
    severity: "high",
    title: "Private key is readable by others: /home/luke/.ssh/id_rsa",
    detail: "The mode is 644. It should be 600.",
  },
  {
    key: "sshd-password-auth|sshd",
    kind: "sshd-password-auth",
    subject: "sshd",
    severity: "medium",
    title: "sshd allows password logins",
    detail: "Use keys only and set PasswordAuthentication to no.",
  },
  {
    key: "key-unknown|3",
    kind: "key-unknown",
    subject: "3",
    severity: "low",
    title: "Key not in Termix: old@laptop",
    detail: "deploy accepts ssh-rsa.",
  },
];

const vuln = (
  id: string,
  pkg: string,
  version: string,
  fixed: string,
  severity: string,
  score: number | null,
  summary: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  cves: [id.replace("DSA-", "CVE-2026-")],
  package: pkg,
  version,
  fixed,
  severity,
  score,
  kev: false,
  summary,
  ignored: false,
  ignoreNote: "",
  ...extra,
});

const state = value("security-center-state", () => ({
  scannedAt: Date.now() - 3_600_000,
  ignored: [] as string[],
  vulns: [
    vuln(
      "DSA-6001-1",
      "openssl",
      "3.0.15-1",
      "3.0.16-1",
      "critical",
      9.8,
      "openssl security update",
      { kev: true },
    ),
    vuln(
      "DSA-6002-1",
      "curl",
      "7.88.1-10",
      "7.88.1-11",
      "high",
      8.1,
      "curl security update",
    ),
    vuln(
      "DSA-6003-1",
      "sudo",
      "1.9.13-2",
      "1.9.13-3",
      "high",
      7.8,
      "sudo security update",
    ),
    vuln(
      "DSA-6004-1",
      "libxml2",
      "2.9.14-1",
      "",
      "medium",
      5.3,
      "libxml2 security update",
    ),
    vuln("DSA-6005-1", "tar", "1.34-1", "", "low", 3.1, "tar security update"),
    vuln(
      "DSA-6006-1",
      "gzip",
      "1.12-1",
      "",
      "unknown",
      null,
      "gzip security update",
    ),
  ],
  events: [
    {
      id: 3,
      type: "vuln-new",
      text: "1 new critical or exploited vulnerability: DSA-6001-1",
      at: Date.now() - 3_600_000,
    },
    {
      id: 2,
      type: "key-rsa-small",
      text: "1024 bit RSA key in /home/deploy/.ssh/authorized_keys",
      at: Date.now() - 2 * DAY,
    },
    {
      id: 1,
      type: "rotated",
      text: "Rotated the login key for demo",
      at: Date.now() - 9 * DAY,
    },
  ] as Array<{ id: number; type: string; text: string; at: number }>,
  config: {
    hostId: 1,
    alerts: true,
    intervalMin: 60,
    vulnIntervalH: 24,
    minRsaBits: 3072,
    keyMaxAgeDays: 0,
  },
}));

function scan() {
  const s = state.get();
  const vulns = s.vulns.map((v) => ({
    ...v,
    ignored: s.ignored.includes(v.id),
    ignoreNote: s.ignored.includes(v.id) ? "later" : "",
  }));
  return {
    at: s.scannedAt,
    ecosystem: "Debian:13",
    packages: 412,
    pending: 0,
    unsupported: "",
    error: "",
    kevChecked: true,
    vulns,
  };
}

function view() {
  const sc = scan();
  const open = sc.vulns.filter((v) => !v.ignored);
  const critical = open.filter((v) => v.severity === "critical").length;
  const kev = open.filter((v) => v.kev).length;
  return {
    hostId: 1,
    canEdit: true,
    canManage: true,
    useSudo: true,
    scanEnabled: true,
    config: state.get().config,
    status: kev || critical ? "fail" : "warn",
    score: kev || critical ? 41 : 68,
    reading: {
      at: Date.now(),
      root: true,
      os: { id: "debian", version: "13", name: "Debian GNU/Linux 13 (trixie)" },
      sshdVersion: "OpenSSH_10.0p2 Debian-7, OpenSSL 3.5.1 1 Jul 2025",
      sshd: {},
      sshdRead: true,
      keys,
      rebootRequired: false,
      notes: [],
    },
    findings,
    error: "",
    readAt: Date.now(),
    active: findings.map((f) => f.key),
    seenOn: { [keys[3].fingerprint]: 2 },
    scan: {
      at: sc.at,
      ecosystem: sc.ecosystem,
      packages: sc.packages,
      pending: 0,
      unsupported: "",
      error: "",
      kevChecked: true,
      total: sc.vulns.length,
      critical,
      kev,
    },
    scanning: false,
  };
}

get(`${P}/summary`, () => {
  const v = view();
  return [
    {
      hostId: 1,
      label: "demo",
      status: v.status,
      score: v.score,
      findings: v.findings.length,
      critical: v.scan.critical,
      kev: v.scan.kev,
      keys: v.reading.keys.length,
      error: "",
    },
  ];
});
get(`${P}/:host/vulns`, () => ({ scan: scan(), scanning: false }));
get(`${P}/:host/events`, () =>
  state.get().events.map((e) => ({ ...e, hostId: 1 })),
);
post(`${P}/:host/refresh`, () => view());
put(`${P}/:host/config`, (req) => {
  const body = req.body as Record<string, unknown>;
  state.update((s) => ({ ...s, config: { ...s.config, ...body } }));
  return state.get().config;
});
post(`${P}/:host/scan`, async () => {
  await wait(1800);
  state.update((s) => ({ ...s, scannedAt: Date.now() }));
  return { scan: scan(), scanning: false };
});
post(`${P}/:host/ignore`, (req) => {
  const id = String((req.body as { advisory?: string }).advisory ?? "");
  state.update((s) => ({ ...s, ignored: [...new Set([...s.ignored, id])] }));
  return { ok: true };
});
del(`${P}/:host/ignore/:advisory`, (req) => {
  const id = decodeURIComponent(String(req.params.advisory ?? ""));
  state.update((s) => {
    return { ...s, ignored: s.ignored.filter((x) => x !== id) };
  });
  return { ok: true };
});
post(`${P}/:host/rotate-login-key`, async () => {
  await wait(2200);
  return { ok: true, message: "Rotated the login key for demo" };
});
post(`${P}/:host/revoke`, async (req) => {
  await wait(900);
  const path = String((req.body as { path?: string }).path ?? "");
  return { ok: true, message: `Removed the key from ${path}` };
});
post(`${P}/:host/rotate-host-keys`, async () => {
  await wait(2000);
  return {
    ok: true,
    message:
      "Made new host keys. The old ones are in /var/lib/termix-security/hostkeys-1",
  };
});
get(`${P}/:host`, () => view());
