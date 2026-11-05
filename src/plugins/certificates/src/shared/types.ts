export type AcmeClient = "certbot" | "acme.sh";
export type Challenge = "standalone" | "webroot" | "dns";

export interface CertStatus {
  os: string;
  root: boolean;
  /** Version, or empty when not installed. */
  certbot: string;
  acmesh: string;
  openssl: boolean;
  /** Package manager, for installing certbot. */
  manager: string;
  /** certbot's renew timer state, like "active", or empty. */
  timer: string;
  timerNext: string;
  /** /etc/cron.d/certbot exists. */
  certbotCron: boolean;
  /** acme.sh has its renew job in the crontab. */
  acmeCron: boolean;
  /** The caller gets alerts for this host. */
  watching: boolean;
  warnDays: number;
  canEdit: boolean;
  readOnly: boolean;
}

export interface CertView {
  /** "certbot:name" or "acme.sh:name". */
  key: string;
  client: AcmeClient;
  name: string;
  domains: string[];
  /** ISO time, or null when unknown. */
  expiry: string | null;
  daysLeft: number | null;
  path: string;
  keyType: string;
  staging: boolean;
}

export interface CertInfo {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  daysLeft: number | null;
  sans: string[];
  serial: string;
  fingerprint: string;
  keyType: string;
  selfSigned: boolean;
}

export interface InspectResult {
  source: string;
  chain: CertInfo[];
  /** s_client's verify result for a remote check, empty for files. */
  verify: string;
}

export interface IssueBody {
  client: AcmeClient;
  domains: string[];
  challenge: Challenge;
  webroot?: string;
  dnsProvider?: string;
  /** certbot DNS plugins read their API token from this file. */
  credentials?: string;
  email?: string;
  staging?: boolean;
  keyType?: "ecdsa" | "rsa";
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export interface HostCertSummary {
  hostId: number;
  certs: Array<{ name: string; client: AcmeClient; daysLeft: number | null }>;
  error?: string;
  checkedAt: string;
}
