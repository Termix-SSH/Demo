import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  SUDO_REFUSED_RE,
  scriptError,
  scriptShell,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { StorageError } from "./errors.js";

export { scrub } from "@termix-ssh/plugin-sdk/host-scripts";

export interface RunOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface Remote {
  /**
   * Reads as root when passwordless sudo works, otherwise as the login user.
   * The reader script reports which one it got.
   */
  read: (
    hostId: number,
    sudo: boolean,
    script: string,
    options?: RunOptions,
  ) => Promise<string>;
  /** Runs a change as root. Needs passwordless sudo or a root login. */
  root: (
    hostId: number,
    sudo: boolean,
    script: string,
    options?: RunOptions,
  ) => Promise<string>;
}

export function createRemote(ctx: PluginContext): Remote {
  async function exec(
    hostId: number,
    shell: string,
    script: string,
    options: RunOptions,
  ) {
    const result = await ctx.ssh.exec(hostId, shell, {
      stdin: script,
      timeoutMs: options.timeoutMs ?? 90_000,
      maxOutputBytes: options.maxOutputBytes ?? 4 * 1024 * 1024,
      purpose: "storage-health",
    });
    if (result.timedOut) {
      throw new StorageError("The host took too long", 504, {
        code: "timeout",
      });
    }
    return result;
  }

  function failure(result: { stdout: string; stderr: string }): StorageError {
    const own = scriptError(result.stdout);
    return new StorageError(
      scrub(own || result.stderr || result.stdout || "Command failed", 1200),
    );
  }

  return {
    async read(hostId, sudo, script, options = {}) {
      if (sudo) {
        const root = await exec(hostId, scriptShell("root"), script, options);
        if (root.code === 0) return root.stdout;
        if (!SUDO_REFUSED_RE.test(root.stderr)) throw failure(root);
      }
      const plain = await exec(hostId, scriptShell("plain"), script, options);
      if (plain.code !== 0) throw failure(plain);
      return plain.stdout;
    },
    async root(hostId, sudo, script, options = {}) {
      const result = await exec(
        hostId,
        scriptShell(sudo ? "root" : "root-only"),
        script,
        options,
      );
      if (result.code !== 0 && SUDO_REFUSED_RE.test(result.stderr)) {
        throw new StorageError(
          "This host needs passwordless sudo, or a root login",
          400,
          { code: "sudo" },
        );
      }
      if (result.code !== 0) throw failure(result);
      return result.stdout;
    },
  };
}
