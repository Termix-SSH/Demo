import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  HostScriptError,
  NOT_SUDOER_RE,
  SCRIPT_PRELUDE,
  SUDO_REFUSED_RE,
  SUDO_WRONG_RE,
  scriptError,
  scriptShell,
  scrub,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";

const SUDO_ENV = `env PATH="$PATH" SYSTEMD_COLORS=0 SYSTEMD_PAGER=cat LC_ALL=C TZ=UTC`;
const PASSWORD_CACHE_MS = 5 * 60_000;

export interface RunOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Return the output even when the script exits non zero. */
  allowFail?: boolean;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface Remote {
  /** Runs a change as root, with the host's sudo when `sudo` is on. */
  root: (
    hostId: number,
    sudo: boolean,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** Runs a read as root when it can, else as the login user. */
  read: (
    hostId: number,
    sudo: boolean,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** Runs as the login user. */
  plain: (
    hostId: number,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
}

/**
 * Runs a script as root with a sudo password. The password is the first line
 * of stdin and the script goes to a private temp file, so neither shows up
 * in a process list, even when the script holds a secret of its own.
 */
export function sudoStdin(script: string, password: string): string {
  if (/[\r\n\0]/.test(password)) {
    throw new HostScriptError("A sudo password can't contain a line break");
  }
  return `IFS= read -r TERMIX_PW
${password}
umask 077
f=$(mktemp) || exit 1
trap 'rm -f "$f"' EXIT
printf '%s' ${shellQuote(toBase64(script))} | base64 -d > "$f"
if [ "$(id -u)" = "0" ]; then unset TERMIX_PW; bash "$f"; exit $?
elif sudo -n true 2>/dev/null; then unset TERMIX_PW; sudo -n ${SUDO_ENV} bash "$f"; exit $?
else P=$TERMIX_PW; unset TERMIX_PW; printf '%s\\n' "$P" | sudo -k -S -p '' ${SUDO_ENV} bash "$f"; exit $?
fi
`;
}

export function createRemote(ctx: PluginContext): Remote {
  const passwords = new Map<string, { value: string; at: number }>();

  // resolveHost writes an audit line each time, so it is kept for a few minutes.
  async function sudoPassword(hostId: number): Promise<string> {
    const key = `${ctx.currentActor() ?? ""}:${hostId}`;
    const cached = passwords.get(key);
    if (cached && Date.now() - cached.at < PASSWORD_CACHE_MS) {
      return cached.value;
    }
    const host = await ctx.ssh.resolveHost(hostId).catch(() => null);
    const value =
      typeof host?.sudoPassword === "string" ? host.sudoPassword : "";
    passwords.set(key, { value, at: Date.now() });
    return value;
  }

  async function exec(
    hostId: number,
    command: string,
    stdin: string,
    options: RunOptions,
  ) {
    const result = await ctx.ssh.exec(hostId, command, {
      stdin,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxOutputBytes: options.maxOutputBytes,
      purpose: "process-manager",
    });
    if (result.timedOut) {
      throw new HostScriptError("The host took too long to answer", 504);
    }
    return result;
  }

  function check(
    result: Awaited<ReturnType<typeof exec>>,
    options: RunOptions,
  ): RunResult {
    if (result.code !== 0 && !options.allowFail) {
      if (
        SUDO_REFUSED_RE.test(result.stderr) ||
        NOT_SUDOER_RE.test(result.stderr) ||
        SUDO_WRONG_RE.test(result.stderr)
      ) {
        throw new HostScriptError(
          SUDO_WRONG_RE.test(result.stderr)
            ? "The saved Sudo Password for this host is wrong"
            : "This host needs a root login, passwordless sudo or a saved Sudo Password",
          400,
          { code: "sudo" },
        );
      }
      const own = scriptError(result.stdout);
      throw new HostScriptError(
        scrub(own || result.stderr || result.stdout || "Command failed", 1500),
      );
    }
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }

  const refused = (stderr: string) =>
    SUDO_WRONG_RE.test(stderr) || NOT_SUDOER_RE.test(stderr);

  return {
    root: async (hostId, sudo, script, options = {}) => {
      const opts = { timeoutMs: 60_000, ...options };
      const password = sudo ? await sudoPassword(hostId) : "";
      const result = password
        ? await exec(
            hostId,
            `${SCRIPT_PRELUDE}exec bash -s`,
            sudoStdin(script, password),
            opts,
          )
        : await exec(
            hostId,
            scriptShell(sudo ? "root" : "root-only"),
            script,
            opts,
          );
      return check(result, opts);
    },
    read: async (hostId, sudo, script, options = {}) => {
      const password = sudo ? await sudoPassword(hostId) : "";
      if (password) {
        const result = await exec(
          hostId,
          `${SCRIPT_PRELUDE}exec bash -s`,
          sudoStdin(script, password),
          options,
        );
        // A read still works as the login user when sudo says no.
        if (result.code === 0 || !refused(result.stderr)) {
          return check(result, options);
        }
        return check(
          await exec(hostId, scriptShell("plain"), script, options),
          options,
        );
      }
      return check(
        await exec(
          hostId,
          scriptShell(sudo ? "auto" : "plain"),
          script,
          options,
        ),
        options,
      );
    },
    plain: async (hostId, script, options = {}) =>
      check(await exec(hostId, scriptShell("plain"), script, options), options),
  };
}
