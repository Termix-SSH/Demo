import type { Client } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { execCommand } from "@termix-ssh/plugin-sdk/host-commands";

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 16_000;

/** Fleets' actions: run one command on a host, the unit a rollout repeats. */
export function registerOperations(ctx: PluginContext): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("fleets.run-command", {
    describe: (input) => `Would run: ${String(input.command)}`,
    run: async (input, context) => {
      if (context.hostId === undefined) throw new Error("This needs a host");
      const command = String(input.command ?? "").trim();
      if (!command) throw new Error("A command is required");
      const { stdout, stderr, code } = await ctx.ssh.withConnection(
        context.hostId,
        { pool: "fleet", purpose: "fleet" },
        (client) => execCommand(client as Client, command, TIMEOUT_MS),
      );
      const output = [stdout, stderr].filter(Boolean).join("\n");
      if (code !== 0) {
        throw new Error(
          `Exited with code ${code}${output ? `: ${output.slice(0, 500)}` : ""}`,
        );
      }
      return {
        summary: `Ran on the host`,
        changed: true,
        data: { output: output.slice(0, MAX_OUTPUT) },
      };
    },
  });
}
