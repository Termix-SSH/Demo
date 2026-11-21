import { AsyncResource } from "node:async_hooks";
import { StringDecoder } from "node:string_decoder";
import type {
  PluginContext,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";
import {
  HostScriptError,
  streamCommand,
} from "@termix-ssh/plugin-sdk/host-scripts";
import { MAX_FOLLOW_HOSTS, type LogEntry } from "../shared/types.js";
import { createLineReader, followScript } from "./follow-script.js";
import {
  levelPasses,
  lineMatcher,
  originPasses,
  parseSearch,
} from "./query.js";
import { hostLabel, type SearchService } from "./search.js";

const OPEN = 1;
const PING_MS = 30_000;
const FLUSH_MS = 250;
/** Most lines kept between flushes. Older ones are dropped and counted. */
const MAX_PENDING = 2000;
const MAX_MESSAGE_BYTES = 64 * 1024;

/** The parts of an ssh2 client and channel the stream uses. */
interface Channel {
  on(event: "data" | "close" | "error", fn: (chunk?: Buffer) => void): void;
  stderr: { on(event: "data", fn: (chunk: Buffer) => void): void };
  end(): void;
  close(): void;
}
interface SshClient {
  exec(
    command: string,
    cb: (err: Error | undefined, ch: Channel) => void,
  ): void;
}
interface Socket {
  readyState: number;
  send(data: string): void;
  ping(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", fn: (raw: Buffer) => void): void;
  on(event: "close" | "error", fn: () => void): void;
}

interface HostStream {
  dispose: () => void;
  channel: Channel | null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * New log lines from many hosts at /plugin-ws/log-search/follow. The search
 * filters run here, so only matching lines cross the socket. Public with
 * optionalAuth like the other plugin sockets: the handler refuses a socket
 * without a user or without log-search.use.
 */
export function registerFollow(ctx: PluginContext, search: SearchService) {
  const live = new Set<() => void>();
  ctx.disposables.add(() => {
    for (const end of [...live]) end();
    live.clear();
  });

  const onConnection = async (connection: PluginWebSocketConnection) => {
    const ws = connection.socket as unknown as Socket;
    const userId = connection.userId;
    if (!userId || !(await ctx.rbac.hasFor(userId, "use"))) {
      ws.close(1008, "Authentication required");
      return;
    }

    let streams: HostStream[] = [];
    let attempt = 0;
    let paused = false;
    let pending: LogEntry[] = [];
    let dropped = 0;
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(message));
    };

    const flushTimer = setInterval(() => {
      if (paused || (!pending.length && !dropped)) return;
      send({ type: "lines", data: pending, dropped });
      pending = [];
      dropped = 0;
    }, FLUSH_MS);
    const pingTimer = setInterval(() => {
      if (ws.readyState === OPEN) ws.ping();
    }, PING_MS);

    const push = (entry: LogEntry) => {
      pending.push(entry);
      if (pending.length > MAX_PENDING) {
        dropped += pending.length - MAX_PENDING;
        pending = pending.slice(-MAX_PENDING);
      }
    };

    const stopStreams = () => {
      const current = streams;
      streams = [];
      for (const stream of current) {
        try {
          // EOF on stdin is what stops the commands on the host.
          stream.channel?.end();
          stream.channel?.close();
        } catch {
          // already closed
        }
        stream.dispose();
      }
    };

    const cleanup = () => {
      attempt++;
      clearInterval(flushTimer);
      clearInterval(pingTimer);
      stopStreams();
      live.delete(shutdown);
    };
    const shutdown = () => {
      cleanup();
      try {
        ws.close(1001, "Log Search turned off");
      } catch {
        // already closed
      }
    };
    live.add(shutdown);

    const connect = async (data: unknown) => {
      const myAttempt = ++attempt;
      stopStreams();
      pending = [];
      dropped = 0;
      paused = false;
      if (!connection.isDataUnlocked()) {
        send({ type: "error", message: "Session expired, log in again" });
        return;
      }
      let req: ReturnType<typeof parseSearch>;
      try {
        req = parseSearch(
          (data && typeof data === "object" ? data : {}) as Record<
            string,
            unknown
          >,
        );
      } catch (error) {
        send({ type: "error", message: errorText(error, "Bad search") });
        return;
      }
      const targets = await search.targets(req.hostIds);
      if (targets.length === 0) {
        send({ type: "error", message: "No host to follow" });
        return;
      }
      if (targets.length > MAX_FOLLOW_HOSTS) {
        send({
          type: "error",
          message: `Pick at most ${MAX_FOLLOW_HOSTS} hosts to follow`,
        });
        return;
      }
      const matches = lineMatcher(req);
      const started = new Set<number>();
      const ended = new Set<number>();

      await Promise.all(
        targets.map(async ({ host, settings }) => {
          const label = hostLabel(host);
          const hostError = (message: string) =>
            send({ type: "hostError", hostId: host.id, host: label, message });
          try {
            const resolved = await ctx.ssh.resolveHost(host.id);
            if (!resolved) throw new HostScriptError("Host not found");
            const { client, dispose } = await ctx.ssh.connect<SshClient>(
              resolved,
              {
                purpose: "log-search-follow",
                profile: "stream",
                timeoutMs: 65_000,
              },
            );
            if (ws.readyState !== OPEN || myAttempt !== attempt) {
              dispose();
              return;
            }
            const stream: HostStream = { dispose, channel: null };
            streams.push(stream);
            const script = followScript(
              req.sources,
              settings.logRoots,
              req.level,
            );
            client.exec(streamCommand(script, settings.sudo), (err, ch) => {
              if (err) {
                hostError(`Could not start: ${err.message}`);
                return;
              }
              if (!streams.includes(stream)) {
                ch.close();
                return;
              }
              stream.channel = ch;
              const read = createLineReader();
              const decoder = new StringDecoder("utf-8");
              let carry = "";
              ch.on("data", (chunk) => {
                if (!chunk) return;
                const text = carry + decoder.write(chunk);
                const lines = text.split("\n");
                carry = lines.pop() ?? "";
                for (const raw of lines) {
                  if (raw === "@@READY") {
                    started.add(host.id);
                    send({ type: "hostStarted", hostId: host.id, host: label });
                    continue;
                  }
                  if (raw.startsWith("@@NOSOURCE ")) {
                    hostError(`${raw.slice(11)} is not available here`);
                    continue;
                  }
                  const line = read(raw);
                  if (!line) continue;
                  if (!levelPasses(line.level, req.level)) continue;
                  if (!originPasses(line.origin, req.origin)) continue;
                  if (!matches(line.message)) continue;
                  push({ ...line, hostId: host.id, host: label });
                }
              });
              ch.stderr.on("data", () => {});
              ch.on("error", () => {});
              ch.on("close", () => {
                ended.add(host.id);
                send({ type: "hostEnded", hostId: host.id, host: label });
                if (ended.size === targets.length) send({ type: "ended" });
              });
            });
          } catch (error) {
            ended.add(host.id);
            hostError(
              error instanceof HostScriptError
                ? error.message
                : errorText(error, "Could not connect"),
            );
          }
        }),
      );
      if (myAttempt === attempt) {
        send({ type: "started", hosts: targets.length });
      }
    };

    ws.on(
      "message",
      AsyncResource.bind(async (raw: Buffer) => {
        let message: { type?: unknown; data?: unknown };
        try {
          const text = raw.toString();
          if (text.length > MAX_MESSAGE_BYTES) throw new Error("Too large");
          message = JSON.parse(text) as typeof message;
        } catch {
          send({ type: "error", message: "Bad message" });
          return;
        }
        switch (message.type) {
          case "connect":
            await connect(message.data);
            break;
          case "pause":
            paused = message.data === true;
            break;
          case "disconnect":
            attempt++;
            stopStreams();
            break;
          default:
            break;
        }
      }),
    );
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  };

  ctx.ws.route("/follow", onConnection, { public: true, optionalAuth: true });
}
