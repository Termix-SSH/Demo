import {
  HostScriptError,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";

const USER_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,31}$/;
const FILE_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MARK = "@@TERMIX@@";

/** A user name from a request, or empty for the login user. */
export function cleanUser(value: unknown): string {
  const user = typeof value === "string" ? value.trim() : "";
  if (user && !USER_RE.test(user)) {
    throw new HostScriptError("The user name is not valid");
  }
  return user;
}

/** A /etc/cron.d file name. Cron skips names with dots, so they are refused. */
export function cleanFileName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!FILE_RE.test(name)) {
    throw new HostScriptError(
      "Use letters, numbers, - and _ only for the file name",
    );
  }
  return name;
}

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
echo "user=\${SUDO_USER:-$(id -un)}"
if [ "$(id -u)" = 0 ]; then echo root=1; else echo root=0; fi
command -v crontab >/dev/null 2>&1 && echo installed=1 || echo installed=0
if ps -e -o comm= 2>/dev/null | grep -qxE 'cron|crond|busybox'; then echo running=1; else echo running=0; fi
echo "offset=$(env -u TZ date +%z)"
tz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*/zoneinfo/||')
[ -z "$tz" ] && tz=$(cat /etc/timezone 2>/dev/null)
echo "timezone=$tz"
if [ "$(id -u)" = 0 ]; then
  for f in /var/spool/cron/crontabs/* /var/spool/cron/* /etc/crontabs/*; do
    [ -f "$f" ] && echo "tab=\${f##*/}"
  done
  getent passwd | awk -F: '$3==0 || ($3>=1000 && $3<65534) {print "tab="$1}'
fi
exit 0
`;

/** Reads a crontab. Empty user means the login user's own. */
export function readCrontabScript(user: string): string {
  const flag = user ? ` -u ${shellQuote(user)}` : "";
  return `crontab${flag} -l 2>/dev/null; exit 0\n`;
}

/** Installs a crontab. crontab checks it and refuses a broken one. */
export function writeCrontabScript(user: string, text: string): string {
  const flag = user ? ` -u ${shellQuote(user)}` : "";
  return `printf '%s' ${shellQuote(toBase64(text))} | base64 -d | crontab${flag} -\n`;
}

/**
 * Runs a job's command once, now, as the crontab's user, with the same
 * stdin cron would give it. Output is capped by the caller.
 */
export function runNowScript(user: string, run: string, input: string): string {
  const file = `f=$(mktemp); trap 'rm -f "$f" "$i"' EXIT
i=$(mktemp)
printf '%s' ${shellQuote(toBase64(run))} | base64 -d > "$f"
printf '%s' ${shellQuote(toBase64(input))} | base64 -d > "$i"
chmod 644 "$f" "$i"
T=""; command -v timeout >/dev/null 2>&1 && T="timeout 120"
`;
  if (!user) {
    return `${file}cd ~ 2>/dev/null
$T sh "$f" < "$i" 2>&1
echo "${MARK}EXIT $?"
`;
  }
  const u = shellQuote(user);
  return `${file}getent passwd ${u} >/dev/null || { echo "SCRIPT_ERR:No such user"; exit 1; }
h=$(getent passwd ${u} | cut -d: -f6)
if command -v runuser >/dev/null 2>&1; then
  (cd "$h" 2>/dev/null || cd /; $T runuser -u ${u} -- sh "$f" < "$i" 2>&1)
else
  (cd "$h" 2>/dev/null || cd /; $T su -s /bin/sh -c "sh '$f'" ${u} < "$i" 2>&1)
fi
echo "${MARK}EXIT $?"
`;
}

export const SYSTEM_SCRIPT = `for f in /etc/crontab /etc/cron.d/*; do
  [ -f "$f" ] || continue
  echo "${MARK}FILE $f"
  cat "$f" 2>/dev/null
  echo
done
for p in hourly daily weekly monthly; do
  for f in /etc/cron.$p/*; do
    [ -f "$f" ] && [ -x "$f" ] && echo "${MARK}SCRIPT $p \${f##*/}"
  done
done
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  echo "${MARK}TIMERS $(systemctl list-timers --all --no-legend 2>/dev/null | grep -c .)"
fi
exit 0
`;

const BACKUP = "/var/lib/termix-cron/backup";

/** Writes a /etc/cron.d file as root, keeping the old one as a backup. */
export function writeSystemFileScript(name: string, text: string): string {
  const path = shellQuote(`/etc/cron.d/${name}`);
  return `[ -d /etc/cron.d ] || { echo "SCRIPT_ERR:This host has no /etc/cron.d folder"; exit 1; }
mkdir -p ${BACKUP}
[ -f ${path} ] && cp -p ${path} ${shellQuote(`${BACKUP}/${name}.bak`)}
t=$(mktemp)
printf '%s' ${shellQuote(toBase64(text))} | base64 -d > "$t"
install -m 644 -o root -g root "$t" ${path}
rm -f "$t"
`;
}

export function deleteSystemFileScript(name: string): string {
  const path = shellQuote(`/etc/cron.d/${name}`);
  return `[ -f ${path} ] || { echo "SCRIPT_ERR:That file does not exist"; exit 1; }
mkdir -p ${BACKUP}
cp -p ${path} ${shellQuote(`${BACKUP}/${name}.bak`)}
rm -f ${path}
`;
}

/** Recent cron log lines from the journal, /var/log/cron or syslog. */
export function logsScript(lines: number): string {
  const n = Math.min(Math.max(Math.trunc(lines) || 200, 20), 2000);
  return `out=""
if command -v journalctl >/dev/null 2>&1; then
  out=$(journalctl --no-pager -q -o short-iso -n ${n} -u cron -u crond -u cronie 2>/dev/null)
  [ -n "$out" ] && { echo "${MARK}SOURCE journal"; printf '%s\\n' "$out"; exit 0; }
fi
if [ -r /var/log/cron ]; then echo "${MARK}SOURCE /var/log/cron"; tail -n ${n} /var/log/cron; exit 0; fi
for f in /var/log/syslog /var/log/messages; do
  if [ -r "$f" ]; then echo "${MARK}SOURCE $f"; grep -i cron "$f" | tail -n ${n}; exit 0; fi
done
echo "${MARK}SOURCE none"
exit 0
`;
}
