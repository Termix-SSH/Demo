import { AsyncResource } from "node:async_hooks";
import { StringDecoder } from "node:string_decoder";
import type { Client, ClientChannel } from "ssh2";
import { WebSocket, type RawData } from "ws";
import type {
  PluginContext,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";
import { readHostSettings } from "./host-settings.js";
import type { VmProvider } from "./provider.js";
import { requireUuid } from "./validate.js";

const PING_MS = 30_000;

interface Session {
  dispose: () => void;
  stream: ClientChannel | null;
}

function dimension(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number < 1000 ? number : 0;
}

/**
 * The serial console at /plugin-ws/virtual-machines/console.
 *
 * Public with optionalAuth: core still resolves the caller's token, and the
 * handler refuses a socket without a user or without the console permission.
 */
export function registerConsole(
  ctx: PluginContext,
  provider: VmProvider,
): void {
  const live = new Set<() => void>();
  ctx.disposables.add(() => {
    for (const end of [...live]) end();
    live.clear();
  });

  const onConnection = async (connection: PluginWebSocketConnection) => {
    const ws = connection.socket as WebSocket;
    const userId = connection.userId;
    if (
      !userId ||
      !(await ctx.rbac.hasFor(userId, "use")) ||
      !(await ctx.rbac.hasFor(userId, "console"))
    ) {
      ws.close(1008, "Authentication required");
      return;
    }

    let session: Session | null = null;
    let attempt = 0;
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };
    const endSession = () => {
      if (!session) return;
      const current = session;
      session = null;
      current.stream?.end();
      current.dispose();
    };
    const pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, PING_MS);
    const cleanup = () => {
      attempt++;
      clearInterval(pingTimer);
      endSession();
      live.delete(shutdown);
    };
    const shutdown = () => {
      cleanup();
      try {
        ws.close(1001, "Plugin disabled");
      } catch {
        // already closed
      }
    };
    live.add(shutdown);

    const connect = async (data: Record<string, unknown>) => {
      const mine = ++attempt;
      if (!connection.isDataUnlocked()) {
        send({ type: "error", message: "Session expired. Log in again." });
        return;
      }
      const hostId = Number(data.hostId);
      const cols = dimension(data.cols) || 80;
      const rows = dimension(data.rows) || 24;
      endSession();
      try {
        const uuid = requireUuid(data.uuid);
        const access = await ctx.hosts.checkAccess(hostId, "edit");
        if (!access.hasAccess) {
          send({ type: "error", message: "You need edit access to this host" });
          return;
        }
        const settings = await readHostSettings(ctx, hostId);
        if (!settings.enabled) {
          send({
            type: "error",
            message: "Virtual Machines is not turned on for this host",
          });
          return;
        }
        const host = await ctx.ssh.resolveHost(hostId);
        if (!host) {
          send({ type: "error", message: "Host not found" });
          return;
        }
        const { client, dispose } = await ctx.ssh.connect<Client>(host, {
          purpose: "virtual-machines-console",
          profile: "stream",
          timeoutMs: 65_000,
        });
        if (ws.readyState !== WebSocket.OPEN || mine !== attempt) {
          dispose();
          return;
        }
        const current: Session = { dispose, stream: null };
        session = current;
        void ctx.audit.record({
          action: "virtual-machines.console",
          resourceType: "host",
          resourceId: String(hostId),
          resourceName: uuid,
          success: true,
        });
        client.exec(
          provider.serialCommand({ hostId, settings }, uuid),
          { pty: { term: "xterm-256color", cols, rows } },
          (err, stream) => {
            if (err) {
              send({ type: "error", message: err.message });
              return;
            }
            if (session !== current) {
              stream.end();
              return;
            }
            current.stream = stream;
            const decoder = new StringDecoder("utf-8");
            stream.on("data", (chunk: Buffer) => {
              const text = decoder.write(chunk);
              if (text) send({ type: "output", data: text });
            });
            stream.stderr.on("data", (chunk: Buffer) => {
              send({ type: "output", data: chunk.toString() });
            });
            stream.stderr.on("error", () => {});
            stream.on("error", (streamErr: Error) => {
              send({ type: "error", message: streamErr.message });
            });
            stream.on("close", () => {
              send({ type: "disconnected" });
              if (session === current) endSession();
            });
            send({ type: "connected" });
          },
        );
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Could not connect",
        });
      }
    };

    ws.on(
      "message",
      AsyncResource.bind(async (raw: RawData) => {
        let message: { type?: string; data?: unknown };
        try {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          message = JSON.parse(raw.toString()) as typeof message;
        } catch {
          return;
        }
        const data = (message.data ?? {}) as Record<string, unknown>;
        if (message.type === "connect") {
          await connect(data);
        } else if (message.type === "input") {
          if (typeof message.data === "string") {
            session?.stream?.write(message.data);
          }
        } else if (message.type === "resize") {
          const cols = dimension(data.cols);
          const rows = dimension(data.rows);
          if (cols && rows) session?.stream?.setWindow(rows, cols, rows, cols);
        } else if (message.type === "disconnect") {
          attempt++;
          endSession();
        } else if (message.type === "ping") {
          send({ type: "pong" });
        }
      }),
    );
    ws.on("close", cleanup);
    ws.on("error", cleanup);
  };

  ctx.ws.route("/console", onConnection, { public: true, optionalAuth: true });
}
