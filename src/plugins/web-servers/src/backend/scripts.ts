import {
  HostScriptError,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { ServerInfo, ServerKind, ServiceAction } from "../shared/types.js";
import {
  CADDY_IMPORT,
  CADDY_KEEP,
  reloadCommand,
  testCommand,
} from "./servers.js";

export const MARK = "@@WS@@";
/** Old copies of every file Termix changes, 10 per file. */
export const BACKUP_DIR = "/var/lib/termix-web-servers/backups";
const KEEP_BACKUPS = 10;
const MAX_SITE_BYTES = 262_144;
const MAX_EDIT_BYTES = 524_288;

const q = shellQuote;

const STATE = (unit: string, key: string) => `if [ "$sd" = 1 ]; then
  echo "${key}state=$(systemctl is-active ${unit} 2>/dev/null | head -n 1)"
  systemctl is-enabled -q ${unit} 2>/dev/null && echo ${key}boot=1
elif command -v rc-service >/dev/null 2>&1; then
  rc-service ${unit} status >/dev/null 2>&1 && echo ${key}state=active || echo ${key}state=inactive
  rc-update show default 2>/dev/null | grep -qw ${unit} && echo ${key}boot=1
fi`;

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
if [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; then echo root=1; else echo root=0; fi
sd=0; command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && sd=1
echo "systemd=$sd"
pm=none
for c in apt-get dnf yum zypper pacman apk; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done
echo "manager=$pm"
if command -v nginx >/dev/null 2>&1; then
  echo "nginx=$(nginx -v 2>&1 | sed 's#.*/##' | head -n 1)"
  [ -d /etc/nginx/sites-available ] && echo nginxlayout=debian || echo nginxlayout=confd
  ${STATE("nginx", "nginx")}
fi
if command -v apache2ctl >/dev/null 2>&1 || [ -x /usr/sbin/apache2 ]; then
  echo "apache=$( (apache2 -v 2>/dev/null || /usr/sbin/apache2 -v 2>/dev/null) | sed -n 's#^Server version: Apache/\\([^ ]*\\).*#\\1#p')"
  echo apachelayout=debian
  ${STATE("apache2", "apache")}
elif command -v httpd >/dev/null 2>&1 && [ -d /etc/httpd ]; then
  echo "apache=$(httpd -v 2>/dev/null | sed -n 's#^Server version: Apache/\\([^ ]*\\).*#\\1#p')"
  echo apachelayout=confd
  ${STATE("httpd", "apache")}
fi
if command -v caddy >/dev/null 2>&1; then
  echo "caddy=$(caddy version 2>/dev/null | awk '{print $1}' | sed 's/^v//' | head -n 1)"
  ${STATE("caddy", "caddy")}
fi
command -v certbot >/dev/null 2>&1 && echo "certbot=$(certbot --version 2>&1 | awk '{print $2}' | head -n 1)"
for p in /usr/lib/python3*/dist-packages /usr/lib/python3*/site-packages /usr/lib64/python3*/site-packages /snap/certbot/current/lib/python3*/site-packages; do
  [ -d "$p/certbot_nginx" ] && echo certbotnginx=1
  [ -d "$p/certbot_apache" ] && echo certbotapache=1
done
for s in /run/php/*.sock /run/php-fpm/*.sock /var/run/php/*.sock /var/run/php-fpm/*.sock; do
  [ -S "$s" ] && echo "php=$s"
done
exit 0
`;

/** Every site file of the installed servers, with its text. */
export function listScript(servers: ServerInfo[]): string {
  const parts = servers.map((s) => {
    const filter =
      s.kind === "caddy"
        ? `case "$b" in ${CADDY_KEEP}) continue;; *.caddy) en=1;; *.caddy.disabled) en=0;; *) continue;; esac`
        : s.layout === "debian"
          ? `case "$b" in *.dpkg-*|*~|*.bak|*.swp) continue;; esac
    ${s.kind === "apache" ? `case "$b" in *.conf) ;; *) continue;; esac` : ""}
    en=0; [ -e ${q(s.enabledDir)}/"$b" ] && en=1`
          : `case "$b" in *.conf) en=1;; *.conf.disabled) en=0;; *) continue;; esac`;
    const extra =
      s.layout === "debian"
        ? `
for f in ${q(s.enabledDir)}/*; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  show ${s.kind} 1 "$f"
done`
        : "";
    return `for f in ${q(s.siteDir)}/*; do
  [ -f "$f" ] || continue
  b=\${f##*/}
  ${filter}
  show ${s.kind} $en "$f"
done${extra}`;
  });
  return `show() {
  [ "$(wc -c < "$3")" -le ${MAX_SITE_BYTES} ] || return 0
  echo "${MARK}FILE $1|$2|$3"
  cat "$3"
  echo
  echo "${MARK}END"
  grep -hoE '^[[:space:]]*(ssl_certificate|SSLCertificateFile)[[:space:]]+[^;[:space:]]+' "$3" 2>/dev/null | awk '{print $2}' >> "$certs"
}
certs=$(mktemp); trap 'rm -f "$certs"' EXIT
${parts.join("\n")}
if command -v openssl >/dev/null 2>&1; then
  sort -u "$certs" | while IFS= read -r c; do
    [ -r "$c" ] && echo "${MARK}CERT $c|$(openssl x509 -enddate -noout -in "$c" 2>/dev/null | cut -d= -f2)"
  done
fi
exit 0
`;
}

export interface Transaction {
  server: ServerInfo;
  /** Changes the files. Runs after the backup folder exists. */
  steps: string;
  /** Puts things back when the test fails. */
  rollback: string;
  /** Runs once the test passed, before the reload. */
  commit?: string;
}

/**
 * Makes a change, tests the whole config and puts things back when the test
 * fails. The server only reloads with a config that passed.
 */
export function transactionScript(t: Transaction): string {
  return `set -u
command -v ${testCommand(t.server).split(" ")[0]} >/dev/null 2>&1 || { echo "SCRIPT_ERR:The server is not installed"; exit 1; }
BK=${q(BACKUP_DIR)}
mkdir -p "$BK" && chmod 700 "$BK" "\${BK%/*}"
CLEAN=$(mktemp -d); trap 'rm -rf "$CLEAN"' EXIT
keykey() { printf '%s' "$1" | sed 's#^/##; s#/#%#g'; }
keep() {
  k=$(keykey "$2")
  cp -p "$1" "$BK/$k.$(date +%s)"
  ls -1t "$BK/$k".* 2>/dev/null | tail -n +${KEEP_BACKUPS + 1} | while IFS= read -r old; do rm -f "$old"; done
}
${t.steps}
if ! OUT=$(${testCommand(t.server)} 2>&1); then
${t.rollback}
  printf '%s\\n' "$OUT" | grep -v '^[[:space:]]*$' | tail -n 25 | sed 's/^/SCRIPT_ERR:/'
  exit 3
fi
${t.commit ?? ""}
${reloadCommand(t.server)}
printf '%s\\n' "$OUT" | tail -n 25
`;
}

/**
 * Writes the new text to the file at `p`, a shell word, keeping the owner
 * and mode of a file that exists. The new text is in $CLEAN/new.
 */
function writeFile(p: string): string {
  return `if [ -f ${p} ]; then cp -p ${p} "$CLEAN/old"; HAD=1; else HAD=0; fi
mkdir -p "$(dirname ${p})"
cat "$CLEAN/new" > ${p}
[ "$HAD" = 1 ] || chmod 644 ${p}`;
}

const newText = (content: string) =>
  `printf '%s' ${q(toBase64(content))} | base64 -d > "$CLEAN/new"`;

const restoreFile = (p: string) =>
  `  if [ "$HAD" = 1 ]; then cat "$CLEAN/old" > ${p}; else rm -f ${p}; fi`;

/** Keeps the old text as a backup when it changed. */
const keepOld = (p: string) =>
  `if [ "$HAD" = 1 ] && ! cmp -s "$CLEAN/old" ${p}; then keep "$CLEAN/old" ${p}; fi`;

/** Adds the sites import to the Caddyfile once, with a backup. */
const CADDY_SETUP = `mkdir -p /etc/caddy/sites
[ -f /etc/caddy/sites/${CADDY_KEEP} ] || echo '# Keeps the Termix import valid when no site is on.' > /etc/caddy/sites/${CADDY_KEEP}
if ! grep -qsF ${q(CADDY_IMPORT)} /etc/caddy/Caddyfile; then
  [ -f /etc/caddy/Caddyfile ] && { [ -f /etc/caddy/Caddyfile.termix.bak ] || cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.termix.bak; }
  printf '\\n%s\\n' ${q(CADDY_IMPORT)} >> /etc/caddy/Caddyfile
fi`;

/** Turns on Apache modules and adds Listen lines the site needs. */
function apacheSetup(
  server: ServerInfo,
  modules: string[],
  ports: number[],
): string {
  const lines: string[] = [];
  if (server.layout === "debian" && modules.length) {
    lines.push(
      `a2enmod -q ${modules.map(q).join(" ")} >/dev/null 2>&1 || true`,
    );
  }
  for (const port of ports) {
    if (port === 80) continue;
    lines.push(
      `if ! grep -rqsE --exclude="\${F##*/}" '^[[:space:]]*Listen[[:space:]]+([^[:space:]]*:)?${port}([[:space:]]|$)' ${q(server.root)}; then
  # Below the form lines, so the form still opens.
  if head -n 1 "$F" | grep -q '^# termix-site:'; then sed -i '2a Listen ${port}' "$F"; else sed -i '1i Listen ${port}' "$F"; fi
fi`,
    );
  }
  return lines.join("\n");
}

/**
 * Finds a site file from its candidates and sets F to it, or stops. Also
 * sets EN to 1 when the site is on.
 */
function findSite(server: ServerInfo, candidates: string[]): string {
  const enabledCheck =
    server.layout === "debian"
      ? `EN=0; [ -e ${q(server.enabledDir)}/"\${F##*/}" ] && EN=1`
      : `EN=1; case "$F" in *.disabled) EN=0;; esac`;
  return `F=""
for c in ${candidates.map(q).join(" ")}; do [ -f "$c" ] && { F=$c; break; }; done
[ -n "$F" ] || { echo "SCRIPT_ERR:That site is gone"; exit 1; }
${enabledCheck}`;
}

/**
 * Saves a site file. A new site goes to `newFile` and is turned on; an
 * existing one is found from `candidates` and keeps its place.
 */
export function saveSiteScript(
  server: ServerInfo,
  candidates: string[],
  content: string,
  options: {
    /** The path of a new site, or empty to change an existing one. */
    newFile?: string;
    modules?: string[];
    ports?: number[];
  },
): string {
  const isNew = !!options.newFile;
  const find = isNew
    ? `for c in ${candidates.map(q).join(" ")}; do [ -e "$c" ] && { echo "SCRIPT_ERR:A site with that name already exists"; exit 1; }; done
F=${q(options.newFile!)}`
    : findSite(server, candidates);
  const link = server.layout === "debian" && isNew;
  const steps = [
    find,
    newText(content),
    server.kind === "caddy" ? CADDY_SETUP : "",
    writeFile(`"$F"`),
    server.kind === "apache"
      ? apacheSetup(server, options.modules ?? [], options.ports ?? [])
      : "",
    link ? `L=${q(server.enabledDir)}/"\${F##*/}"\nln -sfn "$F" "$L"` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const rollback = [restoreFile(`"$F"`), link ? `  rm -f "$L"` : ""]
    .filter(Boolean)
    .join("\n");
  return transactionScript({
    server,
    steps,
    rollback,
    commit: keepOld(`"$F"`),
  });
}

export function toggleSiteScript(
  server: ServerInfo,
  candidates: string[],
  on: boolean,
): string {
  if (server.layout === "debian") {
    return transactionScript({
      server,
      steps: `${findSite(server, candidates)}
L=${q(server.enabledDir)}/"\${F##*/}"
${on ? `[ "$EN" = 1 ] && { echo "Already on"; exit 0; }\nln -sfn "$F" "$L"` : `[ "$EN" = 0 ] && { echo "Already off"; exit 0; }\nmv "$L" "$CLEAN/link"`}`,
      rollback: on ? `  rm -f "$L"` : `  mv "$CLEAN/link" "$L"`,
    });
  }
  return transactionScript({
    server,
    steps: `${findSite(server, candidates)}
${on ? `[ "$EN" = 1 ] && { echo "Already on"; exit 0; }\nT="\${F%.disabled}"` : `[ "$EN" = 0 ] && { echo "Already off"; exit 0; }\nT="$F.disabled"`}
[ -e "$T" ] && { echo "SCRIPT_ERR:$T is in the way"; exit 1; }
mv "$F" "$T"`,
    rollback: `  mv "$T" "$F"`,
  });
}

export function deleteSiteScript(
  server: ServerInfo,
  candidates: string[],
): string {
  const debian = server.layout === "debian";
  return transactionScript({
    server,
    steps: `${findSite(server, candidates)}
${debian ? `L=${q(server.enabledDir)}/"\${F##*/}"\n[ -L "$L" ] && mv "$L" "$CLEAN/link"\n` : ""}keep "$F" "$F"
mv "$F" "$CLEAN/site"`,
    rollback: `  mv "$CLEAN/site" "$F"${debian ? `\n  [ -e "$CLEAN/link" ] && mv "$CLEAN/link" "$L"` : ""}`,
  });
}

/** Reads one site file's text. */
export function readSiteScript(
  server: ServerInfo,
  candidates: string[],
): string {
  return `${findSite(server, candidates)}
echo "${MARK}FILE ${server.kind}|$EN|$F"
cat "$F"
`;
}

/** Checks a path on the host is under `root` with links resolved, as R. */
function resolveUnder(path: string, root: string, mustExist: boolean): string {
  return `R=$(realpath -m -- ${q(path)} 2>/dev/null || readlink -f -- ${q(path)})
case "$R" in ${q(root)}/*) ;; *) echo "SCRIPT_ERR:That file is outside ${root}"; exit 1;; esac
${mustExist ? `[ -f "$R" ] || { echo "SCRIPT_ERR:That file does not exist"; exit 1; }` : `[ -d "$R" ] && { echo "SCRIPT_ERR:That is a folder"; exit 1; }`}`;
}

export function listFilesScript(root: string): string {
  return `[ -d ${q(root)} ] || exit 0
find ${q(root)} -maxdepth 4 \\( -type f -o -type l \\) 2>/dev/null | sort | head -n 1000 | while IFS= read -r p; do
  [ -f "$p" ] || continue
  case "$p" in *.termix.bak) continue;; esac
  l=0; [ -L "$p" ] && l=1
  echo "$p|$(wc -c < "$p" 2>/dev/null || echo 0)|$l"
done
exit 0
`;
}

export function readFileScript(path: string, root: string): string {
  return `${resolveUnder(path, root, true)}
[ "$(wc -c < "$R")" -le ${MAX_EDIT_BYTES} ] || { echo "SCRIPT_ERR:The file is too big to edit here"; exit 1; }
echo "${MARK}PATH $R"
base64 < "$R" | tr -d '\\n'
echo
k=$(printf '%s' "$R" | sed 's#^/##; s#/#%#g')
for b in ${q(BACKUP_DIR)}/"$k".*; do
  [ -f "$b" ] && echo "${MARK}BACKUP \${b##*.}|$(wc -c < "$b")"
done
exit 0
`;
}

/**
 * Saves any file under the server's folder. With `backupId` the text comes
 * from that backup instead.
 */
export function writeFileScript(
  server: ServerInfo,
  path: string,
  content: string,
  backupId?: string,
): string {
  const source = backupId
    ? `B="$BK/$(keykey "$R").${backupId}"
[ -f "$B" ] || { echo "SCRIPT_ERR:That backup is gone"; exit 1; }
cp "$B" "$CLEAN/new"`
    : newText(content);
  return transactionScript({
    server,
    steps: `${resolveUnder(path, server.root, !!backupId)}
${source}
${writeFile(`"$R"`)}`,
    rollback: restoreFile(`"$R"`),
    commit: keepOld(`"$R"`),
  });
}

export function testScript(server: ServerInfo): string {
  return `if OUT=$(${testCommand(server)} 2>&1); then echo "${MARK}OK"; else echo "${MARK}FAIL"; fi
printf '%s\\n' "$OUT" | tail -n 40
exit 0
`;
}

export function serviceScript(
  server: ServerInfo,
  action: ServiceAction,
): string {
  const unit = server.unit;
  const rc: Record<ServiceAction, string> = {
    start: `rc-service ${unit} start`,
    stop: `rc-service ${unit} stop`,
    restart: `rc-service ${unit} restart`,
    reload: `rc-service ${unit} reload`,
    enable: `rc-update add ${unit} default`,
    disable: `rc-update del ${unit} default`,
  };
  // A reload or restart with a broken config would take the site down.
  const guard =
    action === "reload" || action === "restart" || action === "start"
      ? `if ! OUT=$(${testCommand(server)} 2>&1); then
  printf '%s\\n' "$OUT" | tail -n 25 | sed 's/^/SCRIPT_ERR:/'
  exit 3
fi
`
      : "";
  return `${guard}if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl ${action} ${unit} 2>&1
else
  ${rc[action]} 2>&1
fi
`;
}

const PACKAGES: Record<ServerKind, Record<string, string>> = {
  nginx: {
    "apt-get": "nginx",
    dnf: "nginx",
    yum: "nginx",
    zypper: "nginx",
    pacman: "nginx",
    apk: "nginx",
  },
  apache: {
    "apt-get": "apache2",
    dnf: "httpd",
    yum: "httpd",
    zypper: "apache2",
    pacman: "apache",
    apk: "apache2",
  },
  caddy: {
    "apt-get": "caddy",
    dnf: "caddy",
    yum: "caddy",
    zypper: "caddy",
    pacman: "caddy",
    apk: "caddy",
  },
};

function installCommand(manager: string, packages: string): string {
  const command: Record<string, string> = {
    "apt-get": `DEBIAN_FRONTEND=noninteractive apt-get -y -q -o DPkg::Lock::Timeout=120 install ${packages}`,
    dnf: `dnf -y install ${packages}`,
    yum: `yum -y install ${packages}`,
    zypper: `zypper -n install ${packages}`,
    pacman: `pacman -S --noconfirm --needed ${packages}`,
    apk: `apk add ${packages}`,
  };
  const line = command[manager];
  if (!line)
    throw new HostScriptError("No supported package manager was found");
  return line;
}

export function installServerScript(manager: string, kind: ServerKind): string {
  const pkg = PACKAGES[kind][manager];
  if (!pkg) throw new HostScriptError("No supported package manager was found");
  const unit =
    kind === "apache"
      ? manager === "apt-get"
        ? "apache2"
        : manager === "zypper"
          ? "apache2"
          : "httpd"
      : kind;
  const update =
    manager === "apt-get" ? "apt-get -q update >/dev/null 2>&1 || true; " : "";
  return `{ ${update}${installCommand(manager, pkg)}; } 2>&1 || exit 1
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl enable --now ${unit} 2>&1 || echo "Installed, but ${unit} did not start. Is another server on the same port?"
elif command -v rc-update >/dev/null 2>&1; then
  rc-update add ${unit} default 2>&1; rc-service ${unit} start 2>&1 || true
fi
`;
}

export function installCertbotScript(
  manager: string,
  kinds: ServerKind[],
): string {
  const plugin = (kind: "nginx" | "apache"): string => {
    const name: Record<string, string> = {
      "apt-get": `python3-certbot-${kind}`,
      dnf: `python3-certbot-${kind}`,
      yum: `python3-certbot-${kind}`,
      zypper: `python3-certbot-${kind}`,
      pacman: `certbot-${kind}`,
      apk: `certbot-${kind}`,
    };
    return name[manager] ?? "";
  };
  const packages = [
    manager === "zypper" ? "python3-certbot" : "certbot",
    ...(kinds.includes("nginx") ? [plugin("nginx")] : []),
    ...(kinds.includes("apache") ? [plugin("apache")] : []),
  ].filter(Boolean);
  return `{ ${installCommand(manager, packages.join(" "))}; } 2>&1\n`;
}

/** Gets a certificate with certbot's nginx or Apache plugin. */
export function certbotScript(
  server: ServerInfo,
  domains: string[],
  options: { email: string; staging: boolean },
): string {
  const how = server.kind === "nginx" ? "--nginx" : "--apache";
  const who = options.email
    ? `--email ${q(options.email)}`
    : "--register-unsafely-without-email";
  const hook = `systemctl reload ${server.unit} 2>/dev/null || rc-service ${server.unit} reload`;
  return `command -v certbot >/dev/null 2>&1 || { echo "SCRIPT_ERR:certbot is not installed"; exit 1; }
certbot certonly --non-interactive --agree-tos ${who}${options.staging ? " --staging" : ""} ${how} --cert-name ${q(domains[0])} ${domains.map((d) => `-d ${q(d)}`).join(" ")} --deploy-hook ${q(hook)} 2>&1
`;
}

/** The log files of the installed servers. */
export function listLogsScript(dirs: string[]): string {
  return `for d in ${dirs.map(q).join(" ")}; do
  [ -d "$d" ] || continue
  for f in "$d"/*; do
    [ -f "$f" ] || continue
    case "$f" in *.gz|*.xz|*.bz2|*.zst) continue;; esac
    echo "$f|$(wc -c < "$f" 2>/dev/null || echo 0)"
  done
done
exit 0
`;
}

export const LOG_ROOT = "/var/log";

export function tailScript(path: string, lines: number): string {
  return `${resolveUnder(path, LOG_ROOT, true)}
tail -n ${lines} -- "$R"
`;
}

export function journalScript(unit: string, lines: number): string {
  return `command -v journalctl >/dev/null 2>&1 || { echo "SCRIPT_ERR:This host has no journal"; exit 1; }
journalctl -u ${q(unit)} -n ${lines} --no-pager -o short-iso 2>&1
`;
}
