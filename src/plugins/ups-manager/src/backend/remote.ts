import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  scriptError,
  scriptShell,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { UpsError } from "./errors.js";

export { scrub } from "@termix-ssh/plugin-sdk/host-scripts";

export interface Remote {
  /** Runs a script as the login user. UPS tools do not need root to read. */
  run: (hostId: number, script: string, timeoutMs?: number) => Promise<string>;
}

export function createRemote(ctx: PluginContext): Remote {
  return {
    async run(hostId, script, timeoutMs = 25_000) {
      const result = await ctx.ssh.exec(hostId, scriptShell("plain"), {
        stdin: script,
        timeoutMs,
        maxOutputBytes: 512 * 1024,
        purpose: "ups-manager",
      });
      if (result.timedOut) {
        throw new UpsError("The host took too long", 504, { code: "timeout" });
      }
      if (result.code !== 0) {
        const own = scriptError(result.stdout);
        throw new UpsError(
          scrub(own || result.stderr || result.stdout || "Command failed", 600),
        );
      }
      return result.stdout;
    },
  };
}
