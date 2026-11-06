import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { scriptShell } from "@termix-ssh/plugin-sdk/host-scripts";
import { connectionArgs } from "./drivers/ipmi.js";
import {
  DriverError,
  type CommandResult,
  type Target,
} from "./drivers/types.js";

const TIMEOUT_MS = 30_000;
const OUTPUT_LIMIT = 512 * 1024;

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The script a relay host runs. The password travels as base64 on stdin, never in argv. */
export function relayScript(target: Target, args: string[]): string {
  const password = Buffer.from(target.credentials.password ?? "").toString(
    "base64",
  );
  const line = [...connectionArgs(target), ...args].map(shellQuote).join(" ");
  return [
    `IPMI_PASSWORD=$(printf %s ${shellQuote(password)} | base64 -d)`,
    "export IPMI_PASSWORD",
    "command -v ipmitool >/dev/null 2>&1 || { echo 'ipmitool is not installed on this host' >&2; exit 127; }",
    `ipmitool ${line}`,
    "",
  ].join("\n");
}

function clip(text: string): string {
  return text.length > OUTPUT_LIMIT ? text.slice(0, OUTPUT_LIMIT) : text;
}

/** Runs ipmitool on the Termix server, or on the relay host when the BMC has one. */
export function createIpmitool(ctx: PluginContext) {
  async function onServer(
    target: Target,
    args: string[],
  ): Promise<CommandResult> {
    const allowed = await ctx.settings.get<boolean>("allowServerIpmitool");
    if (allowed === false) {
      throw new DriverError(
        "Running ipmitool on the Termix server is turned off. Pick a relay host or ask an admin.",
      );
    }
    let child;
    try {
      child = await ctx.process.run(
        "ipmitool",
        [...connectionArgs(target), ...args],
        {
          env: { IPMI_PASSWORD: target.credentials.password ?? "" },
          timeoutMs: TIMEOUT_MS,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DriverError(
        /ENOENT/.test(message)
          ? "ipmitool is not installed on the Termix server. Install it or pick a relay host."
          : message,
      );
    }
    let stdout = "";
    let stderr = "";
    child.onStdout((chunk) => (stdout = clip(stdout + chunk)));
    child.onStderr((chunk) => (stderr = clip(stderr + chunk)));
    let code: number | null;
    try {
      code = (await child.exited).code;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DriverError(
        /ENOENT/.test(message)
          ? "ipmitool is not installed on the Termix server. Install it or pick a relay host."
          : message,
      );
    }
    return { stdout, stderr, code };
  }

  async function onRelay(
    hostId: number,
    target: Target,
    args: string[],
  ): Promise<CommandResult> {
    const exec = () =>
      ctx.ssh.exec(hostId, scriptShell("plain"), {
        stdin: relayScript(target, args),
        timeoutMs: TIMEOUT_MS,
        pool: "out-of-band",
      } as never);
    try {
      const result = target.actor
        ? await ctx.asUser(target.actor, exec)
        : await exec();
      return {
        stdout: result.stdout,
        stderr: result.timedOut ? "The relay host timed out" : result.stderr,
        code: result.timedOut ? null : result.code,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DriverError(`Could not use the relay host: ${message}`);
    }
  }

  return (target: Target, args: string[]): Promise<CommandResult> =>
    target.options.relayHostId
      ? onRelay(target.options.relayHostId, target, args)
      : onServer(target, args);
}
