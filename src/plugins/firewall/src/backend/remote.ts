import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  SUDO_REFUSED_RE,
  scriptError,
  scriptShell,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { FirewallError } from "./errors.js";

export { scrub } from "@termix-ssh/plugin-sdk/host-scripts";

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
  /** Runs a script as root. Uses passwordless sudo when `sudo` is on. */
  root: (
    hostId: number,
    sudo: boolean,
    script: string,
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** Opens a new connection and runs a tiny command, to see the host still lets Termix in. */
  probe: (hostId: number) => Promise<boolean>;
}

export function createRemote(ctx: PluginContext): Remote {
  return {
    async root(hostId, sudo, script, options = {}) {
      const result = await ctx.ssh.exec(
        hostId,
        scriptShell(sudo ? "root" : "root-only"),
        {
          stdin: script,
          timeoutMs: options.timeoutMs ?? 60_000,
          maxOutputBytes: options.maxOutputBytes ?? 2 * 1024 * 1024,
          purpose: "firewall",
        },
      );
      if (result.timedOut) {
        throw new FirewallError("The host took too long", 504, {
          code: "timeout",
        });
      }
      if (result.code !== 0 && SUDO_REFUSED_RE.test(result.stderr)) {
        throw new FirewallError(
          "This host needs passwordless sudo, or a root login",
          400,
          { code: "sudo" },
        );
      }
      if (result.code !== 0 && !options.allowFail) {
        const own = scriptError(result.stdout);
        throw new FirewallError(
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
    async probe(hostId) {
      try {
        const result = await ctx.ssh.exec(hostId, "echo termix-ok", {
          timeoutMs: 15_000,
          purpose: "firewall",
        });
        return result.code === 0 && result.stdout.includes("termix-ok");
      } catch {
        return false;
      }
    },
  };
}
