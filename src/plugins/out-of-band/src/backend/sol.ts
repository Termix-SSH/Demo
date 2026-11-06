import { AsyncResource } from "node:async_hooks";
import type {
  PluginContext,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";
import { connectionArgs } from "./drivers/ipmi.js";
import { shellQuote } from "./ipmitool.js";
import type { Service } from "./service.js";

const OPEN = 1;
const PING_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const READY = "OOB_READY";

interface Socket {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  ping: () => void;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
}

interface Stream {
  write: (data: string) => unknown;
  end: (data?: string) => unknown;
  close: () => void;
  setWindow: (
    rows: number,
    cols: number,
    height: number,
    width: number,
  ) => void;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
}

interface ExecClient {
  exec: (
    command: string,
    options: { pty: { rows: number; cols: number; term: string } },
    callback: (error: Error | undefined, stream: Stream) => void,
  ) => unknown;
}

/** The command a relay host runs. The password arrives on stdin with echo off, never in argv. */
export function solCommand(args: string[]): string {
  const inner = [
    "stty -echo",
    `echo ${READY}`,
    "IFS= read -r B",
    "stty echo",
    'export IPMI_PASSWORD="$(printf %s "$B" | base64 -d)"',
    `exec ipmitool ${args.map(shellQuote).join(" ")}`,
  ].join("; ");
  return `bash -c ${shellQuote(inner)}`;
}

/**
 * Serial over LAN at /plugin-ws/out-of-band/sol. Needs a relay host with
 * ipmitool: ctx.process.run has no stdin, so the Termix server cannot type
 * into a console itself.
 */
export function registerSol(ctx: PluginContext, service: Service): void {
  const live = new Set<() => void>();
  ctx.disposables.add(() => {
    for (const end of [...live]) end();
    live.clear();
  });

  const onConnection = async (connection: PluginWebSocketConnection) => {
    const ws = connection.socket as Socket;
    const userId = connection.userId;
    if (!userId || !(await ctx.rbac.hasFor(userId, "console"))) {
      ws.close(1008, "Not allowed");
      return;
    }
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(message));
    };

    let stream: Stream | null = null;
    let dispose: (() => void) | null = null;
    let attempt = 0;
    const pingTimer = setInterval(() => {
      if (ws.readyState === OPEN) ws.ping();
    }, PING_MS);

    const endSession = () => {
      const current = stream;
      stream = null;
      try {
        current?.end();
        current?.close();
      } catch {
        // already closed
      }
      dispose?.();
      dispose = null;
    };
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
      endSession();
      if (!connection.isDataUnlocked()) {
        send({ type: "error", message: "Session expired, log in again" });
        return;
      }
      try {
        const id = Number(data.id);
        const target = await service.consoleTarget(id);
        const device = await service.get(id);
        if (device.hostId !== null) {
          const access = await ctx.asUser(userId, () =>
            ctx.hosts.checkAccess(device.hostId as number, "edit"),
          );
          if (!access.hasAccess) {
            send({
              type: "error",
              message: "You need edit access to this host",
            });
            return;
          }
        }
        const relay = target.options.relayHostId;
        if (!relay) {
          send({
            type: "error",
            message: "The serial console needs a relay host with ipmitool",
          });
          return;
        }
        const connected = await ctx.asUser(userId, () =>
          ctx.ssh.connect<ExecClient>(relay, {
            purpose: "out-of-band-sol",
            profile: "stream",
            timeoutMs: 30_000,
          } as never),
        );
        if (ws.readyState !== OPEN || mine !== attempt) {
          connected.dispose();
          return;
        }
        dispose = connected.dispose;
        const command = solCommand([
          ...connectionArgs(target),
          "sol",
          "activate",
        ]);
        const password = Buffer.from(
          target.credentials.password ?? "",
        ).toString("base64");
        const cols = Math.min(400, Math.max(20, Number(data.cols) || 80));
        const rows = Math.min(200, Math.max(5, Number(data.rows) || 24));
        connected.client.exec(
          command,
          { pty: { rows, cols, term: "xterm-256color" } },
          (error, channel) => {
            if (error) {
              send({
                type: "error",
                message: `Could not start: ${error.message}`,
              });
              endSession();
              return;
            }
            if (mine !== attempt) {
              channel.close();
              return;
            }
            stream = channel;
            let ready = false;
            let buffer = "";
            channel.on("data", ((chunk: Buffer) => {
              const text = chunk.toString("utf8");
              if (ready) {
                send({ type: "output", data: text });
                return;
              }
              buffer += text;
              const at = buffer.indexOf(READY);
              if (at === -1) return;
              ready = true;
              const after = buffer
                .slice(at + READY.length)
                .replace(/^\r?\n/, "");
              channel.write(`${password}\n`);
              send({ type: "started" });
              if (after) send({ type: "output", data: after });
            }) as never);
            channel.on("error", (() => {}) as never);
            channel.on("close", (() => {
              send({ type: "ended" });
              if (stream === channel) endSession();
            }) as never);
          },
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not connect";
        send({ type: "error", message });
      }
    };

    ws.on(
      "message",
      AsyncResource.bind(async (raw: { toString: () => string }) => {
        let message: { type?: unknown; data?: unknown };
        try {
          const text = raw.toString();
          if (text.length > MAX_MESSAGE_BYTES)
            throw new Error("Message too large");
          message = JSON.parse(text);
        } catch {
          send({ type: "error", message: "Bad message" });
          return;
        }
        switch (message.type) {
          case "connect":
            await connect(
              message.data && typeof message.data === "object"
                ? (message.data as Record<string, unknown>)
                : {},
            );
            break;
          case "input":
            if (typeof message.data === "string") stream?.write(message.data);
            break;
          case "resize": {
            const size = (message.data ?? {}) as {
              cols?: number;
              rows?: number;
            };
            const cols = Math.min(400, Math.max(20, Number(size.cols) || 80));
            const rows = Math.min(200, Math.max(5, Number(size.rows) || 24));
            stream?.setWindow(rows, cols, 0, 0);
            break;
          }
          case "disconnect":
            attempt++;
            endSession();
            break;
          default:
            break;
        }
      }) as never,
    );
    ws.on("close", cleanup as never);
    ws.on("error", cleanup as never);
  };

  ctx.ws.route("/sol", onConnection, { public: true, optionalAuth: true });
}
