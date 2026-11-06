import {
  HostScriptError,
  shellQuote,
} from "@termix-ssh/plugin-sdk/host-scripts";
import {
  SIGNALS,
  type AppAction,
  type LogTarget,
  type ManagerKind,
  type SignalName,
} from "../shared/types.js";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;
const UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9:_.@\\-]{0,200}$/;
const USER_RE = /^[a-z_][a-z0-9_.-]{0,31}$/i;

export function cleanPid(value: unknown): number {
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid < 2 || pid > 4_194_304) {
    throw new HostScriptError("The process id is not valid");
  }
  return pid;
}

export function cleanSignal(value: unknown): SignalName {
  const name = String(value ?? "")
    .toUpperCase()
    .replace(/^SIG/, "");
  if (!(SIGNALS as readonly string[]).includes(name)) {
    throw new HostScriptError("The signal is not allowed");
  }
  return name as SignalName;
}

export function cleanNice(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < -20 || n > 19) {
    throw new HostScriptError("Priority must be between -20 and 19");
  }
  return n;
}

export function cleanUnit(value: unknown): string {
  const unit = String(value ?? "").trim();
  if (!UNIT_RE.test(unit)) throw new HostScriptError("The unit is not valid");
  return unit;
}

/** A pm2 id or name, or a supervisor process or group name. */
export function cleanAppKey(manager: ManagerKind, value: unknown): string {
  const key = String(value ?? "").trim();
  if (!NAME_RE.test(key)) {
    throw new HostScriptError(
      manager === "pm2"
        ? "The pm2 id or name is not valid"
        : "The process name is not valid",
    );
  }
  return key;
}

export function cleanManager(value: unknown): ManagerKind {
  if (value === "pm2" || value === "supervisor") return value;
  throw new HostScriptError("The manager is not valid");
}

export function cleanRunUser(value: unknown): string {
  const user = String(value ?? "").trim();
  if (!user) return "";
  if (!USER_RE.test(user)) throw new HostScriptError("The user is not valid");
  return user;
}

/** The command comm shows in ps, which the kernel cuts to 15 characters. */
export function cleanComm(value: unknown): string {
  return String(value ?? "")
    .replace(/[\0\r\n]/g, "")
    .slice(0, 15);
}

const err = (message: string) => `echo ${shellQuote(`SCRIPT_ERR:${message}`)}`;

/** Wraps a pm2 command to run as another user, when one is set. */
export function pm2Command(runUser: string, command: string): string {
  return runUser
    ? `sudo -n -u ${shellQuote(runUser)} -H bash -lc ${shellQuote(command)}`
    : command;
}

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
echo "user=$(id -un)"
echo "root=$([ "$(id -u)" = 0 ] && echo 1 || echo 0)"
echo "ps=$(ps -eo pid=,etimes= --no-headers >/dev/null 2>&1 && echo 1 || echo 0)"
echo "pm2=$(command -v pm2 >/dev/null 2>&1 && echo 1 || echo 0)"
echo "supervisor=$(command -v supervisorctl >/dev/null 2>&1 && echo 1 || echo 0)"
echo "systemd=$([ -d /run/systemd/system ] && echo 1 || echo 0)"
`;

export const LIST_SCRIPT = `out=$(ps -eo pid,ppid,user:20,pcpu,pmem,rss,stat,ni,nlwp,etimes,comm,args --sort=-pcpu --no-headers 2>/dev/null) || ${err("This host needs the procps version of ps")}
[ -n "$out" ] || exit 1
echo "@@cpus"
nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo
echo "@@load"
cat /proc/loadavg 2>/dev/null
echo "@@zombies"
ps -eo stat= 2>/dev/null | grep -c '^Z'
echo "@@ps"
printf '%s\\n' "$out" | head -n 600
`;

export function detailScript(pid: number): string {
  return `pid=${pid}
[ -d /proc/$pid ] || { ${err("That process is gone")}; exit 1; }
echo "@@cmdline"; tr '\\0' ' ' < /proc/$pid/cmdline 2>/dev/null; echo
echo "@@cwd"; readlink /proc/$pid/cwd 2>/dev/null
echo "@@exe"; readlink /proc/$pid/exe 2>/dev/null
echo "@@cgroup"; cat /proc/$pid/cgroup 2>/dev/null
echo "@@status"; grep -E '^(State|Threads|VmRSS|VmSize):' /proc/$pid/status 2>/dev/null
echo "@@env"; tr '\\0' '\\n' < /proc/$pid/environ 2>/dev/null | cut -d= -f1 | head -n 200
echo "@@fds"; ls /proc/$pid/fd 2>/dev/null | wc -l
echo "@@limits"; cat /proc/$pid/limits 2>/dev/null
echo "@@ports"; ss -Hltnup 2>/dev/null | grep "pid=$pid," | head -n 40
echo "@@files"
for f in /proc/$pid/fd/*; do
  n=\${f##*/}
  t=$(readlink "$f" 2>/dev/null) || continue
  case "$t" in /dev/*|/proc/*|/sys/*|/run/*) continue;; /*) ;; *) continue;; esac
  [ -f "$t" ] || continue
  fl=$(awk '/^flags:/{print $2}' /proc/$pid/fdinfo/$n 2>/dev/null)
  [ $(( 8#\${fl:-0} & 3 )) -ne 0 ] || continue
  echo "$n|$t"
done | head -n 60
`;
}

/** Sends a signal, but only when the pid still runs the expected command. */
export function signalScript(
  pid: number,
  signal: SignalName,
  comm: string,
): string {
  const guard = comm
    ? `[ "$(cat /proc/$pid/comm 2>/dev/null)" = ${shellQuote(comm)} ] || { ${err("That pid now belongs to another process")}; exit 1; }\n`
    : "";
  return `pid=${pid}
[ -d /proc/$pid ] || { ${err("That process is gone")}; exit 1; }
${guard}kill -${signal} $pid 2>&1 || exit 1
echo "Sent ${signal} to $pid"
`;
}

export function reniceScript(pid: number, nice: number, comm: string): string {
  const guard = comm
    ? `[ "$(cat /proc/$pid/comm 2>/dev/null)" = ${shellQuote(comm)} ] || { ${err("That pid now belongs to another process")}; exit 1; }\n`
    : "";
  return `pid=${pid}
[ -d /proc/$pid ] || { ${err("That process is gone")}; exit 1; }
${guard}renice -n ${nice} -p $pid 2>&1 || exit 1
`;
}

/** Reads pm2 apps. A missing pm2 prints @@none. Runs as the login user. */
export function pm2ListScript(runUser: string): string {
  return `if command -v pm2 >/dev/null 2>&1; then ${pm2Command(runUser, "pm2 jlist 2>/dev/null")}; else echo "@@none"; fi
exit 0
`;
}

/** Reads supervisor. A missing supervisorctl prints @@none. */
export const SUPERVISOR_LIST_SCRIPT = `if command -v supervisorctl >/dev/null 2>&1; then supervisorctl status 2>&1 | head -n 300; else echo "@@none"; fi
exit 0
`;

export function appActionScript(
  manager: ManagerKind,
  key: string,
  action: AppAction | "delete" | "flush",
  runUser: string,
): string {
  const k = shellQuote(key);
  if (manager === "pm2") {
    const verb = action === "reload" ? "reload" : action;
    return pm2Command(runUser, `pm2 ${verb} ${k} 2>&1`) + "\n";
  }
  if (action === "delete") {
    return (
      err("Supervisor processes are removed in the config files") + "\nexit 1\n"
    );
  }
  if (action === "flush") {
    return `supervisorctl clear ${k} 2>&1\n`;
  }
  if (action === "reload") return `supervisorctl signal HUP ${k} 2>&1\n`;
  return `supervisorctl ${action} ${k} 2>&1\n`;
}

export const SUPERVISOR_REFRESH_SCRIPT = `supervisorctl reread 2>&1 && supervisorctl update 2>&1\n`;

export interface LogOptions {
  lines: number;
  follow: boolean;
  grep?: string;
  runUser: string;
}

export function cleanLines(value: unknown, fallback = 200): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(2000, Math.max(1, Math.floor(n)));
}

export function parseTarget(raw: unknown): LogTarget {
  const t = (raw ?? {}) as Record<string, unknown>;
  switch (t.kind) {
    case "journal":
      return { kind: "journal", unit: cleanUnit(t.unit) };
    case "journal-pid":
      return { kind: "journal-pid", pid: cleanPid(t.pid) };
    case "pm2":
      return { kind: "pm2", key: cleanAppKey("pm2", t.key) };
    case "supervisor":
      return {
        kind: "supervisor",
        key: cleanAppKey("supervisor", t.key),
        stream: t.stream === "stderr" ? "stderr" : "stdout",
      };
    case "file": {
      const fd = Number(t.fd);
      if (!Number.isInteger(fd) || fd < 0 || fd > 65535) {
        throw new HostScriptError("The file descriptor is not valid");
      }
      return { kind: "file", pid: cleanPid(t.pid), fd };
    }
    default:
      throw new HostScriptError("The log source is not valid");
  }
}

/** True when reading this source can show any file a process has open. */
export const needsEdit = (target: LogTarget) => target.kind === "file";

export function logScript(target: LogTarget, options: LogOptions): string {
  const n = cleanLines(options.lines);
  const grep =
    !options.follow && options.grep
      ? ` | grep -a -i -F -e ${shellQuote(options.grep.slice(0, 200))} || true`
      : "";
  switch (target.kind) {
    case "journal":
    case "journal-pid": {
      const who =
        target.kind === "journal"
          ? `-u ${shellQuote(target.unit)}`
          : `_PID=${target.pid}`;
      return `journalctl ${who} -n ${n} --no-pager -o short-iso ${options.follow ? "-f " : ""}2>&1${grep}\n`;
    }
    case "pm2": {
      const cmd = options.follow
        ? `pm2 logs ${shellQuote(target.key)} --raw --lines ${n}`
        : `pm2 logs ${shellQuote(target.key)} --raw --nostream --lines ${n}`;
      return `${pm2Command(options.runUser, cmd)} 2>&1${grep}\n`;
    }
    case "supervisor": {
      const k = shellQuote(target.key);
      return options.follow
        ? `supervisorctl tail -f ${k} ${target.stream} 2>&1\n`
        : `supervisorctl tail -${n * 200} ${k} ${target.stream} 2>&1${grep ? grep : ` | tail -n ${n}`}\n`;
    }
    case "file":
      return `pid=${target.pid}; fd=${target.fd}
p=$(readlink /proc/$pid/fd/$fd 2>/dev/null)
case "$p" in /dev/*|/proc/*|/sys/*) ${err("That file can't be read here")}; exit 1;; /*) ;; *) ${err("That file is not open anymore")}; exit 1;; esac
[ -f "$p" ] || { ${err("That file is not open anymore")}; exit 1; }
fl=$(awk '/^flags:/{print $2}' /proc/$pid/fdinfo/$fd 2>/dev/null)
[ $(( 8#\${fl:-0} & 3 )) -ne 0 ] || { ${err("Only files the process writes can be read")}; exit 1; }
${options.follow ? `tail -n ${n} -F -- "$p" 2>&1` : `tail -n ${n} -- "$p" 2>&1${grep}`}
`;
  }
}
