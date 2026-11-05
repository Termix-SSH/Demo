import {
  HostScriptError,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";

export const MARK = "@@TERMIX@@";
const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}\$?$/;
const PATH_RE = /^\/[A-Za-z0-9/._+-]{0,250}$/;

export function cleanName(value: unknown, what = "user"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!NAME_RE.test(name)) {
    throw new HostScriptError(
      `The ${what} name must start with a letter and use only a-z, 0-9, - and _`,
    );
  }
  return name;
}

export function cleanNames(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HostScriptError("Groups must be a list");
  return [...new Set(value.map((item) => cleanName(item, "group")))];
}

export function cleanPath(value: unknown, what: string): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!PATH_RE.test(path) || path.includes("..")) {
    throw new HostScriptError(`The ${what} is not a valid path`);
  }
  return path;
}

export function cleanComment(value: unknown): string {
  const comment = typeof value === "string" ? value.trim() : "";
  if (/[:\r\n\0]/.test(comment) || comment.length > 100) {
    throw new HostScriptError("The full name can't contain : or line breaks");
  }
  return comment;
}

export function cleanPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (!password) throw new HostScriptError("Enter a password");
  if (/[\r\n\0]/.test(password) || password.length > 200) {
    throw new HostScriptError("The password can't contain line breaks");
  }
  return password;
}

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
echo "user=\${SUDO_USER:-$(id -un)}"
if [ "$(id -u)" = 0 ]; then echo root=1; else echo root=0; fi
if getent group sudo >/dev/null 2>&1; then echo sudogroup=sudo
elif getent group wheel >/dev/null 2>&1; then echo sudogroup=wheel; fi
echo "uidmin=$(awk '/^UID_MIN/{print $2}' /etc/login.defs 2>/dev/null)"
command -v useradd >/dev/null 2>&1 && command -v usermod >/dev/null 2>&1 && echo tools=1 || echo tools=0
grep -E '^/' /etc/shells 2>/dev/null | sort -u | sed 's/^/shell=/'
exit 0
`;

export const LIST_SCRIPT = `echo "${MARK}PASSWD"
getent passwd
echo "${MARK}GROUP"
getent group
if [ "$(id -u)" = 0 ]; then echo "${MARK}SHADOW"; getent shadow 2>/dev/null; fi
echo "${MARK}ME \${SUDO_USER:-$(id -un)}"
echo "${MARK}NOW $(date +%s)"
exit 0
`;

/** Last login and authorized_keys of one user. */
export function detailScript(name: string): string {
  const u = shellQuote(name);
  return `h=$(getent passwd ${u} | cut -d: -f6)
echo "${MARK}LAST"
if command -v lastlog2 >/dev/null 2>&1; then lastlog2 -u ${u} 2>/dev/null | tail -n 1
elif command -v lastlog >/dev/null 2>&1; then lastlog -u ${u} 2>/dev/null | tail -n 1
elif command -v last >/dev/null 2>&1; then last -n 1 -w ${u} 2>/dev/null | grep -m1 . | grep -v '^wtmp'
elif command -v wtmpdb >/dev/null 2>&1; then wtmpdb last -n 1 ${u} 2>/dev/null | grep -m1 . | grep -v '^wtmpdb'
else echo "${MARK}NOLOG"; fi
echo "${MARK}KEYS"
if [ -n "$h" ] && [ -f "$h/.ssh/authorized_keys" ]; then
  cat "$h/.ssh/authorized_keys" 2>/dev/null || echo "${MARK}DENIED"
fi
exit 0
`;
}

// Stops a script before it touches the login user or root.
const guard = (name: string) => `me=\${SUDO_USER:-$(id -un)}
if [ ${shellQuote(name)} = "$me" ] || [ ${shellQuote(name)} = root ]; then
  echo "SCRIPT_ERR:You can't do this to root or the user Termix logs in as"; exit 1
fi
`;

const exists = (name: string) =>
  `getent passwd ${shellQuote(name)} >/dev/null || { echo "SCRIPT_ERR:No such user"; exit 1; }\n`;

const setPassword = (name: string, password: string) =>
  `printf '%s' ${shellQuote(toBase64(`${name}:${password}`))} | base64 -d | chpasswd\n`;

export function createScript(options: {
  name: string;
  comment: string;
  shell: string;
  home: string;
  createHome: boolean;
  groups: string[];
  password: string;
}): string {
  const args = [
    options.createHome ? "-m" : "-M",
    options.home ? `-d ${shellQuote(options.home)}` : "",
    options.shell ? `-s ${shellQuote(options.shell)}` : "",
    options.comment ? `-c ${shellQuote(options.comment)}` : "",
    options.groups.length ? `-G ${shellQuote(options.groups.join(","))}` : "",
    shellQuote(options.name),
  ]
    .filter(Boolean)
    .join(" ");
  return `set -e
if getent passwd ${shellQuote(options.name)} >/dev/null; then echo "SCRIPT_ERR:That user already exists"; exit 1; fi
useradd ${args}
${options.password ? setPassword(options.name, options.password) : ""}`;
}

export function updateScript(
  name: string,
  changes: { comment?: string; shell?: string; groups?: string[] },
): string {
  const args = [
    changes.comment !== undefined ? `-c ${shellQuote(changes.comment)}` : "",
    changes.shell ? `-s ${shellQuote(changes.shell)}` : "",
    changes.groups !== undefined
      ? `-G ${shellQuote(changes.groups.join(","))}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!args) throw new HostScriptError("Nothing to change");
  return `${exists(name)}usermod ${args} ${shellQuote(name)}\n`;
}

export function passwordScript(name: string, password: string): string {
  return `${exists(name)}${setPassword(name, password)}`;
}

/** Locking also expires the account, so SSH keys stop working too. */
export function lockScript(name: string, lock: boolean): string {
  const u = shellQuote(name);
  return lock
    ? `${exists(name)}${guard(name)}usermod -L -e 1 ${u}\n`
    : `${exists(name)}usermod -U ${u} 2>/dev/null || true\nusermod -e '' ${u}\n`;
}

export function expirePasswordScript(name: string): string {
  return `${exists(name)}chage -d 0 ${shellQuote(name)}\n`;
}

export function deleteScript(name: string, removeHome: boolean): string {
  const u = shellQuote(name);
  // userdel -r exits non zero for a missing mail spool, so check the result.
  return `${exists(name)}${guard(name)}out=$(userdel ${removeHome ? "-r " : ""}${u} 2>&1)
if getent passwd ${u} >/dev/null; then
  echo "SCRIPT_ERR:$(printf '%s' "$out" | head -n 3 | tr '\\n' ' ')"; exit 1
fi
exit 0
`;
}

export function groupMemberScript(
  user: string,
  group: string,
  add: boolean,
  sudoGroup: string,
): string {
  const protect = !add && group === sudoGroup ? guard(user) : "";
  return `${exists(user)}${protect}gpasswd ${add ? "-a" : "-d"} ${shellQuote(user)} ${shellQuote(group)} >/dev/null\n`;
}

export function createGroupScript(name: string): string {
  return `groupadd ${shellQuote(name)}\n`;
}

export function deleteGroupScript(name: string): string {
  return `groupdel ${shellQuote(name)}\n`;
}

/** Writes authorized_keys as root, owned by the user. Refuses symlinks. */
export function writeKeysScript(name: string, text: string): string {
  const u = shellQuote(name);
  return `${exists(name)}h=$(getent passwd ${u} | cut -d: -f6)
g=$(id -gn ${u})
[ -n "$h" ] && [ -d "$h" ] || { echo "SCRIPT_ERR:This user has no home folder"; exit 1; }
if [ -L "$h/.ssh" ] || [ -L "$h/.ssh/authorized_keys" ]; then echo "SCRIPT_ERR:~/.ssh is a link, change it on the host"; exit 1; fi
install -d -m 700 -o ${u} -g "$g" "$h/.ssh"
t=$(mktemp)
printf '%s' ${shellQuote(toBase64(text))} | base64 -d > "$t"
install -m 600 -o ${u} -g "$g" "$t" "$h/.ssh/authorized_keys"
rm -f "$t"
`;
}

export const SESSIONS_SCRIPT = `echo "${MARK}WHO"
who 2>/dev/null
echo "${MARK}LAST"
{ last -n 30 -w 2>/dev/null || wtmpdb last -n 30 2>/dev/null; } | grep -v '^$' | grep -v '^wtmp'
exit 0
`;
