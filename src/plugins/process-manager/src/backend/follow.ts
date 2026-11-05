import { AsyncResource } from "node:async_hooks";
import { StringDecoder } from "node:string_decoder";
import type { Client, ClientChannel } from "ssh2";
import { WebSocket, type RawData } from "ws";
import type {
  PluginContext,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";
import { readHostSettings } from "./host-settings.js";
import { streamCommand, watchdog } from "@termix-ssh/plugin-sdk/host-scripts";
import { cleanLines, logScript, needsEdit, parseTarget } from "./scripts.js";

const PING_MS = 30_000;
const FLUSH_MS = 150;
/** Most lines kept between flushes. Older ones are dropped and counted. */
const MAX_PENDING = 2000;
const MAX_MESSAGE_BYTES = 64 * 1024;

function asObject(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function normalizeAddress(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, "")
    : "";
}

function parseMessage(raw: RawData): { type: string; data: unknown } {
  const text = raw.toString();
  if (text.length > MAX_MESSAGE_BYTES) throw new Error("Message too large");
  const parsed = JSON.parse(text) as { type?: unknown; data?: unknown };
  if (!parsed || typeof parsed.type !== "string") {
    throw new Error("Message must have a type");
  }
  return { type: parsed.type, data: parsed.data };
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface Session {
  dispose: () => void;
  stream: ClientChannel | null;
}

/**
 * Live log lines for a process or app at /plugin-ws/process-manager/follow.
 *
 * Public with optionalAuth like the other plugin sockets: core still reads the
 * caller's token, and the handler refuses a socket without a user or without
 * process-manager.use. The command stops when the channel closes, see watchdog.
 */
export function registerFollow(ctx: PluginContext): void {
  const live = new Set<() => void>();
  ctx.disposables.add(() => {
    for (const end of [...live]) end();
    live.clear();
  });

  const onConnection = async (connection: PluginWebSocketConnection) => {
    const ws = connection.socket as WebSocket;
    const userId = connection.userId;
    if (!userId || !(await ctx.rbac.hasFor(userId, "use"))) {
      ws.close(1008, "Authentication required");
      return;
    }

    let session: Session | null = null;
    let attempt = 0;
    let paused = false;
    let pending: string[] = [];
    let dropped = 0;
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };

    const flushTimer = setInterval(() => {
      if (paused || (!pending.length && !dropped)) return;
      send({ type: "lines", data: pending, dropped });
      pending = [];
      dropped = 0;
    }, FLUSH_MS);
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, PING_MS);

    const push = (item: string) => {
      pending.push(item);
      if (pending.length > MAX_PENDING) {
        dropped += pending.length - MAX_PENDING;
        pending = pending.slice(-MAX_PENDING);
      }
    };

    const endSession = () => {
      if (!session) return;
      const current = session;
      session = null;
      try {
        // EOF on stdin is what stops the command on the host.
        current.stream?.end();
        current.stream?.close();
      } catch {
        // already closed
      }
      current.dispose();
    };

    const cleanup = () => {
      attempt++;
      clearInterval(flushTimer);
      clearInterval(pingTimer);
      endSession();
      live.delete(shutdown);
    };
    const shutdown = () => {
      cleanup();
      try {
        ws.close(1001, "Process Manager disabled");
      } catch {
        // already closed
      }
    };
    live.add(shutdown);

    const connect = async (data: unknown) => {
      const myAttempt = ++attempt;
      endSession();
      pending = [];
      dropped = 0;
      paused = false;
      if (!connection.isDataUnlocked()) {
        send({ type: "error", message: "Session expired, log in again" });
        return;
      }
      const payload = asObject(data);
      const hostConfig = asObject(payload.hostConfig);
      const hostId = Number(hostConfig.id);
      const syncId =
        typeof hostConfig.syncId === "string" ? hostConfig.syncId : null;
      if (!Number.isInteger(hostId) || hostId < 1) {
        send({ type: "error", message: "A host is required" });
        return;
      }

      try {
        const host = await ctx.ssh.resolveHost(hostId, { syncId });
        if (!host) {
          send({ type: "error", message: "Host not found" });
          return;
        }
        const resolvedIp = normalizeAddress(host.ip);
        if (
          !syncId &&
          resolvedIp &&
          hostConfig.ip !== undefined &&
          resolvedIp !== normalizeAddress(hostConfig.ip)
        ) {
          send({
            type: "error",
            message: "This host id points at a different machine here",
          });
          return;
        }
        const settings = await readHostSettings(ctx, host.id);
        if (!settings.enabled) {
          send({
            type: "error",
            message: "Process Manager is not turned on for this host",
          });
          return;
        }

        const target = parseTarget(payload.target);
        const access = await ctx.asUser(userId, () =>
          ctx.hosts.checkAccess(
            host.id,
            needsEdit(target) ? "edit" : "connect",
          ),
        );
        if (!access.hasAccess) {
          send({
            type: "error",
            message: needsEdit(target)
              ? "You need edit access to read open files"
              : "Host not found",
          });
          return;
        }
        const script = watchdog(
          logScript(target, {
            lines: cleanLines(payload.lines, 100),
            follow: true,
            runUser: settings.pm2User,
          }).trim(),
        );

        const { client, dispose } = await ctx.ssh.connect<Client>(host, {
          purpose: "process-manager-follow",
          profile: "stream",
          timeoutMs: 65_000,
        });
        if (ws.readyState !== WebSocket.OPEN || myAttempt !== attempt) {
          dispose();
          return;
        }
        const current: Session = { dispose, stream: null };
        session = current;

        client.exec(streamCommand(script, settings.sudo), (err, stream) => {
          if (err) {
            send({ type: "error", message: `Could not start: ${err.message}` });
            if (session === current) endSession();
            return;
          }
          if (session !== current) {
            stream.close();
            return;
          }
          current.stream = stream;
          const decoder = new StringDecoder("utf-8");
          let carry = "";
          stream.on("data", (chunk: Buffer) => {
            const text = carry + decoder.write(chunk);
            const lines = text.split("\n");
            carry = lines.pop() ?? "";
            for (const raw of lines) {
              const line = raw.replace(/\r$/, "");
              if (line.startsWith("SCRIPT_ERR:")) {
                send({
                  type: "error",
                  message: line.slice("SCRIPT_ERR:".length),
                });
                continue;
              }
              push(line);
            }
          });
          stream.stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            const own = /SCRIPT_ERR:(.*)/.exec(text)?.[1];
            if (own) send({ type: "error", message: own.trim() });
          });
          stream.on("error", () => {});
          stream.on("close", () => {
            send({ type: "ended" });
            if (session === current) endSession();
          });
          send({ type: "started" });
        });
      } catch (error) {
        send({ type: "error", message: errorText(error, "Could not follow") });
      }
    };

    ws.on(
      "message",
      AsyncResource.bind(async (raw: RawData) => {
        let message: { type: string; data: unknown };
        try {
          message = parseMessage(raw);
        } catch (error) {
          send({ type: "error", message: errorText(error, "Bad message") });
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
            endSession();
            break;
          case "ping":
            send({ type: "pong" });
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
