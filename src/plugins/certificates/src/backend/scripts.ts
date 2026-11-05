import {
  HostScriptError,
  shellQuote,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { AcmeClient, IssueBody } from "../shared/types.js";

export const MARK = "@@TERMIX@@";

const DOMAIN_RE =
  /^(\*\.)?([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const NAME_RE = /^[A-Za-z0-9._*-]{1,253}$/;
const PROVIDER_RE = /^[a-z0-9_-]{2,40}$/;
const PATH_RE = /^\/[A-Za-z0-9/._@+-]{0,250}$/;
const EMAIL_RE = /^[^\s@'"`$\\]+@[^\s@'"`$\\]+\.[^\s@'"`$\\]+$/;
const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const IPV6_RE = /^[0-9A-Fa-f:]{2,39}$/;
const WEBROOTS = ["/var/www", "/srv", "/usr/share/nginx"];

// acme.sh lives in the home of the user that installed it, usually root.
const ACME = `H="\${LE_CONFIG_HOME:-$HOME/.acme.sh}"
A=$(command -v acme.sh 2>/dev/null || true)
[ -z "$A" ] && [ -x "$H/acme.sh" ] && A="$H/acme.sh"
`;

export function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!NAME_RE.test(name) || name.includes("..")) {
    throw new HostScriptError("The certificate name is not valid");
  }
  return name;
}

/** "certbot:example.com" to its parts. */
export function parseKey(value: unknown): { client: AcmeClient; name: string } {
  const key = typeof value === "string" ? value : "";
  const at = key.indexOf(":");
  const client = key.slice(0, at);
  if (client !== "certbot" && client !== "acme.sh") {
    throw new HostScriptError("Unknown certificate");
  }
  return { client, name: cleanName(key.slice(at + 1)) };
}

export function cleanPath(value: unknown, what = "path"): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!PATH_RE.test(path) || path.includes("..")) {
    throw new HostScriptError(`The ${what} is not a valid path`);
  }
  return path;
}

/** A host and port to check over TLS, with the name to send as SNI. */
export function cleanEndpoint(
  host: unknown,
  port: unknown,
): { connect: string; sni: string } {
  const h = typeof host === "string" ? host.trim().replace(/^\[|\]$/g, "") : "";
  const p = Number(port ?? 443);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    throw new HostScriptError("The port is not valid");
  }
  if (IPV6_RE.test(h) && h.includes(":"))
    return { connect: `[${h}]:${p}`, sni: "" };
  if (!HOST_RE.test(h)) throw new HostScriptError("The address is not valid");
  const ip = /^\d+\.\d+\.\d+\.\d+$/.test(h);
  return { connect: `${h}:${p}`, sni: ip ? "" : h };
}

export function cleanIssue(body: IssueBody): Required<
  Omit<IssueBody, "webroot" | "dnsProvider" | "credentials" | "email">
> & {
  webroot: string;
  dnsProvider: string;
  credentials: string;
  email: string;
} {
  const client = body.client;
  if (client !== "certbot" && client !== "acme.sh") {
    throw new HostScriptError("Pick certbot or acme.sh");
  }
  const domains = (Array.isArray(body.domains) ? body.domains : [])
    .map((d) => String(d).trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) throw new HostScriptError("Enter a domain");
  if (domains.length > 100) throw new HostScriptError("Too many domains");
  for (const domain of domains) {
    if (!DOMAIN_RE.test(domain)) {
      throw new HostScriptError(`${domain} is not a valid domain`);
    }
  }
  const challenge = body.challenge;
  if (!["standalone", "webroot", "dns"].includes(challenge)) {
    throw new HostScriptError("Pick a challenge");
  }
  if (challenge !== "dns" && domains.some((d) => d.startsWith("*."))) {
    throw new HostScriptError("Wildcard certificates need the DNS challenge");
  }
  let webroot = "";
  if (challenge === "webroot") {
    webroot = cleanPath(body.webroot, "web root");
    if (
      !WEBROOTS.some(
        (root) => webroot === root || webroot.startsWith(`${root}/`),
      )
    ) {
      throw new HostScriptError(
        `The web root must be inside ${WEBROOTS.join(", ")}`,
      );
    }
  }
  let dnsProvider = "";
  let credentials = "";
  if (challenge === "dns") {
    dnsProvider = String(body.dnsProvider ?? "")
      .trim()
      .toLowerCase();
    if (!PROVIDER_RE.test(dnsProvider)) {
      throw new HostScriptError("Enter a DNS provider, like cloudflare");
    }
    if (body.credentials)
      credentials = cleanPath(body.credentials, "credentials file");
  }
  const email = String(body.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) {
    throw new HostScriptError("The email is not valid");
  }
  return {
    client,
    domains: [...new Set(domains)],
    challenge,
    webroot,
    dnsProvider,
    credentials,
    email,
    staging: body.staging === true,
    keyType: body.keyType === "rsa" ? "rsa" : "ecdsa",
  };
}

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
if [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; then echo root=1; else echo root=0; fi
command -v certbot >/dev/null 2>&1 && echo "certbot=$(certbot --version 2>&1 | awk '{print $2}' | head -n 1)"
${ACME}[ -n "$A" ] && echo "acmesh=$("$A" --version 2>/dev/null | tail -n 1)"
command -v openssl >/dev/null 2>&1 && echo openssl=1
pm=none
for c in apt-get dnf yum zypper pacman apk; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done
echo "manager=$pm"
if command -v systemctl >/dev/null 2>&1; then
  for u in certbot.timer snap.certbot.renew.timer; do
    s=$(systemctl is-active $u 2>/dev/null)
    if [ "$s" = active ]; then
      echo "timer=active"
      echo "timernext=$(systemctl show $u -p NextElapseUSecRealtime --value 2>/dev/null)"
      break
    fi
  done
fi
[ -f /etc/cron.d/certbot ] && echo certbotcron=1
crontab -l 2>/dev/null | grep -q acme.sh && echo acmecron=1
exit 0
`;

export const LIST_SCRIPT = `if command -v certbot >/dev/null 2>&1; then
  echo "${MARK}CERTBOT"
  certbot certificates 2>/dev/null
fi
${ACME}if [ -n "$A" ] && [ -d "$H" ]; then
  for dir in "$H"/*/; do
    dir=\${dir%/}
    base=\${dir##*/}
    name=\${base%_ecc}
    conf="$dir/$name.conf"
    [ -f "$conf" ] || continue
    alt=$(sed -n "s/^Le_Alt='\\(.*\\)'$/\\1/p" "$conf")
    len=$(sed -n "s/^Le_Keylength='\\(.*\\)'$/\\1/p" "$conf")
    api=$(sed -n "s/^Le_API='\\(.*\\)'$/\\1/p" "$conf")
    end=$(openssl x509 -enddate -noout -in "$dir/$name.cer" 2>/dev/null | cut -d= -f2)
    echo "${MARK}ACME $name|$alt|$len|$end|$dir/$name.cer|$api"
  done
fi
exit 0
`;

const SPLIT = `t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
split_certs() {
  awk -v d="$t" '/-----BEGIN CERTIFICATE-----/{n++; f=d "/c" n ".pem"} f{print > f} /-----END CERTIFICATE-----/{close(f); f=""}' "$1"
}
show_certs() {
  n=1
  while [ -f "$t/c$n.pem" ]; do
    c="$t/c$n.pem"
    echo "${MARK}CERT"
    openssl x509 -in "$c" -noout -subject -issuer -startdate -enddate -serial -fingerprint -sha256 2>/dev/null
    txt=$(openssl x509 -in "$c" -noout -text 2>/dev/null)
    printf '%s\\n' "$txt" | grep -A1 'Subject Alternative Name' | tail -n 1 | sed 's/^ */sans=/'
    printf '%s\\n' "$txt" | grep -m1 'Public Key Algorithm' | sed 's/^ *Public Key Algorithm: */alg=/'
    printf '%s\\n' "$txt" | grep -m1 'Public-Key:' | sed 's/^ *Public-Key: */bits=/'
    n=$((n+1))
  done
}
`;

/** Every certificate in a PEM or DER file, read with openssl. */
export function inspectFileScript(path: string): string {
  const f = shellQuote(path);
  return `command -v openssl >/dev/null 2>&1 || { echo "SCRIPT_ERR:openssl is not installed on this host"; exit 1; }
[ -r ${f} ] || { echo "SCRIPT_ERR:That file does not exist or can't be read"; exit 1; }
${SPLIT}split_certs ${f}
[ -f "$t/c1.pem" ] || openssl x509 -inform der -in ${f} -out "$t/c1.pem" 2>/dev/null
[ -f "$t/c1.pem" ] || { echo "SCRIPT_ERR:No certificate was found in that file"; exit 1; }
show_certs
`;
}

/** The chain a TLS server sends, fetched from the host itself. */
export function inspectRemoteScript(connect: string, sni: string): string {
  return `command -v openssl >/dev/null 2>&1 || { echo "SCRIPT_ERR:openssl is not installed on this host"; exit 1; }
${SPLIT}T=""; command -v timeout >/dev/null 2>&1 && T="timeout 15"
echo | $T openssl s_client -connect ${shellQuote(connect)}${sni ? ` -servername ${shellQuote(sni)}` : ""} -showcerts > "$t/out" 2>/dev/null
echo "${MARK}VERIFY $(grep -m1 'Verify return code' "$t/out" | sed 's/^ *Verify return code: //')"
split_certs "$t/out"
[ -f "$t/c1.pem" ] || { echo "SCRIPT_ERR:No certificate came back. Check the address and port."; exit 1; }
show_certs
`;
}

export function issueScript(issue: ReturnType<typeof cleanIssue>): string {
  const d = issue.domains.map((x) => `-d ${shellQuote(x)}`).join(" ");
  if (issue.client === "certbot") {
    const how =
      issue.challenge === "dns"
        ? `--dns-${issue.dnsProvider}${issue.credentials ? ` --dns-${issue.dnsProvider}-credentials ${shellQuote(issue.credentials)}` : ""}`
        : issue.challenge === "webroot"
          ? `--webroot -w ${shellQuote(issue.webroot)}`
          : "--standalone";
    const who = issue.email
      ? `--email ${shellQuote(issue.email)}`
      : "--register-unsafely-without-email";
    return `certbot certonly --non-interactive --agree-tos ${who}${issue.staging ? " --staging" : ""} --key-type ${issue.keyType} ${how} ${d} 2>&1\n`;
  }
  const how =
    issue.challenge === "dns"
      ? `--dns dns_${issue.dnsProvider}`
      : issue.challenge === "webroot"
        ? `-w ${shellQuote(issue.webroot)}`
        : "--standalone";
  return `${ACME}[ -n "$A" ] || { echo "SCRIPT_ERR:acme.sh is not installed for root"; exit 1; }
"$A" --issue --server ${issue.staging ? "letsencrypt_test" : "letsencrypt"} --keylength ${issue.keyType === "rsa" ? "2048" : "ec-256"}${issue.email ? ` --accountemail ${shellQuote(issue.email)}` : ""} ${how} ${d} 2>&1
`;
}

const acmeEcc = (name: string) =>
  `${ACME}[ -n "$A" ] || { echo "SCRIPT_ERR:acme.sh is not installed for root"; exit 1; }
E=""; [ -d "$H/${name}_ecc" ] && E="--ecc"
`;

export function renewScript(
  client: AcmeClient,
  name: string | null,
  options: { dryRun?: boolean; force?: boolean } = {},
): string {
  if (client === "certbot") {
    return `certbot renew --non-interactive${name ? ` --cert-name ${shellQuote(name)}` : ""}${options.dryRun ? " --dry-run" : ""}${options.force && !options.dryRun ? " --force-renewal" : ""} 2>&1\n`;
  }
  if (options.dryRun) {
    throw new HostScriptError("acme.sh has no dry run");
  }
  if (!name) {
    return `${ACME}[ -n "$A" ] || { echo "SCRIPT_ERR:acme.sh is not installed for root"; exit 1; }\n"$A" --renew-all 2>&1\n`;
  }
  return `${acmeEcc(name)}"$A" --renew -d ${shellQuote(name)} $E${options.force ? " --force" : ""} 2>&1\n`;
}

export function revokeScript(client: AcmeClient, name: string): string {
  if (client === "certbot") {
    return `certbot revoke --non-interactive --cert-name ${shellQuote(name)} --delete-after-revoke 2>&1\n`;
  }
  const d = shellQuote(name);
  return `${acmeEcc(name)}"$A" --revoke -d ${d} $E 2>&1 && "$A" --remove -d ${d} $E 2>&1\n`;
}

export function deleteScript(client: AcmeClient, name: string): string {
  if (client === "certbot") {
    return `certbot delete --non-interactive --cert-name ${shellQuote(name)} 2>&1\n`;
  }
  return `${acmeEcc(name)}"$A" --remove -d ${shellQuote(name)} $E 2>&1\n`;
}

export function installCertbotScript(manager: string): string {
  const command: Record<string, string> = {
    "apt-get":
      "DEBIAN_FRONTEND=noninteractive apt-get -y -q -o DPkg::Lock::Timeout=120 install certbot",
    dnf: "dnf -y install certbot",
    yum: "yum -y install certbot",
    zypper: "zypper -n install python3-certbot",
    pacman: "pacman -S --noconfirm --needed certbot",
    apk: "apk add certbot",
  };
  if (!command[manager]) {
    throw new HostScriptError("No supported package manager was found");
  }
  return `{ ${command[manager]}; } 2>&1\n`;
}
