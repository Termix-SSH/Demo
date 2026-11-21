import type { Client } from "ssh2";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { FleetRepository } from "./repository.js";
import { execCommand } from "@termix-ssh/plugin-sdk/host-commands";

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 16_000;

/** Fleets' actions: run one command on a host, the unit a rollout repeats. */
export function registerOperations(
  ctx: PluginContext,
  repo?: FleetRepository,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  if (repo) {
    ctx.operations.register("fleets.list-fleets", {
      run: async () => {
        const userId = ctx.currentActor();
        const list = userId ? await repo.listByUser(userId) : [];
        const rows = await Promise.all(
          list.map(async (fleet) => ({
            id: String(fleet.id),
            name: fleet.name,
            hosts: (await repo.listEffectiveMembers(userId as string, fleet.id))
              .length,
          })),
        );
        return { summary: `${rows.length} fleets`, data: { rows } };
      },
    });
  }

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

  ctx.operations.register("fleets.exec", {
    describe: (input) => `Would run: ${String(input.command)}`,
    run: async (input, context) => {
      if (context.hostId === undefined) throw new Error("This needs a host");
      const command = String(input.command ?? "").trim();
      if (!command) throw new Error("A command is required");
      const timeoutMs = execTimeout(input.timeoutSeconds);
      const started = Date.now();
      const { stdout, stderr, code } = await ctx.ssh.withConnection(
        context.hostId,
        { pool: "fleet", purpose: "fleet" },
        (client) => execCommand(client as Client, command, timeoutMs),
      );
      return {
        summary: code === 0 ? "Exited 0" : `Exited with code ${String(code)}`,
        changed: true,
        data: {
          exitCode: code,
          stdout: stdout.slice(-MAX_OUTPUT),
          stderr: stderr.slice(-MAX_OUTPUT),
          truncated: stdout.length > MAX_OUTPUT || stderr.length > MAX_OUTPUT,
          durationMs: Date.now() - started,
        },
      };
    },
  });
}

/** Seconds from the caller, kept between 1 and 600. */
export function execTimeout(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return TIMEOUT_MS;
  return Math.min(600, Math.max(1, Math.floor(seconds))) * 1000;
}
