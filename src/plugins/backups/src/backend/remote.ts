import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  SUDO_REFUSED_RE,
  scriptError,
  scriptShell,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { BackupsError } from "./errors.js";

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
  /** Runs a script as root, or through passwordless sudo. */
  root: (
    hostId: number,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
}

export function createRemote(ctx: PluginContext): Remote {
  return {
    async root(hostId, script, options = {}) {
      const result = await ctx.ssh.exec(hostId, scriptShell("root"), {
        stdin: script,
        timeoutMs: options.timeoutMs ?? 60_000,
        maxOutputBytes: options.maxOutputBytes ?? 2 * 1024 * 1024,
        purpose: "backups",
      });
      if (result.timedOut) {
        throw new BackupsError("The host took too long", 504, {
          code: "timeout",
        });
      }
      if (result.code !== 0 && SUDO_REFUSED_RE.test(result.stderr)) {
        throw new BackupsError(
          "This host needs passwordless sudo, or a root login",
          400,
          { code: "sudo" },
        );
      }
      if (result.code !== 0 && !options.allowFail) {
        const own = scriptError(result.stdout);
        throw new BackupsError(
          scrub(
            own || result.stderr || result.stdout || "Command failed",
            1500,
          ),
        );
      }
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code,
      };
    },
  };
}
