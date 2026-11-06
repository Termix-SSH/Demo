import type {
  PluginContext,
  PluginSshHost,
} from "@termix-ssh/plugin-sdk/backend";
import type { RemoteResult, RemoteRun } from "./checks/types.js";

const POOL = "uptime";
const RESOLVED_TTL_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

interface ExecStream {
  on: (event: string, listener: (...args: never[]) => void) => void;
  stderr: { on: (event: string, listener: (chunk: Buffer) => void) => void };
  close: () => void;
  end: (data?: string) => void;
}

interface ExecClient {
  exec: (
    command: string,
    callback: (error: Error | undefined, stream: ExecStream) => void,
  ) => void;
}

function runOn(
  client: ExecClient,
  command: string,
  stdin: string | undefined,
  timeoutMs: number,
): Promise<RemoteResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        stream.close();
      }, timeoutMs);
      stream.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString("utf8");
      });
      stream.stderr.on("data", (chunk) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString("utf8");
      });
      stream.on("close", (code: number | null) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          code: timedOut ? null : (code ?? null),
          timedOut,
        });
      });
      stream.end(stdin);
    });
  });
}

/**
 * Commands on hosts over pooled connections. asUser and each new connection
 * write an audit line, so a host is resolved once per login and reused.
 */
export function createRelay(ctx: PluginContext): RemoteRun {
  const resolved = new Map<string, { host: PluginSshHost; at: number }>();

  async function resolve(hostId: number, userId: string) {
    const key = `${hostId}:${userId}`;
    const cached = resolved.get(key);
    if (cached && Date.now() - cached.at < RESOLVED_TTL_MS) return cached.host;
    const host = await ctx.asUser(userId, () => ctx.ssh.resolveHost(hostId));
    if (!host) throw new Error("This host can't be reached with your login");
    resolved.set(key, { host, at: Date.now() });
    return host;
  }

  return async (hostId, userId, command, stdin, timeoutMs) => {
    const host = await resolve(hostId, userId);
    try {
      return await ctx.ssh.withConnection<RemoteResult, ExecClient>(
        host,
        { pool: POOL, purpose: "uptime" },
        (client) => runOn(client, command, stdin, timeoutMs),
      );
    } catch (error) {
      resolved.delete(`${hostId}:${userId}`);
      throw error;
    }
  };
}
