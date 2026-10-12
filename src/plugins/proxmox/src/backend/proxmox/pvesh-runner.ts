import type { Client } from "ssh2";
import { execElevated } from "@termix-ssh/plugin-sdk/host-commands";
import { execCommand } from "./common-utils.js";

type ExecResult = Awaited<ReturnType<typeof execCommand>>;

/** Runs a pvesh command, through sudo when the SSH user is not root. */
export type PveshRunner = (
  command: string,
  timeoutMs: number,
) => Promise<ExecResult>;

export function directRunner(client: Client): PveshRunner {
  return (command, timeoutMs) => execCommand(client, command, timeoutMs);
}

async function runWithSudo(
  client: Client,
  command: string,
  sudoPassword: string | undefined,
  timeoutMs: number,
): Promise<ExecResult> {
  if (sudoPassword) {
    return execElevated(client, command, sudoPassword, {
      forceSudo: true,
      timeoutMs,
    });
  }
  // No stored password: only works with passwordless sudo.
  return execCommand(client, `sudo -n ${command}`, timeoutMs);
}

/**
 * pvesh needs root. Non-root users go through sudo, using the host's sudo
 * password when set, and fall back to running it as-is if that fails.
 */
export function createPveshRunner(
  client: Client,
  sudoPassword?: string,
): PveshRunner {
  let isRoot: Promise<boolean> | null = null;
  const checkRoot = () =>
    (isRoot ??= execCommand(client, "id -u", 10000).then(
      (r) => r.stdout.trim() === "0",
      () => false,
    ));

  return async (command, timeoutMs) => {
    if (await checkRoot()) return execCommand(client, command, timeoutMs);
    const elevated = await runWithSudo(
      client,
      command,
      sudoPassword,
      timeoutMs,
    ).catch(() => null);
    if (elevated && elevated.code === 0) return elevated;
    return execCommand(client, command, timeoutMs);
  };
}
