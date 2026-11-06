import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  HostScriptError,
  scriptError,
  scriptShell,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";

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
  /** Runs a script on the control host as the login user. */
  run: (
    hostId: number,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
}

export function createRemote(ctx: PluginContext): Remote {
  return {
    run: async (hostId, script, options = {}) => {
      const result = await ctx.ssh.exec(hostId, scriptShell("plain"), {
        stdin: script,
        timeoutMs: options.timeoutMs ?? 30_000,
        maxOutputBytes: options.maxOutputBytes ?? 4_000_000,
        purpose: "ansible",
      });
      if (result.timedOut) {
        throw new HostScriptError("The host took too long to answer", 504);
      }
      if (result.code !== 0 && !options.allowFail) {
        const own = scriptError(result.stdout);
        throw new HostScriptError(
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
