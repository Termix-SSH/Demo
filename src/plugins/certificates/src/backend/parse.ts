import { parseKeys } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  CertInfo,
  CertStatus,
  CertView,
  InspectResult,
} from "../shared/types.js";
import { MARK } from "./scripts.js";

const DAY = 86_400_000;

export function daysLeft(
  expiry: string | null,
  now = Date.now(),
): number | null {
  if (!expiry) return null;
  const at = Date.parse(expiry);
  return Number.isFinite(at) ? Math.floor((at - now) / DAY) : null;
}

function toIso(text: string): string | null {
  const at = Date.parse(text.replace(/(\d{2}:\d{2}:\d{2})\+00:00/, "$1Z"));
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

export function parseStatus(
  stdout: string,
): Omit<CertStatus, "watching" | "warnDays" | "canEdit" | "readOnly"> {
  const keys = parseKeys(stdout);
  return {
    os: keys.os ?? "",
    root: keys.root === "1",
    certbot: keys.certbot ?? "",
    acmesh: (keys.acmesh ?? "").replace(/^v/, ""),
    openssl: keys.openssl === "1",
    manager: keys.manager ?? "none",
    timer: keys.timer ?? "",
    timerNext: keys.timernext && keys.timernext !== "n/a" ? keys.timernext : "",
    certbotCron: keys.certbotcron === "1",
    acmeCron: keys.acmecron === "1",
  };
}

/** `certbot certificates` output. */
export function parseCertbot(output: string, now = Date.now()): CertView[] {
  const certs: CertView[] = [];
  let current: CertView | null = null;
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    const name = line.match(/^Certificate Name:\s+(.+)$/);
    if (name) {
      if (current) certs.push(current);
      current = {
        key: `certbot:${name[1]}`,
        client: "certbot",
        name: name[1],
        domains: [],
        expiry: null,
        daysLeft: null,
        path: "",
        keyType: "",
        staging: false,
      };
      continue;
    }
    if (!current) continue;
    const domains = line.match(/^Domains:\s+(.+)$/);
    if (domains) current.domains = domains[1].split(/\s+/).filter(Boolean);
    const expiry = line.match(/^Expiry Date:\s+(\S+\s+\S+)(.*)$/);
    if (expiry) {
      current.expiry = toIso(expiry[1]);
      current.daysLeft = daysLeft(current.expiry, now);
      current.staging = /TEST_CERT/.test(expiry[2]);
    }
    const path = line.match(/^Certificate Path:\s+(.+)$/);
    if (path) current.path = path[1];
    const keyType = line.match(/^Key Type:\s+(.+)$/);
    if (keyType) current.keyType = keyType[1];
  }
  if (current) certs.push(current);
  return certs;
}

/** Lines the list script prints for each acme.sh certificate. */
export function parseAcme(output: string, now = Date.now()): CertView[] {
  return output.split("\n").flatMap((line) => {
    if (!line.startsWith(`${MARK}ACME `)) return [];
    const [name, alt, len, end, path, api] = line
      .slice(MARK.length + 5)
      .split("|");
    if (!name) return [];
    const expiry = end ? toIso(end) : null;
    const extra = alt && alt !== "no" ? alt.split(",").filter(Boolean) : [];
    return [
      {
        key: `acme.sh:${name}`,
        client: "acme.sh" as const,
        name,
        domains: [name, ...extra],
        expiry,
        daysLeft: daysLeft(expiry, now),
        path: path ?? "",
        keyType: len?.startsWith("ec")
          ? `ECDSA ${len.slice(3)}`
          : len
            ? `RSA ${len}`
            : "",
        staging: /staging|test/i.test(api ?? ""),
      },
    ];
  });
}

export function parseList(stdout: string, now = Date.now()): CertView[] {
  const at = stdout.indexOf(`${MARK}CERTBOT`);
  const certbot = at >= 0 ? stdout.slice(at) : "";
  return [...parseCertbot(certbot, now), ...parseAcme(stdout, now)].sort(
    (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
  );
}

/** "id-ecPublicKey" and "(256 bit)" to "ECDSA 256". */
export function keyType(alg = "", bits = ""): string {
  const name = /rsa/i.test(alg)
    ? "RSA"
    : /ec/i.test(alg)
      ? "ECDSA"
      : /ed25519/i.test(alg)
        ? "Ed25519"
        : alg;
  const size = bits.match(/(\d+)\s*bit/)?.[1];
  return [name, size].filter(Boolean).join(" ");
}

/** "CN = a, O = b" or "CN=a, O=b" to its CN, or the whole thing. */
function commonName(dn: string): string {
  const match = dn.match(/CN\s*=\s*([^,/]+)/);
  return match ? match[1].trim() : dn.trim();
}

export function parseInspect(
  stdout: string,
  source: string,
  now = Date.now(),
): InspectResult {
  let verify = "";
  const chain: CertInfo[] = [];
  let current: Record<string, string> | null = null;
  const flush = () => {
    if (!current) return;
    const notAfter = current.notAfter ? toIso(current.notAfter) : null;
    chain.push({
      subject: current.subject ?? "",
      issuer: current.issuer ?? "",
      notBefore: current.notBefore ? (toIso(current.notBefore) ?? "") : "",
      notAfter: notAfter ?? "",
      daysLeft: daysLeft(notAfter, now),
      sans: (current.sans ?? "")
        .split(",")
        .map((item) => item.trim().replace(/^(DNS|IP Address):/, ""))
        .filter(Boolean),
      serial: current.serial ?? "",
      fingerprint: current.fingerprint ?? "",
      keyType: keyType(current.alg, current.bits),
      selfSigned:
        !!current.subject &&
        commonName(current.subject) === commonName(current.issuer ?? ""),
    });
    current = null;
  };
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (line.startsWith(`${MARK}VERIFY`)) {
      verify = line.slice(MARK.length + 6).trim();
      continue;
    }
    if (line === `${MARK}CERT`) {
      flush();
      current = {};
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (/fingerprint$/i.test(key)) current.fingerprint = value;
    else if (key === "subject" || key === "issuer") current[key] = value;
    else if (key === "notBefore" || key === "notAfter") current[key] = value;
    else if (key === "serial") current.serial = value;
    else if (key === "sans") current.sans = value;
    else if (key === "alg" || key === "bits") current[key] = value;
  }
  flush();
  return { source, chain, verify };
}
